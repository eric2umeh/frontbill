import { createClient } from '@/lib/supabase/client'

/**
 * Computes the net outstanding balance for a guest across all their bookings.
 *
 * Logic:
 *   - folio_charges with charge_type != 'payment' and payment_status = 'pending' → positive (owed)
 *   - folio_charges with charge_type = 'payment'                                 → negative (paid)
 *   - bookings.total_amount - bookings.deposit (fallback if no folio charges)
 *
 * Returns a positive number = amount still owed by the guest.
 * Returns 0 or negative = fully paid or in credit.
 */
export async function calculateGuestBalance(
  guestId: string,
  organizationId: string
): Promise<number> {
  const supabase = createClient()

  // Get all booking IDs for this guest
  const { data: bookings } = await supabase
    .from('bookings')
    .select('id, total_amount, deposit, payment_status')
    .eq('guest_id', guestId)
    .eq('organization_id', organizationId)
    .not('status', 'in', '("cancelled","checked_out")')

  if (!bookings || bookings.length === 0) return 0

  const bookingIds = bookings.map(b => b.id)

  // Get all folio charges for these bookings
  const { data: charges } = await supabase
    .from('folio_charges')
    .select('amount, charge_type, payment_status, payment_method')
    .in('booking_id', bookingIds)

  if (!charges || charges.length === 0) {
    // Fall back to bookings balance (total - deposit)
    return bookings.reduce((sum, b) => {
      if (b.payment_status === 'paid') return sum
      const owed = (b.total_amount || 0) - (b.deposit || 0)
      return sum + Math.max(0, owed)
    }, 0)
  }

  // Net balance from folio:
  //   positive charges (room rate, add-charge, extended stay) that are unpaid/pending
  //   negative charges (payments recorded as negative amount)
  const balance = charges.reduce((sum, c) => {
    if (c.payment_status === 'posted_to_ledger') return sum
    // Payments recorded as negative amounts reduce the balance
    if (c.charge_type === 'payment') return sum + (c.amount || 0) // amount is negative
    // City ledger charges that are pending = still owed
    if (c.payment_method === 'city_ledger' && c.payment_status !== 'paid') {
      return sum + (c.amount || 0)
    }
    // Other unpaid charges
    if (c.payment_status === 'pending' || c.payment_status === 'unpaid') {
      return sum + (c.amount || 0)
    }
    return sum
  }, 0)

  return Math.max(0, balance)
}

/**
 * Batch-calculate balances for multiple guests in one set of queries.
 * Accepts supabase instance (created in the page) to share organization context.
 * Returns a map of guestId → balance.
 */
export async function calculateGuestBalancesBatch(
  supabase: any,
  guestIds: string[]
): Promise<Record<string, number>> {
  if (!guestIds.length) return {}

  // Get all bookings for these guests (across all orgs, will check per guest later)
  const { data: bookings } = await supabase
    .from('bookings')
    .select('id, guest_id, total_amount, deposit, balance, payment_status')
    .in('guest_id', guestIds)
    .not('status', 'in', '("cancelled")')

  if (!bookings || bookings.length === 0) {
    return Object.fromEntries(guestIds.map(id => [id, 0]))
  }

  // Get all folio charges for all these bookings in one query
  const { data: charges } = await supabase
    .from('folio_charges')
    .select('booking_id, amount, charge_type, payment_status, payment_method')
    .in('booking_id', bookings.map(b => b.id))

  // Build a bookingId → guestId map
  const bookingToGuest: Record<string, string> = {}
  const bookingMap: Record<string, { total_amount: number; deposit: number; balance?: number; payment_status: string }> = {}
  bookings.forEach(b => {
    bookingToGuest[b.id] = b.guest_id
    bookingMap[b.id] = b
  })

  // Compute balance per guest
  const balanceMap: Record<string, number> = Object.fromEntries(guestIds.map(id => [id, 0]))

  if (!charges || charges.length === 0) {
    // Fall back: compute from booking totals
    bookings.forEach(b => {
      const gId = b.guest_id
      if (b.payment_status !== 'paid') {
        const owed = Math.max(0, (b.total_amount || 0) - (b.deposit || 0))
        balanceMap[gId] = (balanceMap[gId] || 0) + owed
      }
    })
    return balanceMap
  }

  const folioBalanceByBooking: Record<string, number> = {}
  const postedToOrganizationLedger = new Set<string>()
  charges.forEach(c => {
    const gId = bookingToGuest[c.booking_id]
    if (!gId) return
    if (c.payment_status === 'posted_to_ledger') {
      postedToOrganizationLedger.add(c.booking_id)
      return
    }
    if (c.charge_type === 'payment') {
      // Payment amounts are negative — reduces balance
      folioBalanceByBooking[c.booking_id] = (folioBalanceByBooking[c.booking_id] || 0) + (c.amount || 0)
    } else if (
      c.payment_method === 'city_ledger' ||
      c.payment_status === 'pending' ||
      c.payment_status === 'unpaid'
    ) {
      folioBalanceByBooking[c.booking_id] = (folioBalanceByBooking[c.booking_id] || 0) + (c.amount || 0)
    }
  })

  bookings.forEach(b => {
    const gId = b.guest_id
    if (postedToOrganizationLedger.has(b.id)) {
      return
    }
    const fallbackOwed = Math.max(0, (Number(b.total_amount) || 0) - (Number(b.deposit) || 0))
    const outstanding = Math.max(
      Number(folioBalanceByBooking[b.id] || 0),
      Number(b.balance || 0),
      fallbackOwed
    )
    balanceMap[gId] = (balanceMap[gId] || 0) + outstanding
  })

  // Clamp negatives to 0 (credit balance shown elsewhere)
  Object.keys(balanceMap).forEach(id => {
    balanceMap[id] = Math.max(0, balanceMap[id] || 0)
  })

  return balanceMap
}

/**
 * Batch-calculate balances for menu organizations (NGO / corp rows).
 * For each organization row we take max(organizations.current_balance, matching city ledger account balance).
 * City ledger rows are scoped per hotel tenant via organization_id + account_name matching the entity name.
 */
export async function calculateOrganizationBalancesBatch(
  supabase: any,
  menuOrganizationIds: string[],
  options?: { hotelTenantId?: string | null }
): Promise<Record<string, number>> {
  if (!menuOrganizationIds.length) return {}

  const balanceMap: Record<string, number> = Object.fromEntries(menuOrganizationIds.map(id => [id, 0]))
  const { data: organizations } = await supabase
    .from('organizations')
    .select('id, name, current_balance')
    .in('id', menuOrganizationIds)

  const orgRows = organizations || []
  orgRows.forEach((org: any) => {
    balanceMap[org.id] = Number(org.current_balance || 0)
  })

  const names = orgRows.map((org: any) => org.name).filter(Boolean)
  if (names.length > 0) {
    let q = supabase
      .from('city_ledger_accounts')
      .select('account_name, balance')
      .in('account_name', names)
      .in('account_type', ['organization', 'corporate'])
    if (options?.hotelTenantId) {
      q = q.eq('organization_id', options.hotelTenantId)
    }
    const { data: ledgerAccounts } = await q

    ;(ledgerAccounts || []).forEach((account: any) => {
      const org = orgRows.find(
        (item: any) => String(item.name || '').toLowerCase() === String(account.account_name || '').toLowerCase()
      )
      if (!org?.id) return
      balanceMap[org.id] = Math.max(balanceMap[org.id] || 0, Number(account.balance || 0))
    })
  }

  return balanceMap
}

/** Format balance for display */
export function formatBalance(balance: number): string {
  return Math.abs(balance).toFixed(2)
}

/** Get balance status */
export function getBalanceStatus(balance: number): 'paid' | 'unpaid' | 'credit' {
  if (balance > 0) return 'unpaid'
  if (balance < 0) return 'credit'
  return 'paid'
}
