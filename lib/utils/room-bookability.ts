import {
  housekeepingStatusLabel,
  isHousekeepingStatusBlockingBookings,
} from '@/lib/rooms/housekeeping-status'

/** Supabase REST often caps rows (~1000); large hotels need an explicit ceiling. */
export const BOOKING_MODAL_ROOMS_LIMIT = 20_000

const DEFAULT_ROOM_TYPE_LABEL = 'Standard'

const PMS_STATUSES_BLOCKING_BOOKINGS = new Set([
  'maintenance',
  'out_of_order',
  'occupied',
])

export type RoomBookabilityInput = {
  status?: string | null
  housekeeping_status?: string | null
}

function normStatus(s: string | null | undefined): string {
  return String(s ?? '')
    .toLowerCase()
    .trim()
    .replace(/-/g, '_')
}

/**
 * Whether a room may appear in booking / reservation pickers.
 * Blocked by PMS status (maintenance, OOO, occupied) or HK floor status
 * (OOO, occupied, complimentary, long stay, sleep-out).
 * Reservations and post-checkout rooms stay bookable until a guest is checked in.
 */
export function isRoomAssignable(
  status: string | null | undefined,
  housekeepingStatus?: string | null | undefined,
): boolean {
  const s = normStatus(status)
  if (PMS_STATUSES_BLOCKING_BOOKINGS.has(s)) return false
  if (isHousekeepingStatusBlockingBookings(housekeepingStatus)) return false
  return true
}

export function isRoomBookable(room: RoomBookabilityInput): boolean {
  return isRoomAssignable(room.status, room.housekeeping_status)
}

export function roomNotBookableReason(room: RoomBookabilityInput): string | null {
  if (isRoomBookable(room)) return null
  if (isHousekeepingStatusBlockingBookings(room.housekeeping_status)) {
    const label = housekeepingStatusLabel(room.housekeeping_status)
    return `Room is marked ${label} by housekeeping and cannot be booked or reserved.`
  }
  const s = normStatus(room.status)
  if (s === 'maintenance') return 'Room is under maintenance and cannot be booked.'
  if (s === 'out_of_order') return 'Room is out of order and cannot be booked.'
  if (s === 'occupied') return 'Room is occupied and cannot be booked.'
  return 'Room is not available for booking.'
}

/**
 * After fetch: trim room_number, coerce blank room_type, exclude non-bookable rooms.
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
