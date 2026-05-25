import type { SupabaseClient } from '@supabase/supabase-js'
import {
  billIsFullySettled,
  folioPositiveOutstandingSum,
  type FolioLineForBalance,
} from '@/lib/utils/booking-bill-balance'
import { insertFolioCharges } from '@/lib/utils/insert-folio-charges'

export async function fetchGuestCityLedgerAccount(
  supabase: SupabaseClient,
  organizationId: string,
  guestName: string,
) {
  const rows = await fetchAllGuestCityLedgerAccounts(
    supabase,
    organizationId,
    guestName,
  )
  if (!rows.length) return null
  return rows.reduce((best, row) =>
    Number(row.balance ?? 0) > Number(best.balance ?? 0) ? row : best,
  )
}

/** All individual/guest ledger rows for this name (handles duplicates / spelling variants). */
export async function fetchAllGuestCityLedgerAccounts(
  supabase: SupabaseClient,
  organizationId: string,
  guestName: string,
) {
  if (!guestName?.trim()) return []
  const { data } = await supabase
    .from('city_ledger_accounts')
    .select('id, balance, account_name, account_type')
    .eq('organization_id', organizationId)
    .ilike('account_name', guestName.trim())
    .in('account_type', ['individual', 'guest'])
  return data || []
}

/** Keep every name-matched guest ledger row on the same balance (avoids orphan ₦70k rows). */
export async function syncGuestCityLedgerBalances(
  supabase: SupabaseClient,
  args: {
    organizationId: string
    guestName: string
    balance: number
    primaryAccountId?: string | null
  },
): Promise<number> {
  const { organizationId, guestName, balance, primaryAccountId } = args
  const accounts = await fetchAllGuestCityLedgerAccounts(
    supabase,
    organizationId,
    guestName,
  )
  const ids = new Set<string>()
  for (const a of accounts) ids.add(a.id)
  if (primaryAccountId) ids.add(primaryAccountId)

  if (ids.size === 0) {
    if (balance === 0) return 0
    const { error } = await supabase.from('city_ledger_accounts').insert([
      {
        organization_id: organizationId,
        account_name: guestName.trim(),
        account_type: 'individual',
        balance,
      },
    ])
    if (error) throw new Error(`Ledger insert failed: ${error.message}`)
    return 1
  }

  const { error } = await supabase
    .from('city_ledger_accounts')
    .update({ balance, updated_at: new Date().toISOString() })
    .in('id', [...ids])
  if (error) throw new Error(`Ledger sync failed: ${error.message}`)
  return ids.size
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

async function fetchBookingsForGuestSettlement(
  supabase: SupabaseClient,
  guestId: string,
  organizationId: string,
) {
  const { data: byGuest } = await supabase
    .from('bookings')
    .select('id, balance, deposit, total_amount, check_in, organization_id')
    .eq('guest_id', guestId)
    .order('check_in', { ascending: true })

  const rows = byGuest || []
  const inOrg = rows.filter(
    (b) =>
      !b.organization_id ||
      String(b.organization_id) === String(organizationId),
  )
  return inOrg.length > 0 ? inOrg : rows
}

/** Sum unpaid folio amounts across all guest bookings (matches guest profile card). */
export async function guestFolioOutstandingTotal(
  supabase: SupabaseClient,
  guestId: string,
  _organizationId: string,
): Promise<number> {
  const bookings = await fetchBookingsForGuestSettlement(
    supabase,
    guestId,
    _organizationId,
  )
  if (!bookings.length) return 0

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
    total += Math.max(0, folioPositiveOutstandingSum(byBooking[bk.id] ?? []))
  }
  return Math.round(total * 100) / 100
}

async function markBookingFolioSettled(
  supabase: SupabaseClient,
  bookingId: string,
): Promise<void> {
  const { error } = await supabase
    .from('folio_charges')
    .update({ payment_status: 'paid' })
    .eq('booking_id', bookingId)
    .gt('amount', 0)
    .not('charge_type', 'eq', 'payment')
  if (error) throw new Error(`Folio settle failed: ${error.message}`)
}

/** When cash received covers folio math but statuses are stale, mark lines paid and zero booking. */
async function forceClearGuestBookingFolio(
  supabase: SupabaseClient,
  bookingId: string,
  deposit: number,
): Promise<void> {
  await markBookingFolioSettled(supabase, bookingId)
  const { error } = await supabase
    .from('bookings')
    .update({
      balance: 0,
      deposit,
      payment_status: 'paid',
    })
    .eq('id', bookingId)
  if (error) throw new Error(`Booking clear failed: ${error.message}`)
}

/**
 * Apply cash received against open folios (checked-out stays included).
 * Uses the same folio net rules as the guest profile "Outstanding Balance" card.
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

  const bookings = await fetchBookingsForGuestSettlement(
    supabase,
    guestId,
    organizationId,
  )
  if (!bookings.length) return 0

  let remaining = amount
  let applied = 0

  for (const bk of bookings) {
    if (remaining <= 0) break

    const { data: fcRows } = await supabase
      .from('folio_charges')
      .select('amount, charge_type, payment_status, payment_method')
      .eq('booking_id', bk.id)

    const fcForBill = mapFolioRows(fcRows || [])
    const billBefore = Math.max(0, folioPositiveOutstandingSum(fcForBill))
    if (billBefore <= 0) continue

    const slice = Math.min(remaining, billBefore)
    const methodLabel = paymentMethod.replace(/_/g, ' ')
    const bookingOrgId = bk.organization_id || organizationId

    const { error: payErr } = await insertFolioCharges(supabase, [
      {
        booking_id: bk.id,
        organization_id: bookingOrgId,
        description: `Payment Received - ${methodLabel}${notes ? ` | ${notes}` : ''}`,
        amount: -slice,
        charge_type: 'payment',
        payment_method: paymentMethod,
        payment_status: 'paid',
        created_by: userId,
      },
    ])
    if (payErr) throw new Error(`Folio payment failed: ${payErr.message}`)

    const { data: fcAfter } = await supabase
      .from('folio_charges')
      .select('amount, charge_type, payment_status, payment_method')
      .eq('booking_id', bk.id)

    const fcAfterMapped = mapFolioRows(fcAfter || [])
    const netAfter = folioPositiveOutstandingSum(fcAfterMapped)
    const bookingBalance = Math.max(0, netAfter)

    const { error: bkErr } = await supabase
      .from('bookings')
      .update({
        balance: bookingBalance,
        deposit: Number(bk.deposit || 0) + slice,
        payment_status: bookingBalance === 0 ? 'paid' : 'partial',
      })
      .eq('id', bk.id)
    if (bkErr) throw new Error(`Booking update failed: ${bkErr.message}`)

    if (billIsFullySettled(null, fcAfterMapped) || slice >= billBefore - 0.005) {
      await forceClearGuestBookingFolio(
        supabase,
        bk.id,
        Number(bk.deposit || 0) + slice,
      )
    }

    remaining -= slice
    applied += slice
  }

  return Math.round(applied * 100) / 100
}

/** Mark every open charge paid when settlement cash covers total folio debt but net is stuck. */
async function repairGuestFolioAfterFullSettlement(
  supabase: SupabaseClient,
  guestId: string,
  organizationId: string,
  amountPaid: number,
  folioDebtBefore: number,
): Promise<void> {
  if (amountPaid + 0.005 < folioDebtBefore) return

  const bookings = await fetchBookingsForGuestSettlement(
    supabase,
    guestId,
    organizationId,
  )
  for (const bk of bookings) {
    const { data: fcRows } = await supabase
      .from('folio_charges')
      .select('amount, charge_type, payment_status, payment_method')
      .eq('booking_id', bk.id)
    const net = folioPositiveOutstandingSum(mapFolioRows(fcRows || []))
    if (net <= 0.005) {
      await forceClearGuestBookingFolio(
        supabase,
        bk.id,
        Number(bk.deposit || 0),
      )
      continue
    }
    await markBookingFolioSettled(supabase, bk.id)
    const { data: fcAfter } = await supabase
      .from('folio_charges')
      .select('amount, charge_type, payment_status, payment_method')
      .eq('booking_id', bk.id)
    let netAfter = folioPositiveOutstandingSum(mapFolioRows(fcAfter || []))
    if (netAfter > 0.005) {
      const bookingOrgId = bk.organization_id || organizationId
      const { error: payErr } = await insertFolioCharges(supabase, [
        {
          booking_id: bk.id,
          organization_id: bookingOrgId,
          description: 'City ledger settlement (balance repair)',
          amount: -netAfter,
          charge_type: 'payment',
          payment_method: 'cash',
          payment_status: 'paid',
        },
      ])
      if (payErr) throw new Error(`Folio repair payment failed: ${payErr.message}`)
      netAfter = 0
    }
    await supabase
      .from('bookings')
      .update({
        balance: Math.max(0, netAfter),
        payment_status: netAfter <= 0.005 ? 'paid' : 'partial',
      })
      .eq('id', bk.id)
  }
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

  const folioBefore =
    isSettlement && syncGuestProfile && guestId
      ? await guestFolioOutstandingTotal(supabase, guestId, organizationId)
      : 0

  let appliedToFolio = 0
  if (isSettlement && syncGuestProfile && guestId) {
    appliedToFolio = await applyGuestSettlementToFolios(supabase, {
      organizationId,
      guestId,
      amount,
      paymentMethod,
      userId,
      notes,
    })
  }

  let folioRemaining =
    syncGuestProfile && guestId
      ? await guestFolioOutstandingTotal(supabase, guestId, organizationId)
      : null

  if (
    isSettlement &&
    syncGuestProfile &&
    guestId &&
    folioBefore > 0.005 &&
    folioRemaining != null &&
    folioRemaining > 0.005 &&
    amount + 0.005 >= folioBefore
  ) {
    await repairGuestFolioAfterFullSettlement(
      supabase,
      guestId,
      organizationId,
      amount,
      folioBefore,
    )
    folioRemaining = await guestFolioOutstandingTotal(
      supabase,
      guestId,
      organizationId,
    )
  }

  if (
    isSettlement &&
    syncGuestProfile &&
    guestId &&
    folioBefore > 0.005 &&
    folioRemaining != null &&
    folioRemaining > 0.005 &&
    amount + 0.005 < folioBefore
  ) {
    throw new Error(
      'Payment amount is less than the outstanding folio balance. Enter the full amount or settle from the booking folio.',
    )
  }

  const ledgerAfterCash = Math.max(0, currentLedgerBalance - amount)

  // Ledger-only stale debit (folio already clear but city_ledger_accounts still shows debt).
  if (
    isSettlement &&
    (folioBefore <= 0.005 || (folioRemaining != null && folioRemaining <= 0.005)) &&
    currentLedgerBalance > 0.005
  ) {
    folioRemaining = 0
  }

  const finalLedgerBalance =
    folioRemaining != null
      ? Math.max(0, folioRemaining)
      : ledgerAfterCash

  if (
    isSettlement &&
    syncGuestProfile &&
    guestId &&
    folioBefore > 0.005 &&
    finalLedgerBalance > 0.005 &&
    amount + 0.005 >= folioBefore
  ) {
    throw new Error(
      `₦${finalLedgerBalance.toLocaleString()} is still outstanding after payment. Open the booking folio and record payment there, or contact support.`,
    )
  }

  if (isSettlement && syncGuestProfile) {
    await syncGuestCityLedgerBalances(supabase, {
      organizationId,
      guestName: accountName,
      balance: finalLedgerBalance,
      primaryAccountId: ledgerAccountId,
    })
  } else if (ledgerAccountId) {
    const { error } = await supabase
      .from('city_ledger_accounts')
      .update({
        balance: finalLedgerBalance,
        updated_at: new Date().toISOString(),
      })
      .eq('id', ledgerAccountId)
    if (error) throw new Error(`Ledger update failed: ${error.message}`)
  } else if (finalLedgerBalance !== 0 || amount > 0) {
    await syncGuestCityLedgerBalances(supabase, {
      organizationId,
      guestName: accountName,
      balance: finalLedgerBalance,
    })
  }

  if (syncGuestProfile && guestId) {
    const guestBalance =
      folioRemaining != null ? folioRemaining : Math.max(0, finalLedgerBalance)
    const { error: gErr } = await supabase
      .from('guests')
      .update({ balance: guestBalance })
      .eq('id', guestId)
    if (gErr) throw new Error(`Guest balance update failed: ${gErr.message}`)
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
  if (txError) throw new Error(`Transaction insert failed: ${txError.message}`)
}

export type RepairStaleGuestDebtResult = {
  folio_before: number
  folio_after: number
  bookings_touched: number
  ledger_accounts_synced: number
}

/**
 * Admin repair: mark stale folio lines paid, zero bookings/ledger/guest balance.
 * Use when Settle records transactions but UI debt from an old checkout remains.
 */
export async function repairStaleGuestDebt(
  supabase: SupabaseClient,
  args: {
    organizationId: string
    guestId: string
    guestName: string
  },
): Promise<RepairStaleGuestDebtResult> {
  const { organizationId, guestId, guestName } = args
  const folioBefore = await guestFolioOutstandingTotal(
    supabase,
    guestId,
    organizationId,
  )

  const bookings = await fetchBookingsForGuestSettlement(
    supabase,
    guestId,
    organizationId,
  )

  for (const bk of bookings) {
    await markBookingFolioSettled(supabase, bk.id)

    const { data: fcRows } = await supabase
      .from('folio_charges')
      .select('amount, charge_type, payment_status, payment_method')
      .eq('booking_id', bk.id)

    let net = folioPositiveOutstandingSum(mapFolioRows(fcRows || []))
    if (net > 0.005) {
      const bookingOrgId = bk.organization_id || organizationId
      const { error: payErr } = await insertFolioCharges(supabase, [
        {
          booking_id: bk.id,
          organization_id: bookingOrgId,
          description: 'Balance repair — stale folio cleared',
          amount: -net,
          charge_type: 'payment',
          payment_method: 'cash',
          payment_status: 'paid',
        },
      ])
      if (payErr) throw new Error(`Folio repair payment failed: ${payErr.message}`)
      net = 0
    }

    const { error: bkErr } = await supabase
      .from('bookings')
      .update({
        balance: Math.max(0, net),
        payment_status: 'paid',
      })
      .eq('id', bk.id)
    if (bkErr) throw new Error(`Booking repair failed: ${bkErr.message}`)
  }

  const folioAfter = await guestFolioOutstandingTotal(
    supabase,
    guestId,
    organizationId,
  )
  const targetLedger = Math.max(0, folioAfter)

  const ledger_accounts_synced = await syncGuestCityLedgerBalances(supabase, {
    organizationId,
    guestName,
    balance: targetLedger,
  })

  const { error: gErr } = await supabase
    .from('guests')
    .update({ balance: targetLedger })
    .eq('id', guestId)
  if (gErr) throw new Error(`Guest balance repair failed: ${gErr.message}`)

  return {
    folio_before: folioBefore,
    folio_after: folioAfter,
    bookings_touched: bookings.length,
    ledger_accounts_synced,
  }
}
