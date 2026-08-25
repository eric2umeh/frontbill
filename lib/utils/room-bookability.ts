import { housekeepingStatusLabel } from '@/lib/rooms/housekeeping-status'
import { DATE_HOLD_BOOKING_STATUSES } from '@/lib/rooms/room-occupancy'
import { bookingYmdHotel } from '@/lib/utils/booking-in-house-dates'

/** Supabase REST often caps rows (~1000); large hotels need an explicit ceiling. */
export const BOOKING_MODAL_ROOMS_LIMIT = 20_000

const DEFAULT_ROOM_TYPE_LABEL = 'Standard'

const PMS_STATUSES_BLOCKING_BOOKINGS = new Set([
  'maintenance',
  'out_of_order',
  'occupied',
])

/** HK statuses that hide a room from pickers. reservation/checkout/vacant do not. */
const HK_STATUSES_BLOCKING_BOOKINGS = new Set([
  'out_of_order',
  'occupied',
  'complimentary',
  'long_stay',
  'sleep_out',
])

const DATE_HOLD = new Set<string>(DATE_HOLD_BOOKING_STATUSES as readonly string[])

export type RoomBookabilityInput = {
  status?: string | null
  housekeeping_status?: string | null
}

export type StayHoldBooking = {
  room_id?: string | null
  check_in?: string | null
  check_out?: string | null
  status?: string | null
}

function normStatus(s: string | null | undefined): string {
  return String(s ?? '')
    .toLowerCase()
    .trim()
    .replace(/-/g, '_')
}

/**
 * Whether a room may appear in booking / reservation pickers.
 * Physical holds only (occupied / OOO / maintenance). PMS "reserved" stays sellable;
 * reserved nights are enforced by date overlap instead.
 */
export function isRoomAssignable(
  status: string | null | undefined,
  housekeepingStatus?: string | null | undefined,
): boolean {
  const s = normStatus(status)
  if (PMS_STATUSES_BLOCKING_BOOKINGS.has(s)) return false
  const hk = normStatus(housekeepingStatus)
  if (hk && HK_STATUSES_BLOCKING_BOOKINGS.has(hk)) return false
  return true
}

export function isRoomBookable(room: RoomBookabilityInput): boolean {
  return isRoomAssignable(room.status, room.housekeeping_status)
}

export function roomNotBookableReason(room: RoomBookabilityInput): string | null {
  if (isRoomBookable(room)) return null
  const hk = normStatus(room.housekeeping_status)
  if (hk && HK_STATUSES_BLOCKING_BOOKINGS.has(hk)) {
    return `Room is marked ${housekeepingStatusLabel(room.housekeeping_status)} by housekeeping and cannot be booked or reserved.`
  }
  const s = normStatus(room.status)
  if (s === 'maintenance') return 'Room is under maintenance and cannot be booked.'
  if (s === 'out_of_order') return 'Room is out of order and cannot be booked.'
  if (s === 'occupied') return 'Room is occupied and cannot be booked.'
  return 'Room is not available for booking.'
}

/** Stay date overlap: existing.check_in < newCheckOut AND existing.check_out > newCheckIn */
export function staysOverlap(
  existingCheckIn: string | null | undefined,
  existingCheckOut: string | null | undefined,
  newCheckIn: string,
  newCheckOut: string,
): boolean {
  const aIn = bookingYmdHotel(existingCheckIn) || String(existingCheckIn || '').slice(0, 10)
  const aOut = bookingYmdHotel(existingCheckOut) || String(existingCheckOut || '').slice(0, 10)
  const bIn = String(newCheckIn || '').slice(0, 10)
  const bOut = String(newCheckOut || '').slice(0, 10)
  if (!aIn || !aOut || !bIn || !bOut) return false
  return aIn < bOut && aOut > bIn
}

/**
 * Room IDs held for the selected stay by checked-in, confirmed, or reserved folios.
 * A future reservation only blocks on its reserved nights — other nights stay free for walk-ins.
 */
export function roomIdsHeldForStayRange(
  bookings: StayHoldBooking[],
  checkInYmd: string,
  checkOutYmd: string,
): Set<string> {
  const out = new Set<string>()
  for (const b of bookings) {
    const roomId = b.room_id ? String(b.room_id) : ''
    if (!roomId) continue
    const st = normStatus(b.status)
    if (st === 'cancelled' || st === 'checked_out' || st === 'no_show') continue
    // Queries that omit status are treated as holds; otherwise only date-hold statuses
    if (st && !DATE_HOLD.has(st)) continue
    if (staysOverlap(b.check_in, b.check_out, checkInYmd, checkOutYmd)) {
      out.add(roomId)
    }
  }
  return out
}

/**
 * After fetch: trim room_number, coerce blank room_type, exclude non-bookable rooms.
 * Rooms with PMS status reserved remain listed for walk-ins on free nights.
 */
export function normalizeRoomsForBookingPickers(roomData: unknown[] | null | undefined): Record<string, unknown>[] {
  if (!roomData?.length) return []

  const out: Record<string, unknown>[] = []
  for (const raw of roomData) {
    const r = raw as Record<string, unknown>
    const id = r.id as string | undefined
    if (!id) continue

    const numRaw = r.room_number
    const room_number =
      typeof numRaw === 'string'
        ? numRaw.trim()
        : numRaw !== null && numRaw !== undefined
          ? String(numRaw).trim()
          : ''
    if (!room_number) continue
    if (!isRoomAssignable(r.status as string | undefined, r.housekeeping_status as string | undefined)) {
      continue
    }

    const rt = String(r.room_type ?? '').replace(/\s+/g, ' ').trim()
    const room_type = rt || DEFAULT_ROOM_TYPE_LABEL

    out.push({ ...r, id, room_number, room_type })
  }
  return out
}
