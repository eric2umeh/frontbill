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

/** Local calendar midnight for `YYYY-MM-DD` (avoids UTC parse shifts). */
function parseLocalBookingDate(ymd: string): Date {
  const day = ymd.includes('T') ? ymd.split('T')[0] : ymd
  const [y, m, d] = day.split('-').map(Number)
  return new Date(y, m - 1, d)
}

function startOfLocalDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate())
}

/**
 * After checkout, hide Charge / Extend from the bookings list (detail page unaffected).
 * Hides starting 15:00 on the calendar day after check-out, and anytime on later days.
 * Extended stays use the stored check-out date.
 */
export function hideChargeExtendInBookingsTable(booking: { check_out: string }): boolean {
  const now = new Date()
  const checkoutDay = startOfLocalDay(parseLocalBookingDate(booking.check_out))
  const dayAfterCheckout = new Date(checkoutDay)
  dayAfterCheckout.setDate(dayAfterCheckout.getDate() + 1)

  const todayStart = startOfLocalDay(now)
  if (todayStart < startOfLocalDay(dayAfterCheckout)) return false

  const isExactlyDayAfter = todayStart.getTime() === startOfLocalDay(dayAfterCheckout).getTime()
  if (!isExactlyDayAfter) return true
  return now.getHours() >= 15
}
