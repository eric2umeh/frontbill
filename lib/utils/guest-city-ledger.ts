import type { SupabaseClient } from '@supabase/supabase-js'
import {
  bookingDisplayBillBalance,
  type FolioLineForBalance,
} from '@/lib/utils/booking-bill-balance'

export async function fetchGuestCityLedgerAccount(
  supabase: SupabaseClient,
  organizationId: string,
  guestName: string,
) {
  if (!guestName?.trim()) return null
  const { data } = await supabase
    .from('city_ledger_accounts')
    .select('id, balance')
    .eq('organization_id', organizationId)
    .ilike('account_name', guestName)
    .in('account_type', ['individual', 'guest'])
    .maybeSingle()
  return data
}

function isLedgerSettlementType(transactionType: string): boolean {
  return transactionType.toLowerCase().includes('settlement')
}

function mapFolioRows(
  rows: {
    amount?: unknown
    charge_type?: string | null
    payment_status?: string | null
    payment_method?: string | null
  }[],
): FolioLineForBalance[] {
  return rows.map((row) => ({
    amount: row.amount,
    charge_type: row.charge_type,
    payment_status: row.payment_status,
    payment_method: row.payment_method,
  }))
}

/** Sum unpaid folio amounts across all guest bookings (matches guest profile card). */
export async function guestFolioOutstandingTotal(
  supabase: SupabaseClient,
  guestId: string,
  organizationId: string,
): Promise<number> {
  const { data: bookings } = await supabase
    .from('bookings')
    .select('id, balance, deposit, total_amount')
    .eq('guest_id', guestId)
    .eq('organization_id', organizationId)

  if (!bookings?.length) return 0

  const bookingIds = bookings.map((b) => b.id)
  const { data: charges } = await supabase
    .from('folio_charges')
    .select('booking_id, amount, charge_type, payment_status, payment_method')
    .in('booking_id', bookingIds)

  const byBooking: Record<string, FolioLineForBalance[]> = {}
  for (const c of charges || []) {
    const bid = String((c as { booking_id?: string }).booking_id || '')
    if (!bid) continue
    if (!byBooking[bid]) byBooking[bid] = []
    byBooking[bid].push({
      amount: (c as { amount?: unknown }).amount,
      charge_type: (c as { charge_type?: string | null }).charge_type,
      payment_status: (c as { payment_status?: string | null }).payment_status,
      payment_method: (c as { payment_method?: string | null }).payment_method,
    })
  }

  let total = 0
  for (const bk of bookings) {
    const net = bookingDisplayBillBalance(
      {
        balance: bk.balance,
        deposit: bk.deposit,
        total_amount: bk.total_amount,
      },
      byBooking[bk.id] ?? [],
    )
    total += Math.max(0, net)
  }
  return Math.round(total * 100) / 100
}

/**
 * Apply cash received against open folios (checked-out stays included).
 * Inserts payment lines and marks charge rows paid when a booking is fully cleared.
 */
export async function applyGuestSettlementToFolios(
  supabase: SupabaseClient,
  args: {
    organizationId: string
    guestId: string
    amount: number
    paymentMethod: string
    userId: string
    notes?: string
  },
): Promise<number> {
  const { organizationId, guestId, amount, paymentMethod, userId, notes } = args
  if (amount <= 0) return 0

  const { data: bookings } = await supabase
    .from('bookings')
    .select('id, balance, deposit, total_amount, check_in')
    .eq('guest_id', guestId)
    .eq('organization_id', organizationId)
    .order('check_in', { ascending: true })

  if (!bookings?.length) return 0

  let remaining = amount
  let applied = 0

  for (const bk of bookings) {
    if (remaining <= 0) break

    const { data: fcRows } = await supabase
      .from('folio_charges')
      .select('amount, charge_type, payment_status, payment_method')
      .eq('booking_id', bk.id)

    const fcForBill = mapFolioRows(fcRows || [])
    const billBefore = bookingDisplayBillBalance(
      {
        balance: bk.balance,
        deposit: bk.deposit,
        total_amount: bk.total_amount,
      },
      fcForBill,
    )
    if (billBefore <= 0) continue

    const slice = Math.min(remaining, billBefore)
    const methodLabel = paymentMethod.replace(/_/g, ' ')

    const { error: payErr } = await supabase.from('folio_charges').insert([
      {
        booking_id: bk.id,
        organization_id: organizationId,
        description: `Payment Received - ${methodLabel}${notes ? ` | ${notes}` : ''}`,
        amount: -slice,
        charge_type: 'payment',
        payment_method: paymentMethod,
        payment_status: 'paid',
        created_by: userId,
      },
    ])
    if (payErr) throw new Error(`Folio payment failed: ${payErr.message}`)

    const newBalance = Math.max(0, billBefore - slice)
    const newDeposit = Number(bk.deposit || 0) + slice

    const { error: bkErr } = await supabase
      .from('bookings')
      .update({
        balance: newBalance,
        deposit: newDeposit,
        payment_status: newBalance === 0 ? 'paid' : 'partial',
      })
      .eq('id', bk.id)
    if (bkErr) throw new Error(`Booking update failed: ${bkErr.message}`)

    if (newBalance === 0) {
      const { error: fcErr } = await supabase
        .from('folio_charges')
        .update({ payment_status: 'paid' })
        .eq('booking_id', bk.id)
        .gt('amount', 0)
        .not('charge_type', 'eq', 'payment')
      if (fcErr) throw new Error(`Folio settle failed: ${fcErr.message}`)
    }

    remaining -= slice
    applied += slice
  }

  return Math.round(applied * 100) / 100
}

/**
 * Apply cash received against the guest's city ledger row.
 * Positive balance = guest owes the hotel; subtracting payment can go negative (credit).
 */
export async function applyPaymentToGuestCityLedger(
  supabase: SupabaseClient,
  args: {
    organizationId: string
    guestName: string
    paymentAmount: number
    createIfMissingExcess?: number
  },
): Promise<void> {
  const { organizationId, guestName, paymentAmount, createIfMissingExcess = 0 } = args
  const P = paymentAmount
  if (P <= 0 && createIfMissingExcess <= 0) return

  const acct = await fetchGuestCityLedgerAccount(supabase, organizationId, guestName)
  if (acct?.id) {
    const newBal = (Number(acct.balance) || 0) - P
    const { error } = await supabase
      .from('city_ledger_accounts')
      .update({ balance: newBal, updated_at: new Date().toISOString() })
      .eq('id', acct.id)
    if (error) throw new Error(`Ledger update failed: ${error.message}`)
    return
  }

  const excess = createIfMissingExcess
  if (excess > 0) {
    const { error } = await supabase.from('city_ledger_accounts').insert([
      {
        organization_id: organizationId,
        account_name: guestName,
        account_type: 'individual',
        balance: -excess,
      },
    ])
    if (error) throw new Error(`Ledger insert failed: ${error.message}`)
  }
}

/**
 * When recording a booking folio payment: reduce ledger debit first, then post any amount over bill balance as credit.
 */
export async function applyBookingPaymentToGuestLedger(
  supabase: SupabaseClient,
  args: {
    organizationId: string
    guestName: string
    bookingBillBefore: number
    paymentAmount: number
  },
): Promise<void> {
  const { organizationId, guestName, bookingBillBefore, paymentAmount } = args
  const P = paymentAmount
  const B = Math.max(0, bookingBillBefore)
  if (P <= 0 || !guestName.trim()) return

  const acct = await fetchGuestCityLedgerAccount(supabase, organizationId, guestName)
  const L = acct?.id ? (Number(acct.balance) || 0) : 0
  const excess = Math.max(0, P - B)
  const towardDebit = Math.min(Math.max(P - excess, 0), Math.max(0, L))
  const newBal = L - towardDebit - excess

  if (acct?.id) {
    const { error } = await supabase
      .from('city_ledger_accounts')
      .update({ balance: newBal, updated_at: new Date().toISOString() })
      .eq('id', acct.id)
    if (error) throw new Error(`Ledger update failed: ${error.message}`)
    return
  }

  if (newBal >= 0) return
  const { error } = await supabase.from('city_ledger_accounts').insert([
    {
      organization_id: organizationId,
      account_name: guestName,
      account_type: 'individual',
      balance: newBal,
    },
  ])
  if (error) throw new Error(`Ledger insert failed: ${error.message}`)
}

/**
 * Record money-in on a guest city ledger (settle / add credit from guest profile or booking UI).
 * Settlements also post to folio charges so guest outstanding balance clears in the UI.
 */
export async function recordGuestLedgerCashMovement(
  supabase: SupabaseClient,
  p: {
    organizationId: string
    accountName: string
    guestId: string | null
    amount: number
    paymentMethod: string
    notes?: string
    transactionType: string
    userId: string
    ledgerAccountId: string | null
    currentLedgerBalance: number
    syncGuestProfile: boolean
  },
): Promise<void> {
  const {
    organizationId,
    accountName,
    guestId,
    amount,
    paymentMethod,
    notes,
    transactionType,
    userId,
    ledgerAccountId,
    currentLedgerBalance,
    syncGuestProfile,
  } = p
  if (amount <= 0) return

  const isSettlement = isLedgerSettlementType(transactionType)

  if (isSettlement && syncGuestProfile && guestId) {
    await applyGuestSettlementToFolios(supabase, {
      organizationId,
      guestId,
      amount,
      paymentMethod,
      userId,
      notes,
    })
  }

  const folioRemaining =
    syncGuestProfile && guestId
      ? await guestFolioOutstandingTotal(supabase, guestId, organizationId)
      : null

  const ledgerAfterCash = currentLedgerBalance - amount
  const finalLedgerBalance =
    folioRemaining != null && folioRemaining <= 0 && ledgerAfterCash < 0
      ? ledgerAfterCash
      : folioRemaining != null
        ? folioRemaining
        : ledgerAfterCash

  if (ledgerAccountId) {
    const { error } = await supabase
      .from('city_ledger_accounts')
      .update({
        balance: finalLedgerBalance,
        updated_at: new Date().toISOString(),
      })
      .eq('id', ledgerAccountId)
    if (error) throw new Error(`Ledger update failed: ${error.message}`)
  } else if (finalLedgerBalance !== 0 || amount > 0) {
    const { error } = await supabase.from('city_ledger_accounts').insert([
      {
        organization_id: organizationId,
        account_name: accountName,
        account_type: 'individual',
        balance: finalLedgerBalance,
      },
    ])
    if (error) throw new Error(`Ledger insert failed: ${error.message}`)
  }

  if (syncGuestProfile && guestId) {
    const guestBalance =
      folioRemaining != null ? folioRemaining : Math.max(0, finalLedgerBalance)
    const { error: gErr } = await supabase
      .from('guests')
      .update({ balance: guestBalance })
      .eq('id', guestId)
    if (gErr) console.warn('Guest balance update:', gErr.message)
  }

  const txId = `CLG-${Date.now()}`
  const { error: txError } = await supabase.from('transactions').insert([
    {
      organization_id: organizationId,
      booking_id: null,
      transaction_id: txId,
      guest_name: accountName,
      room: null,
      amount,
      payment_method: paymentMethod,
      status: 'paid',
      description: `${transactionType} — ${accountName}${notes ? ` | ${notes}` : ''}`,
      received_by: userId,
    },
  ])
  if (txError) console.warn('Transaction insert:', txError.message)
}
