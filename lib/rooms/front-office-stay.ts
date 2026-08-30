/**
 * Front-office stay buckets for Bookings stats and lists.
 *
 * Occ, Due, and Res are mutually exclusive:
 * - occupied — checked in / confirmed, staying past today (check_out > today)
 * - due_out — still on folio, checkout today or overdue (check_out ≤ today)
 * - reserved — reservation / future arrival (not checked in yet)
 *
 * The Due *stat chip* counts only checkout **today** (not historical overdue).
 * Overdue folios still classify as due_out for badges / held-room math.
 */

import { resolveHotelTimeZone, hotelCalendarTodayYmd } from '@/lib/hotel-date'
import {
  bookingYmdHotel,
  todayYmdHotel,
} from '@/lib/utils/booking-in-house-dates'

export type FrontOfficeStayKind = 'occupied' | 'due_out' | 'reserved' | 'other'

export type FrontOfficeStayRow = {
  id?: string
  room_id?: string | null
  status: string
  check_in: string
  check_out: string
  folio_status?: string | null
}

export type FrontOfficeStayStats = {
  /** Checked-in (or confirmed in-house) guests staying beyond today — excludes due-out and reservations. */
  occupied: number
  /** Checkout **today** only (overdue open folios are not counted here). */
  dueOut: number
  /** Reserved / future arrivals (not checked in). */
  reserved: number
}

function normStatus(s: string | null | undefined): string {
  return String(s || '')
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, '_')
}

export function classifyFrontOfficeStay(
  booking: FrontOfficeStayRow,
  todayYmd?: string,
  timeZone: string = resolveHotelTimeZone(),
): FrontOfficeStayKind {
  const tz = resolveHotelTimeZone(timeZone)
  const frontOfficeDay = todayYmd ?? todayYmdHotel(tz)
  const calendarToday = hotelCalendarTodayYmd(undefined, tz)
  const st = normStatus(booking.status)
  const fs = normStatus(booking.folio_status)

  if (st === 'checked_out' || st === 'cancelled' || fs === 'checked_out' || fs === 'cancelled') {
    return 'other'
  }
  if (!['checked_in', 'confirmed', 'reserved'].includes(st)) return 'other'

  const ci = bookingYmdHotel(booking.check_in, tz)
  const co = bookingYmdHotel(booking.check_out, tz)
  if (!ci || !co) return 'other'

  // Future calendar arrival — guest has not arrived yet (independent of business_date lag)
  if (ci > calendarToday) return 'reserved'

  // Due out on front-office business day or overdue (still open folio)
  if (co <= frontOfficeDay) return 'due_out'

  // Same-day / stayover reservation not yet converted to checked_in
  if (st === 'reserved') return 'reserved'

  // checked_in or confirmed, in-house, departing after front-office day
  return 'occupied'
}

/** Folio counts — Occ / Due / Res are unique (no double-count). Due = checkout today only. */
export function computeFrontOfficeStayStats(
  bookings: FrontOfficeStayRow[],
  todayYmd?: string,
  timeZone: string = resolveHotelTimeZone(),
): FrontOfficeStayStats {
  const tz = resolveHotelTimeZone(timeZone)
  const today = todayYmd ?? todayYmdHotel(tz)
  let occupied = 0
  let dueOut = 0
  let reserved = 0

  for (const b of bookings) {
    const kind = classifyFrontOfficeStay(b, today, tz)
    if (kind === 'occupied') {
      occupied += 1
    } else if (kind === 'due_out') {
      const co = bookingYmdHotel(b.check_out, tz)
      // Chip = due out today only (stale overdue used to inflate Due into dozens)
      if (co === today) dueOut += 1
    } else if (kind === 'reserved') {
      reserved += 1
    }
  }

  return { occupied, dueOut, reserved }
}

/**
 * Default Bookings in-house list: checked-in / confirmed stayovers + due out today only.
 * Reservations belong on the Reservations page, not the in-house table.
 */
export function isShownOnDefaultBookingsList(
  booking: FrontOfficeStayRow,
  todayYmd?: string,
  timeZone: string = resolveHotelTimeZone(),
): boolean {
  const tz = resolveHotelTimeZone(timeZone)
  const today = todayYmd ?? todayYmdHotel(tz)
  const kind = classifyFrontOfficeStay(booking, today, tz)
  if (kind === 'occupied') return true
  if (kind === 'due_out') {
    const co = bookingYmdHotel(booking.check_out, tz)
    return co === today
  }
  return false
}

/**
 * Rooms still held for sellable availability: Occ + Due **today** only.
 * Overdue open folios are excluded so Avail matches total − Occ − Due − OOO
 * (stale overdue used to crush Available into the 30s on a 64-room house).
 */
export function countPhysicallyHeldRooms(
  bookings: FrontOfficeStayRow[],
  todayYmd?: string,
  timeZone: string = resolveHotelTimeZone(),
): number {
  const tz = resolveHotelTimeZone(timeZone)
  const today = todayYmd ?? todayYmdHotel(tz)
  const rooms = new Set<string>()
  for (const b of bookings) {
    const kind = classifyFrontOfficeStay(b, today, tz)
    if (kind === 'occupied') {
      if (b.room_id) rooms.add(b.room_id)
      else if (b.id) rooms.add(`folio:${b.id}`)
      continue
    }
    if (kind === 'due_out') {
      const co = bookingYmdHotel(b.check_out, tz)
      if (co !== today) continue
      if (b.room_id) rooms.add(b.room_id)
      else if (b.id) rooms.add(`folio:${b.id}`)
    }
  }
  return rooms.size
}
