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
  charges.forEach(c => {
    const gId = bookingToGuest[c.booking_id]
    if (!gId) return
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
 * Batch-calculate balances for organizations (city ledger entities).
 * An organization's balance = sum of all unpaid city_ledger charges across their bookings.
 */
export async function calculateOrganizationBalancesBatch(
  supabase: any,
  organizationIds: string[]
): Promise<Record<string, number>> {
  if (!organizationIds.length) return {}

  // Get all folio_charges with payment_method='city_ledger' for bookings belonging to these orgs
  const { data: allBookings } = await supabase
    .from('bookings')
    .select('id, organization_id')
    .in('organization_id', organizationIds)

  if (!allBookings || allBookings.length === 0) {
    return Object.fromEntries(organizationIds.map(id => [id, 0]))
  }

  const { data: charges } = await supabase
    .from('folio_charges')
    .select('booking_id, amount, payment_method, payment_status')
    .in('booking_id', allBookings.map(b => b.id))
    .eq('payment_method', 'city_ledger')

  // Build org → total balance map
  const orgBookingMap: Record<string, string[]> = {}
  organizationIds.forEach(id => { orgBookingMap[id] = [] })
  allBookings.forEach(b => {
    if (orgBookingMap[b.organization_id]) {
      orgBookingMap[b.organization_id].push(b.id)
    }
  })

  const balanceMap: Record<string, number> = Object.fromEntries(organizationIds.map(id => [id, 0]))

  // Sum unpaid city ledger charges per organization
  (charges || []).forEach(c => {
    const orgId = Object.entries(orgBookingMap).find(([_, bookingIds]) => 
      bookingIds.includes(c.booking_id)
    )?.[0]
    
    if (orgId && (c.payment_status === 'pending' || c.payment_status === 'unpaid')) {
      balanceMap[orgId] = (balanceMap[orgId] || 0) + (c.amount || 0)
    }
  })

  // Clamp negatives to 0
  Object.keys(balanceMap).forEach(id => {
    balanceMap[id] = Math.max(0, balanceMap[id] || 0)
  })

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
