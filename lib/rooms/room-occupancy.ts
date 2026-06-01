import type { SupabaseClient } from '@supabase/supabase-js'
import { resolveHotelTimeZone } from '@/lib/hotel-date'
import { bookingYmdHotel, isInHouseOnCalendarDay, todayYmdHotel } from '@/lib/utils/booking-in-house-dates'

export const OCCUPYING_BOOKING_STATUSES = ['checked_in', 'confirmed', 'reserved'] as const

export type OccupyingBookingRow = {
  id: string
  room_id?: string | null
  status: string
  check_in: string
  check_out: string
  folio_status?: string | null
}

function normStatus(s: string | null | undefined): string {
  return String(s || '').toLowerCase().replace(/-/g, '_')
}

function isOpenOccupancyStatus(status: string | null | undefined): boolean {
  const s = normStatus(status)
  return OCCUPYING_BOOKING_STATUSES.includes(s as (typeof OCCUPYING_BOOKING_STATUSES)[number])
}

function isClosedBooking(row: Pick<OccupyingBookingRow, 'status' | 'folio_status'>): boolean {
  const fs = normStatus(row.folio_status)
  const st = normStatus(row.status)
  return fs === 'checked_out' || fs === 'cancelled' || st === 'checked_out' || st === 'cancelled'
}

function isCurrentOrFutureRoomHold(
  row: Pick<OccupyingBookingRow, 'check_out'>,
  today: string,
  timeZone: string,
): boolean {
  const checkout = bookingYmdHotel(row.check_out, timeZone)
  return Boolean(checkout) && checkout >= today
}

/** Active in-house folio on a room (matches bookings in-house list / outlets charge-to-room). */
export function pickOccupyingBooking<T extends OccupyingBookingRow>(rows: T[]): T | null {
  const today = todayYmdHotel()
  const tz = resolveHotelTimeZone()

  const open = rows.filter((b) => {
    const status = normStatus(b.status)
    if (isClosedBooking(b)) return false
    if (!isOpenOccupancyStatus(status)) return false
    if (status === 'checked_in') return true
    return isInHouseOnCalendarDay(b.check_in, b.check_out, today, tz)
  })

  const rank = (s: string) => {
    const status = normStatus(s)
    return status === 'checked_in' ? 0 : status === 'confirmed' ? 1 : 2
  }
  open.sort((a, b) => rank(a.status) - rank(b.status))
  return open[0] ?? null
}

/**
 * Booking that should drive rooms.status: checked-in guests occupy the room;
 * current/future confirmed or reserved bookings keep the room held.
 */
export function pickRoomStatusBooking<T extends OccupyingBookingRow>(rows: T[]): T | null {
  const today = todayYmdHotel()
  const tz = resolveHotelTimeZone()

  const open = rows.filter((b) => {
    const status = normStatus(b.status)
    if (isClosedBooking(b)) return false
    if (!isOpenOccupancyStatus(status)) return false
    if (status === 'checked_in') return true
    return isCurrentOrFutureRoomHold(b, today, tz)
  })

  const rank = (b: OccupyingBookingRow) => {
    const status = normStatus(b.status)
    if (status === 'checked_in') return 0
    if (isInHouseOnCalendarDay(b.check_in, b.check_out, today, tz)) return status === 'confirmed' ? 1 : 2
    return status === 'confirmed' ? 3 : 4
  }

  open.sort((a, b) => {
    const rankDiff = rank(a) - rank(b)
    if (rankDiff !== 0) return rankDiff
    return bookingYmdHotel(a.check_in, tz).localeCompare(bookingYmdHotel(b.check_in, tz))
  })
  return open[0] ?? null
}

/** PMS room status from the active folio on that room. Returns null if housekeeping block should stay. */
export function deriveRoomStatusFromOccupying(
  occupying: Pick<OccupyingBookingRow, 'status'> | null,
  currentStatus: string | null | undefined,
): string | null {
  const cur = normStatus(currentStatus)
  if (cur === 'maintenance' || cur === 'out_of_order' || cur === 'cleaning') return null

  if (!occupying) {
    if (cur === 'occupied' || cur === 'reserved') return 'available'
    return null
  }

  if (normStatus(occupying.status) === 'checked_in') return 'occupied'
  return 'reserved'
}

/** Distinct rooms with an in-house folio today (aligns with Bookings → Checked in filter). */
export function countInHouseRoomsFromBookings(
  bookings: OccupyingBookingRow[],
): number {
  const byRoom = new Map<string, OccupyingBookingRow[]>()
  for (const b of bookings) {
    if (!b.room_id) continue
    if (!byRoom.has(b.room_id)) byRoom.set(b.room_id, [])
    byRoom.get(b.room_id)!.push(b)
  }
  let count = 0
  for (const rows of byRoom.values()) {
    if (pickOccupyingBooking(rows)) count += 1
  }
  return count
}

export type ReconcileRoomStatusesResult = {
  updated: number
  freed: number
  markedOccupied: number
  markedReserved: number
}

/**
 * Align rooms.status with active folios: free rooms after checkout, mark occupied/reserved from bookings.
 */
export async function reconcileRoomStatusesForOrganization(
  supabase: SupabaseClient,
  organizationId: string,
): Promise<ReconcileRoomStatusesResult> {
  const result: ReconcileRoomStatusesResult = {
    updated: 0,
    freed: 0,
    markedOccupied: 0,
    markedReserved: 0,
  }

  const [{ data: rooms, error: roomErr }, { data: bookings, error: bookErr }] = await Promise.all([
    supabase.from('rooms').select('id, status').eq('organization_id', organizationId),
    supabase
      .from('bookings')
      .select('id, room_id, status, check_in, check_out, folio_status')
      .eq('organization_id', organizationId)
      .in('status', [...OCCUPYING_BOOKING_STATUSES]),
  ])

  if (roomErr) throw roomErr
  if (bookErr) throw bookErr

  const byRoom = new Map<string, OccupyingBookingRow[]>()
  for (const b of bookings ?? []) {
    if (!b.room_id) continue
    if (!byRoom.has(b.room_id)) byRoom.set(b.room_id, [])
    byRoom.get(b.room_id)!.push(b as OccupyingBookingRow)
  }

  const now = new Date().toISOString()

  for (const room of rooms ?? []) {
    const occupying = pickRoomStatusBooking(byRoom.get(room.id) ?? [])
    const next = deriveRoomStatusFromOccupying(occupying, room.status)
    if (!next || normStatus(next) === normStatus(room.status)) continue

    const { error } = await supabase
      .from('rooms')
      .update({ status: next, updated_at: now })
      .eq('id', room.id)

    if (error) {
      console.warn('[reconcileRoomStatuses]', room.id, error.message)
      continue
    }

    result.updated += 1
    if (next === 'available') result.freed += 1
    else if (next === 'occupied') result.markedOccupied += 1
    else if (next === 'reserved') result.markedReserved += 1
  }

  return result
}

/** Reconcile a single room after a booking releases or changes that room. */
export async function reconcileRoomStatusForRoom(
  supabase: SupabaseClient,
  roomId: string,
): Promise<{ updated: boolean; status: string | null }> {
  const [{ data: room, error: roomErr }, { data: bookings, error: bookErr }] = await Promise.all([
    supabase.from('rooms').select('id, status').eq('id', roomId).maybeSingle(),
    supabase
      .from('bookings')
      .select('id, room_id, status, check_in, check_out, folio_status')
      .eq('room_id', roomId)
      .in('status', [...OCCUPYING_BOOKING_STATUSES]),
  ])

  if (roomErr) throw roomErr
  if (bookErr) throw bookErr
  if (!room) return { updated: false, status: null }

  const occupying = pickRoomStatusBooking((bookings ?? []) as OccupyingBookingRow[])
  const next = deriveRoomStatusFromOccupying(occupying, room.status)
  if (!next || normStatus(next) === normStatus(room.status)) {
    return { updated: false, status: room.status ?? null }
  }

  const { error } = await supabase
    .from('rooms')
    .update({ status: next, updated_at: new Date().toISOString() })
    .eq('id', roomId)
  if (error) throw error

  return { updated: true, status: next }
}

/** Room row status to apply after creating/updating a booking. */
export function roomStatusForBookingStatus(bookingStatus: string): 'occupied' | 'reserved' {
  return bookingStatus === 'checked_in' ? 'occupied' : 'reserved'
}
