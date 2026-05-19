import type { SupabaseClient } from '@supabase/supabase-js'

export type ActiveBookingForRoom = {
  id: string
  folio_id: string | null
  guest_id: string | null
  guest_name: string | null
  room_number: string | null
}

/** Checked-in booking for a room number (for outlet charge-to-ledger). */
export async function findActiveBookingByRoom(
  supabase: SupabaseClient,
  organizationId: string,
  roomNumber: string,
): Promise<ActiveBookingForRoom | null> {
  const room = roomNumber.trim()
  if (!room) return null

  const { data: rooms } = await supabase
    .from('rooms')
    .select('id, room_number')
    .eq('organization_id', organizationId)
    .ilike('room_number', room)
    .limit(5)

  if (!rooms?.length) return null
  const roomIds = rooms.map((r) => r.id)

  const { data: bookings } = await supabase
    .from('bookings')
    .select('id, folio_id, guest_id, room_id, guests(name), rooms(room_number)')
    .eq('organization_id', organizationId)
    .eq('status', 'checked_in')
    .in('room_id', roomIds)
    .order('check_in', { ascending: false })
    .limit(1)

  const b = bookings?.[0]
  if (!b) return null

  const guest = b.guests as { name?: string } | null
  const rm = b.rooms as { room_number?: string } | null

  return {
    id: b.id,
    folio_id: b.folio_id ?? null,
    guest_id: b.guest_id ?? null,
    guest_name: guest?.name ?? null,
    room_number: rm?.room_number ?? room,
  }
}
