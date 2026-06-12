import type { SupabaseClient } from '@supabase/supabase-js'

const CANCELLABLE_RESERVATION_STATUSES = ['reserved']
const ROOM_STATUSES_TO_RECONCILE_AFTER_CANCEL = ['reserved', 'occupied']
const ACTIVE_ROOM_HOLD_STATUSES = ['checked_in', 'confirmed', 'reserved']
const CLOSED_FOLIO_STATUSES = ['checked_out', 'cancelled']

type RemainingRoomBooking = {
  status?: string | null
  folio_status?: string | null
}

export function isCancellableReservationStatus(status: unknown): boolean {
  return CANCELLABLE_RESERVATION_STATUSES.includes(
    String(status || '').toLowerCase(),
  )
}

function normStatus(status: unknown): string {
  return String(status || '').toLowerCase().replace(/-/g, '_')
}

function isActiveRoomHold(booking: RemainingRoomBooking): boolean {
  const status = normStatus(booking.status)
  const folioStatus = normStatus(booking.folio_status || 'active')
  return ACTIVE_ROOM_HOLD_STATUSES.includes(status) && !CLOSED_FOLIO_STATUSES.includes(folioStatus)
}

export function roomStatusAfterReservationCancel(
  remainingBookings: RemainingRoomBooking[],
  currentRoomStatus: unknown,
): 'available' | 'occupied' | 'reserved' | null {
  const currentStatus = normStatus(currentRoomStatus)
  if (!ROOM_STATUSES_TO_RECONCILE_AFTER_CANCEL.includes(currentStatus)) return null

  const activeHolds = remainingBookings.filter(isActiveRoomHold)
  if (activeHolds.some((booking) => normStatus(booking.status) === 'checked_in')) return 'occupied'
  if (activeHolds.length > 0) return 'reserved'
  return 'available'
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
    .select('id, status, room_id')
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
      updated_by: input.userId || null,
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
    const [{ data: room, error: roomFetchErr }, { data: remainingBookings, error: bookingFetchErr }] = await Promise.all([
      supabase.from('rooms').select('id, status').eq('id', roomId).maybeSingle(),
      supabase
        .from('bookings')
        .select('id, status, folio_status')
        .eq('room_id', roomId)
        .in('status', ACTIVE_ROOM_HOLD_STATUSES)
        .neq('id', input.bookingId),
    ])

    if (roomFetchErr) return { error: roomFetchErr.message }
    if (bookingFetchErr) return { error: bookingFetchErr.message }

    const nextRoomStatus = roomStatusAfterReservationCancel(remainingBookings ?? [], room?.status)
    if (nextRoomStatus && nextRoomStatus !== normStatus(room?.status)) {
      const { error: roomErr } = await supabase
        .from('rooms')
        .update({ status: nextRoomStatus, updated_at: new Date().toISOString() })
        .eq('id', roomId)
        .in('status', ROOM_STATUSES_TO_RECONCILE_AFTER_CANCEL)
      if (roomErr) return { error: roomErr.message }
    }
  }

  return { error: null }
}
