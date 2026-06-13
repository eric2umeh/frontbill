import type { SupabaseClient } from '@supabase/supabase-js'
import { resolveHotelTimeZone } from '@/lib/hotel-date'
import { isInHouseOnCalendarDay, todayYmdHotel } from '@/lib/utils/booking-in-house-dates'

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

/** Active in-house folio on a room (matches bookings in-house list / outlets charge-to-room). */
export function pickOccupyingBooking<T extends OccupyingBookingRow>(rows: T[]): T | null {
  const today = todayYmdHotel()
  const tz = resolveHotelTimeZone()

  const open = rows.filter((b) => {
    const fs = String(b.folio_status || 'active').toLowerCase()
    if (fs === 'checked_out' || fs === 'cancelled') return false
    if (b.status === 'checked_out' || b.status === 'cancelled') return false
    if (!OCCUPYING_BOOKING_STATUSES.includes(b.status as (typeof OCCUPYING_BOOKING_STATUSES)[number])) {
      return false
    }
    if (b.status === 'checked_in') return true
    return isInHouseOnCalendarDay(b.check_in, b.check_out, today, tz)
  })

  const rank = (s: string) => (s === 'checked_in' ? 0 : s === 'confirmed' ? 1 : 2)
  open.sort((a, b) => rank(a.status) - rank(b.status))
  return open[0] ?? null
}

/** Active hold that should keep a room unavailable, including future reservations. */
export function pickRoomStatusHoldBooking<T extends OccupyingBookingRow>(rows: T[]): T | null {
  const today = todayYmdHotel()

  const open = rows.filter((b) => {
    const status = normStatus(b.status)
    const fs = normStatus(b.folio_status)
    if (fs === 'checked_out' || fs === 'cancelled') return false
    if (status === 'checked_out' || status === 'cancelled') return false
    if (!OCCUPYING_BOOKING_STATUSES.includes(status as (typeof OCCUPYING_BOOKING_STATUSES)[number])) {
      return false
    }
    if (status === 'checked_in') return true

    const checkOut = String(b.check_out || '').slice(0, 10)
    return !!checkOut && checkOut > today
  })

  const rank = (s: string) => (normStatus(s) === 'checked_in' ? 0 : normStatus(s) === 'confirmed' ? 1 : 2)
  open.sort((a, b) => rank(a.status) - rank(b.status))
  return open[0] ?? null
}

/** PMS room status from the active folio on that room. Returns null if housekeeping block should stay. */
export function deriveRoomStatusFromOccupying(
  occupying: Pick<OccupyingBookingRow, 'status'> | null,
  currentStatus: string | null | undefined,
): string | null {
  const cur = normStatus(currentStatus)
  if (cur === 'maintenance' || cur === 'out_of_order') return null

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

export async function reconcileRoomStatusForRoom(
  supabase: SupabaseClient,
  input: { roomId: string; organizationId?: string | null },
): Promise<{ updated: boolean; status: string | null }> {
  let roomQuery = supabase.from('rooms').select('id, status').eq('id', input.roomId)
  let bookingQuery = supabase
    .from('bookings')
    .select('id, room_id, status, check_in, check_out, folio_status')
    .eq('room_id', input.roomId)
    .in('status', [...OCCUPYING_BOOKING_STATUSES])

  if (input.organizationId) {
    roomQuery = roomQuery.eq('organization_id', input.organizationId)
    bookingQuery = bookingQuery.eq('organization_id', input.organizationId)
  }

  const [{ data: room, error: roomErr }, { data: bookings, error: bookErr }] = await Promise.all([
    roomQuery.maybeSingle(),
    bookingQuery,
  ])

  if (roomErr) throw roomErr
  if (bookErr) throw bookErr
  if (!room) return { updated: false, status: null }

  const hold = pickRoomStatusHoldBooking((bookings ?? []) as OccupyingBookingRow[])
  const next = deriveRoomStatusFromOccupying(hold, room.status)
  if (!next || normStatus(next) === normStatus(room.status)) {
    return { updated: false, status: next }
  }

  let updateQuery = supabase
    .from('rooms')
    .update({ status: next, updated_at: new Date().toISOString() })
    .eq('id', input.roomId)

  if (input.organizationId) {
    updateQuery = updateQuery.eq('organization_id', input.organizationId)
  }

  const { error } = await updateQuery
  if (error) throw error

  return { updated: true, status: next }
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
    const occupying = pickRoomStatusHoldBooking(byRoom.get(room.id) ?? [])
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

/** Room row status to apply after creating/updating a booking. */
export function roomStatusForBookingStatus(bookingStatus: string): 'occupied' | 'reserved' {
  return bookingStatus === 'checked_in' ? 'occupied' : 'reserved'
}
