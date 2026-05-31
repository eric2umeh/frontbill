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

/** Active or future folio that should keep a room unavailable in PMS inventory. */
export function pickRoomStatusBooking<T extends OccupyingBookingRow>(rows: T[]): T | null {
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
    const checkOut = bookingYmdHotel(b.check_out, tz)
    return Boolean(checkOut && checkOut >= today)
  })

  const rank = (s: string) => (s === 'checked_in' ? 0 : s === 'confirmed' ? 1 : 2)
  open.sort((a, b) => rank(a.status) - rank(b.status))
  return open[0] ?? null
}

/** PMS room status from the booking held on that room. Returns null if housekeeping block should stay. */
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

  if (occupying.status === 'checked_in') return 'occupied'
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
 * Align rooms.status with active folios/holds: free rooms after checkout, mark occupied/reserved from bookings.
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

/** Room row status to apply after creating/updating a booking. */
export function roomStatusForBookingStatus(bookingStatus: string): 'occupied' | 'reserved' {
  return bookingStatus === 'checked_in' ? 'occupied' : 'reserved'
}
