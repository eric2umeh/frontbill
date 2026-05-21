import type { SupabaseClient } from '@supabase/supabase-js'

export async function cancelBookingReservation(
  supabase: SupabaseClient,
  input: {
    bookingId: string
    roomId?: string | null
    userId?: string | null
  },
): Promise<{ error: string | null }> {
  const { error } = await supabase
    .from('bookings')
    .update({
      status: 'cancelled',
      updated_by: input.userId || null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', input.bookingId)

  if (error) return { error: error.message }

  if (input.roomId) {
    const { error: roomErr } = await supabase
      .from('rooms')
      .update({ status: 'available', updated_at: new Date().toISOString() })
      .eq('id', input.roomId)
    if (roomErr) return { error: roomErr.message }
  }

  return { error: null }
}
