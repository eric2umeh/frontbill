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
