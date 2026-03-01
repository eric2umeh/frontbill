import { createClient } from '@/lib/supabase/client'

/**
 * Calculate guest's unpaid balance from all folio_charges for their bookings
 */
export async function calculateGuestBalance(guestId: string, organizationId: string): Promise<number> {
  const supabase = createClient()
  
  const { data, error } = await supabase
    .from('folio_charges')
    .select('amount')
    .eq('organization_id', organizationId)
    .in('booking_id', 
      // Subquery: get all bookings for this guest
      supabase
        .from('bookings')
        .select('id')
        .eq('guest_id', guestId)
        .eq('organization_id', organizationId)
    )

  if (error) {
    console.error('[v0] Error calculating guest balance:', error)
    return 0
  }

  // Sum all charges (negative = payments, positive = charges)
  return (data || []).reduce((sum, charge) => sum + (charge.amount || 0), 0)
}

/**
 * Get guest balance with fallback to direct calculation
 */
export async function getGuestBalance(guestId: string, organizationId: string): Promise<{ balance: number; chargeCount: number }> {
  const supabase = createClient()
  
  // Get all folio charges for this guest's bookings
  const { data: bookingIds } = await supabase
    .from('bookings')
    .select('id')
    .eq('guest_id', guestId)
    .eq('organization_id', organizationId)

  if (!bookingIds || bookingIds.length === 0) {
    return { balance: 0, chargeCount: 0 }
  }

  const { data: charges } = await supabase
    .from('folio_charges')
    .select('amount')
    .in('booking_id', bookingIds.map(b => b.id))

  const balance = (charges || []).reduce((sum, c) => sum + (c.amount || 0), 0)
  return { balance, chargeCount: charges?.length || 0 }
}

/**
 * Format balance for display (positive = owed, negative = credit)
 */
export function formatBalance(balance: number): string {
  if (balance === 0) return '0.00'
  return Math.abs(balance).toFixed(2)
}

/**
 * Get balance status label
 */
export function getBalanceStatus(balance: number): 'paid' | 'partial' | 'unpaid' | 'credit' {
  if (balance > 0) return 'unpaid'
  if (balance === 0) return 'paid'
  if (balance < 0) return 'credit'
  return 'partial'
}
