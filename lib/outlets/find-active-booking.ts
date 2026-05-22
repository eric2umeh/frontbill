import type { SupabaseClient } from '@supabase/supabase-js'
import { findOccupyingBookingByRoom, type OccupyingBookingForRoom } from '@/lib/outlets/occupying-booking'

export type ActiveBookingForRoom = OccupyingBookingForRoom

/** @deprecated Name kept for API routes — uses in-house + checked-in logic, not only `checked_in`. */
export async function findActiveBookingByRoom(
  supabase: SupabaseClient,
  organizationId: string,
  roomNumber: string,
): Promise<ActiveBookingForRoom | null> {
  return findOccupyingBookingByRoom(supabase, organizationId, roomNumber)
}
