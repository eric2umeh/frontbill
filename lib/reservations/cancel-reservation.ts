import type { SupabaseClient } from '@supabase/supabase-js'
import { releaseRoomIfUnoccupied } from '@/lib/rooms/room-occupancy'

const CANCELLABLE_RESERVATION_STATUSES = ['reserved']

export function isCancellableReservationStatus(status: unknown): boolean {
  return CANCELLABLE_RESERVATION_STATUSES.includes(
    String(status || '').toLowerCase(),
  )
}

export async function cancelBookingReservation(
  supabase: SupabaseClient,
  input: {
    bookingId: string
    roomId?: string | null
    userId?: string | null
  },
): Promise<{ error: string | null }> {
  const { data: booking, error: fetchErr } = await supabase
    .from('bookings')
    .select('id, status, room_id, organization_id')
    .eq('id', input.bookingId)
    .maybeSingle()

  if (fetchErr) return { error: fetchErr.message }
  if (!booking) return { error: 'Reservation not found' }
  if (!isCancellableReservationStatus(booking.status)) {
    return { error: 'Only held reservations can be cancelled' }
  }

  const { data: updated, error } = await supabase
    .from('bookings')
    .update({
      status: 'cancelled',
      updated_at: new Date().toISOString(),
    })
    .eq('id', input.bookingId)
    .in('status', CANCELLABLE_RESERVATION_STATUSES)
    .select('id')
    .maybeSingle()

  if (error) return { error: error.message }
  if (!updated) return { error: 'Reservation is no longer cancellable' }

  const roomId = input.roomId ?? booking.room_id
  if (roomId) {
    const { error: roomErr } = await releaseRoomIfUnoccupied(supabase, {
      roomId,
      organizationId: (booking as { organization_id?: string }).organization_id,
      excludeBookingId: input.bookingId,
    })
    if (roomErr) return { error: roomErr }
  }

  return { error: null }
}
