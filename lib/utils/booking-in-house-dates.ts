/**
 * In-house stay detection using the hotel calendar (see `lib/hotel-date.ts`).
 */

import { formatYMDInTimeZone, resolveHotelTimeZone } from '@/lib/hotel-date'

/** YYYY-MM-DD for `instant` on the hotel wall clock. */
export function bookingYmdHotel(
  iso: string | Date | null | undefined,
  timeZone: string = resolveHotelTimeZone(),
): string {
  if (!iso) return ''
  if (iso instanceof Date) {
    if (Number.isNaN(iso.getTime())) return ''
    return formatYMDInTimeZone(iso, timeZone)
  }
  const s = String(iso).trim()
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s
  const d = new Date(s)
  if (Number.isNaN(d.getTime())) return ''
  return formatYMDInTimeZone(d, timeZone)
}

export function todayYmdHotel(timeZone: string = resolveHotelTimeZone()): string {
  return formatYMDInTimeZone(new Date(), timeZone)
}

/**
 * True when the hotel's calendar "today" falls on the stay (inclusive check-in through inclusive checkout day).
 */
export function isInHouseOnCalendarDay(
  checkIn: string | Date,
  checkOut: string | Date,
  todayYmd?: string,
  timeZone: string = resolveHotelTimeZone(),
): boolean {
  const today = todayYmd ?? todayYmdHotel(timeZone)
  const ci = bookingYmdHotel(checkIn, timeZone)
  const co = bookingYmdHotel(checkOut, timeZone)
  if (!ci || !co || !today) return false
  return ci <= today && co >= today
}

/**
 * True when the guest occupies a hotel night on `dayYmd`
 * (`check_in ≤ day < check_out` — same rule as Daily revenue / room accrual).
 * Use for historical daily books and date filters that should list stayovers, not only arrivals.
 */
export function isOccupyingHotelNight(
  checkIn: string | Date,
  checkOut: string | Date,
  dayYmd: string,
  timeZone: string = resolveHotelTimeZone(),
): boolean {
  const day = String(dayYmd || '').trim()
  const ci = bookingYmdHotel(checkIn, timeZone)
  const co = bookingYmdHotel(checkOut, timeZone)
  if (!ci || !co || !day) return false
  return ci <= day && co > day
}

/** YYYY-MM-DD from a calendar picker's Date (uses local calendar parts, not UTC). */
export function calendarPickerYmd(date: Date): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}
