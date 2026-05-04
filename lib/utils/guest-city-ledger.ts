import type { SupabaseClient } from '@supabase/supabase-js'

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

/**
 * Apply cash received against the guest's city ledger row.
 * Positive balance = guest owes the hotel; subtracting payment can go negative (credit).
 * If there is no ledger row, only creates one when `createIfMissingExcess` > 0 (typical overpayment not already on ledger).
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
    const { error } = await supabase.from('city_ledger_accounts').insert([{
      organization_id: organizationId,
      account_name: guestName,
      account_type: 'individual',
      balance: -excess,
    }])
    if (error) throw new Error(`Ledger insert failed: ${error.message}`)
  }
}

/**
 * When recording a booking folio payment: reduce ledger debit first, then post any amount over bill balance as credit.
 * Avoids putting the full cash received on ledger when unpaid charges exist only on the booking row (ledger was 0).
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
  const { error } = await supabase.from('city_ledger_accounts').insert([{
    organization_id: organizationId,
    account_name: guestName,
    account_type: 'individual',
    balance: newBal,
  }])
  if (error) throw new Error(`Ledger insert failed: ${error.message}`)
}

/**
 * Record money-in on a guest city ledger (settle / add credit from guest profile or booking UI).
 * Creates a ledger row when needed. Optionally syncs guests.balance and clears pending booking rows when guest hits zero.
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

  const newBalance = currentLedgerBalance - amount

  if (ledgerAccountId) {
    const { error } = await supabase
      .from('city_ledger_accounts')
      .update({
        balance: newBalance,
        updated_at: new Date().toISOString(),
      })
      .eq('id', ledgerAccountId)
    if (error) throw new Error(`Ledger update failed: ${error.message}`)
  } else {
    const { error } = await supabase.from('city_ledger_accounts').insert([{
      organization_id: organizationId,
      account_name: accountName,
      account_type: 'individual',
      balance: newBalance,
    }])
    if (error) throw new Error(`Ledger insert failed: ${error.message}`)
  }

  if (syncGuestProfile && guestId) {
    const newGuestBalance = Math.max(0, newBalance)
    const { error: gErr } = await supabase
      .from('guests')
      .update({ balance: newGuestBalance })
      .eq('id', guestId)
    if (gErr) console.warn('Guest balance update:', gErr.message)

    if (newGuestBalance === 0) {
      const { data: pendingBookings } = await supabase
        .from('bookings')
        .select('id')
        .eq('guest_id', guestId)
        .gt('balance', 0)
      if (pendingBookings && pendingBookings.length > 0) {
        for (const bk of pendingBookings) {
          await supabase.from('bookings').update({ balance: 0, payment_status: 'paid' }).eq('id', bk.id)
          await supabase
            .from('folio_charges')
            .update({ payment_status: 'paid' })
            .eq('booking_id', bk.id)
            .eq('payment_status', 'pending')
        }
      }
    }
  }

  const txId = `CLG-${Date.now()}`
  const { error: txError } = await supabase.from('transactions').insert([{
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
  }])
  if (txError) console.warn('Transaction insert:', txError.message)
}
