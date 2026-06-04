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

function activeRoomBookingRows<T extends OccupyingBookingRow>(rows: T[]): T[] {
  return rows.filter((b) => {
    const fs = normStatus(b.folio_status || 'active')
    const status = normStatus(b.status)
    if (fs === 'checked_out' || fs === 'cancelled') return false
    if (status === 'checked_out' || status === 'cancelled') return false
    return OCCUPYING_BOOKING_STATUSES.includes(status as (typeof OCCUPYING_BOOKING_STATUSES)[number])
  })
}

/** Active in-house folio on a room (matches bookings in-house list / outlets charge-to-room). */
export function pickOccupyingBooking<T extends OccupyingBookingRow>(rows: T[]): T | null {
  const today = todayYmdHotel()
  const tz = resolveHotelTimeZone()

  const open = activeRoomBookingRows(rows).filter((b) => {
    const status = normStatus(b.status)
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

/** Booking that should drive rooms.status: current in-house first, then future room holds. */
export function pickRoomStatusBooking<T extends OccupyingBookingRow>(rows: T[]): T | null {
  const today = todayYmdHotel()
  const tz = resolveHotelTimeZone()

  const open = activeRoomBookingRows(rows).filter((b) => {
    const status = normStatus(b.status)
    if (status === 'checked_in') return true
    if (isInHouseOnCalendarDay(b.check_in, b.check_out, today, tz)) return true
    const checkIn = bookingYmdHotel(b.check_in, tz)
    return Boolean(checkIn && checkIn > today)
  })

  const rank = (b: OccupyingBookingRow) => {
    const status = normStatus(b.status)
    if (status === 'checked_in') return 0
    if (isInHouseOnCalendarDay(b.check_in, b.check_out, today, tz)) return 1
    return 2
  }
  open.sort((a, b) => {
    const ranked = rank(a) - rank(b)
    if (ranked !== 0) return ranked
    return bookingYmdHotel(a.check_in, tz).localeCompare(bookingYmdHotel(b.check_in, tz))
  })
  return open[0] ?? null
}

/** PMS room status from the active/future booking on that room. Returns null if a manual block should stay. */
export function deriveRoomStatusFromOccupying(
  occupying: Pick<OccupyingBookingRow, 'status'> | null,
  currentStatus: string | null | undefined,
): string | null {
  const cur = normStatus(currentStatus)
  const occStatus = normStatus(occupying?.status)
  if (cur === 'maintenance' || cur === 'out_of_order') return null
  if (cur === 'cleaning' && occStatus !== 'checked_in') return null

  if (!occupying) {
    if (cur === 'occupied' || cur === 'reserved') return 'available'
    return null
  }

  if (occStatus === 'checked_in') return 'occupied'
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
 * Align rooms.status with active folios and future room holds.
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
