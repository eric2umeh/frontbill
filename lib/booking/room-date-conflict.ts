import type { createAdminClient } from '@/lib/supabase/admin'

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

  for (const row of rows || []) {
    const st = String((row as { status?: string }).status || '').toLowerCase()
    const fs = String((row as { folio_status?: string }).folio_status || '').toLowerCase()
    if (st === 'cancelled' || st === 'checked_out') continue
    if (fs === 'checked_out') continue
    const oi = (row as { check_in: string }).check_in
    const oo = (row as { check_out: string }).check_out
    if (oi < checkOut && oo > checkIn) return true
  }
  return false
}
