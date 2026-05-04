export type CheckoutEligibilityBooking = {
  status: string
  check_in: string
  check_out: string
  folio_status?: string | null
}

export type FolioLockBooking = CheckoutEligibilityBooking

/** Mirrors `organizations.checkout_time` DB default until settings are loaded */
export const DEFAULT_ORG_CHECKOUT_TIME = '12:00'

function bookingCheckOutYmd(checkOut: string): string {
  const day = checkOut.includes('T') ? checkOut.split('T')[0] : checkOut
  return day.slice(0, 10)
}

/** Calendar day portion of booking `check_out` (handles ISO timestamps). */
export function normalizeBookingCheckoutYmd(checkOut: string): string {
  return bookingCheckOutYmd(checkOut)
}

/** Local calendar YYYY-MM-DD */
export function localTodayYmd(now: Date = new Date()): string {
  const y = now.getFullYear()
  const m = String(now.getMonth() + 1).padStart(2, '0')
  const d = String(now.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

export function parseCheckoutTimeHM(checkoutTime?: string | null): { hour: number; minute: number } {
  const raw = (checkoutTime ?? DEFAULT_ORG_CHECKOUT_TIME).trim()
  const parts = raw.split(':').map((p) => Number(String(p).replace(/\D/g, '')))
  const hour = Number.isFinite(parts[0]) ? Math.min(23, Math.max(0, parts[0])) : 12
  const minute = Number.isFinite(parts[1]) ? Math.min(59, Math.max(0, parts[1])) : 0
  return { hour, minute }
}

export function formatCheckoutTimeLabel(checkoutTime?: string | null): string {
  const { hour, minute } = parseCheckoutTimeHM(checkoutTime)
  const h12 = hour % 12 === 0 ? 12 : hour % 12
  const suffix = hour >= 12 ? 'PM' : 'AM'
  return `${h12}:${String(minute).padStart(2, '0')} ${suffix}`
}

export function isBookingCheckedOut(b: Pick<FolioLockBooking, 'status' | 'folio_status'>): boolean {
  if (b.status === 'checked_out') return true
  return (b.folio_status || 'active') === 'checked_out'
}

/**
 * True when the checkout calendar day has passed, or it's checkout day and local time
 * has reached the org standard checkout clock.
 */
export function isPastCheckoutCutoff(
  booking: Pick<FolioLockBooking, 'check_out'>,
  checkoutClock?: string | null,
  now: Date = new Date(),
): boolean {
  const co = bookingCheckOutYmd(booking.check_out)
  const today = localTodayYmd(now)
  if (co < today) return true
  if (co > today) return false
  const { hour, minute } = parseCheckoutTimeHM(checkoutClock)
  const nowMin = now.getHours() * 60 + now.getMinutes()
  return nowMin >= hour * 60 + minute
}

/** Hide Add Charge, Extend Stay, Check Out — checked out or standard checkout cutoff passed */
export function folioGuestActionsLocked(b: FolioLockBooking, checkoutClock?: string | null, now?: Date): boolean {
  if (isBookingCheckedOut(b)) return true
  return isPastCheckoutCutoff(b, checkoutClock, now)
}

/** When past cutoff on the bookings table row, Charge / Extend are hidden like on the folio detail */
export function hideChargeExtendInBookingsTable(
  booking: Pick<FolioLockBooking, 'check_out' | 'status' | 'check_in' | 'folio_status'>,
  checkoutClock?: string | null,
  now?: Date,
): boolean {
  return folioGuestActionsLocked(
    {
      status: booking.status,
      check_in: booking.check_in,
      check_out: booking.check_out,
      folio_status: booking.folio_status,
    },
    checkoutClock,
    now,
  )
}

/**
 * When manual Check out button should appear (lists, folio header). Auto-checkout replaces it after cutoff.
 */
export function manualCheckoutEligible(b: CheckoutEligibilityBooking, checkoutClock?: string | null): boolean {
  const today = localTodayYmd(new Date())

  if (folioGuestActionsLocked(b, checkoutClock)) return false

  if (b.status === 'reserved') {
    if (b.check_in > today) return false
    return true
  }

  if (b.status === 'confirmed' && b.check_in > today) return false

  return true
}

/** Server / detail effect: overdue for auto-checkout (matches cron statuses) */
export function shouldAutoCheckoutDueBooking(
  b: Pick<FolioLockBooking, 'status' | 'folio_status' | 'check_out'>,
  checkoutClock?: string | null,
  now?: Date,
): boolean {
  if (isBookingCheckedOut(b)) return false
  if (!isPastCheckoutCutoff(b, checkoutClock, now)) return false
  return b.status === 'checked_in' || b.status === 'reserved'
}

/**
 * Date written on checkout — keeps scheduled check_out when the stay already ended
 * (cron no longer overwrites past dates with "today").
 */
export function resolvedCheckoutDateForClosing(booking: { check_out: string }): string {
  const today = localTodayYmd(new Date())
  const co = bookingCheckOutYmd(booking.check_out)
  if (co < today) return co
  return today
}
