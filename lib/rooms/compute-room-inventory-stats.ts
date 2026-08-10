import type { OccupyingBookingRow } from '@/lib/rooms/room-occupancy'
import {
  computeFrontOfficeStayStats,
  countPhysicallyHeldRooms,
  type FrontOfficeStayStats,
} from '@/lib/rooms/front-office-stay'

export type RoomInventoryStats = {
  total: number
  available: number
  /** Checked-in staying guests only (excludes due-out and reservations). */
  occupied: number
  dueOut: number
  reserved: number
  outOfOrder: number
  /** Occ + Due rooms still held — for occupancy rate. */
  physicallyHeld: number
}

function normStatus(s: string | null | undefined): string {
  return String(s || '').toLowerCase().replace(/-/g, '_')
}

/** Count rooms by housekeeping/PMS status (view-only dashboard strip). */
export function computeRoomInventoryStats(
  rows: { status?: string | null }[],
): Omit<RoomInventoryStats, 'dueOut' | 'reserved' | 'physicallyHeld'> & {
  dueOut?: number
  reserved?: number
  physicallyHeld?: number
} {
  let available = 0
  let occupied = 0
  let outOfOrder = 0
  for (const r of rows) {
    const s = normStatus(r.status)
    if (s === 'occupied') occupied += 1
    else if (s === 'out_of_order') outOfOrder += 1
    else if (s === 'available') available += 1
  }
  return {
    total: rows.length,
    available,
    occupied,
    outOfOrder,
  }
}

/**
 * Room strip stats aligned with Bookings: Occ / Due / Res are mutually exclusive folio counts.
 */
export function computeRoomInventoryStatsWithBookings(
  rooms: { status?: string | null }[],
  bookings: OccupyingBookingRow[],
): RoomInventoryStats {
  const base = computeRoomInventoryStats(rooms)
  const stay: FrontOfficeStayStats = computeFrontOfficeStayStats(bookings)
  const physicallyHeld = countPhysicallyHeldRooms(bookings)
  const ooo = base.outOfOrder
  // Avail for check-in ≈ sellable rooms not held by Occ/Due and not OOO
  const availableForCheckin = Math.max(0, base.total - physicallyHeld - ooo)

  return {
    total: base.total,
    available: availableForCheckin,
    occupied: stay.occupied,
    dueOut: stay.dueOut,
    reserved: stay.reserved,
    outOfOrder: ooo,
    physicallyHeld,
  }
}
