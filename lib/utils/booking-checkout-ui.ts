export type CheckoutEligibilityBooking = {
  status: string
  check_in: string
  check_out: string
  folio_status?: string | null
}

/** When to show manual Check out on lists and bulk detail. */
export function manualCheckoutEligible(b: CheckoutEligibilityBooking): boolean {
  const today = new Date().toISOString().split('T')[0]
  const hour = new Date().getHours()
  const folioDone = (b.folio_status || 'active') === 'checked_out'
  if (b.status === 'checked_out' || folioDone) return false

  if (b.status === 'reserved') {
    if (b.check_in > today) return false
    return true
  }

  if (b.check_out <= today && hour >= 14) return false
  return true
}

/**
 * Date written on checkout — keeps scheduled check_out when the stay already ended
 * (cron no longer overwrites past dates with "today").
 */
export function resolvedCheckoutDateForClosing(booking: { check_out: string }): string {
  const today = new Date().toISOString().split('T')[0]
  if (booking.check_out < today) return booking.check_out
  return today
}
