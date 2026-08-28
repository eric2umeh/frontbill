import type { createAdminClient } from '@/lib/supabase/admin'
import { staysOverlap } from '@/lib/utils/room-bookability'

export type RoomStayConflictRow = {
  id?: string | null
  check_in?: string | null
  check_out?: string | null
  status?: string | null
  folio_status?: string | null
}

function normStatus(value: string | null | undefined): string {
  return String(value || '')
    .toLowerCase()
    .trim()
    .replace(/-/g, '_')
}

/**
 * True when this folio still holds the room over the proposed stay.
 * Cancelled / checked-out / no-show rows do not block (inventory was released).
 */
export function stayRowBlocksRange(
  row: RoomStayConflictRow,
  checkIn: string,
  checkOut: string,
  excludeBookingId?: string | null,
): boolean {
  if (excludeBookingId && row.id && String(row.id) === String(excludeBookingId)) {
    return false
  }
  const st = normStatus(row.status)
  const fs = normStatus(row.folio_status)
  if (st === 'cancelled' || st === 'checked_out' || st === 'no_show') return false
  if (fs === 'checked_out' || fs === 'cancelled') return false
  return staysOverlap(row.check_in, row.check_out, checkIn, checkOut)
}

export function hasConflictingStayOnRoom(
  rows: RoomStayConflictRow[],
  checkIn: string,
  checkOut: string,
  excludeBookingId?: string | null,
): boolean {
  return rows.some((row) => stayRowBlocksRange(row, checkIn, checkOut, excludeBookingId))
}

/** Overlapping active stays on the same room (excluding one booking). */
export async function hasRoomDateConflict(
  admin: ReturnType<typeof createAdminClient>,
  orgId: string,
  roomId: string,
  checkIn: string,
  checkOut: string,
  excludeBookingId: string,
): Promise<boolean> {
  const { data: rows, error } = await admin
    .from('bookings')
    .select('id, check_in, check_out, status, folio_status')
    .eq('organization_id', orgId)
    .eq('room_id', roomId)
    .neq('id', excludeBookingId)

  if (error) throw new Error(error.message)

  return hasConflictingStayOnRoom(rows || [], checkIn, checkOut, excludeBookingId)
}
