import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * When a guest profile `name` changes, keep denormalized financial rows in sync:
 * - `city_ledger_accounts.account_name` (matched by previous name, guest/individual type)
 * - `transactions.guest_name` for rows tied to this guest's bookings, and booking-less rows with the exact old name
 */
export async function syncGuestAssociatedNames(
  admin: SupabaseClient,
  args: {
    organizationId: string
    guestId: string
    previousName: string
    newName: string
  },
): Promise<{ ledgerUpdated: number; transactionsUpdated: number }> {
  const prev = args.previousName.trim()
  const next = args.newName.trim()
  if (!prev || !next || prev === next) {
    return { ledgerUpdated: 0, transactionsUpdated: 0 }
  }

  const { data: bookingRows } = await admin
    .from('bookings')
    .select('id')
    .eq('guest_id', args.guestId)
    .eq('organization_id', args.organizationId)

  const bookingIds = (bookingRows || []).map((r: { id: string }) => r.id)

  let ledgerUpdated = 0
  const { data: ledgerRows } = await admin
    .from('city_ledger_accounts')
    .select('id, account_name')
    .eq('organization_id', args.organizationId)
    .in('account_type', ['individual', 'guest'])
    .ilike('account_name', prev)

  for (const row of ledgerRows || []) {
    const { error } = await admin
      .from('city_ledger_accounts')
      .update({
        account_name: next,
        updated_at: new Date().toISOString(),
      })
      .eq('id', (row as { id: string }).id)
    if (!error) ledgerUpdated += 1
  }

  let transactionsUpdated = 0
  if (bookingIds.length > 0) {
    const { data: tx1 } = await admin
      .from('transactions')
      .update({
        guest_name: next,
        updated_at: new Date().toISOString(),
      })
      .eq('organization_id', args.organizationId)
      .in('booking_id', bookingIds)
      .select('id')
    transactionsUpdated += (tx1 || []).length
  }

  const { data: tx2 } = await admin
    .from('transactions')
    .update({
      guest_name: next,
      updated_at: new Date().toISOString(),
    })
    .eq('organization_id', args.organizationId)
    .is('booking_id', null)
    .eq('guest_name', prev)
    .select('id')

  transactionsUpdated += (tx2 || []).length

  return { ledgerUpdated, transactionsUpdated }
}
