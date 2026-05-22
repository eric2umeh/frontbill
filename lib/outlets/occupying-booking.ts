import type { SupabaseClient } from '@supabase/supabase-js'
import { resolveHotelTimeZone } from '@/lib/hotel-date'
import { isInHouseOnCalendarDay, todayYmdHotel } from '@/lib/utils/booking-in-house-dates'

export type OccupyingBookingForRoom = {
  id: string
  folio_id: string | null
  guest_id: string | null
  guest_name: string | null
  room_number: string | null
  status: string
}

const OCCUPYING_STATUSES = ['checked_in', 'confirmed', 'reserved'] as const

function normalizeRoomNumber(value: string): string {
  return value.trim().toLowerCase()
}

/** Resolve room rows by exact room number (trimmed), then case-insensitive exact match. */
export async function findRoomsByNumber(
  supabase: SupabaseClient,
  organizationId: string,
  roomNumber: string,
): Promise<Array<{ id: string; room_number: string }>> {
  const term = roomNumber.trim()
  if (!term) return []

  const { data: exact } = await supabase
    .from('rooms')
    .select('id, room_number')
    .eq('organization_id', organizationId)
    .eq('room_number', term)
    .limit(5)

  if (exact?.length) return exact

  const norm = normalizeRoomNumber(term)
  const { data: all } = await supabase
    .from('rooms')
    .select('id, room_number')
    .eq('organization_id', organizationId)
    .limit(500)

  return (all ?? [])
    .filter((r) => normalizeRoomNumber(String(r.room_number)) === norm)
    .slice(0, 5)
}

function pickOccupyingBooking(
  rows: Array<{
    id: string
    folio_id: string | null
    guest_id: string | null
    status: string
    check_in: string
    check_out: string
    folio_status?: string | null
    guests: { name?: string } | { name?: string }[] | null
    rooms: { room_number?: string } | { room_number?: string }[] | null
  }>,
): (typeof rows)[0] | null {
  const today = todayYmdHotel()
  const tz = resolveHotelTimeZone()

  const open = rows.filter((b) => {
    const fs = String(b.folio_status || 'active').toLowerCase()
    if (fs === 'checked_out' || fs === 'cancelled') return false
    if (!OCCUPYING_STATUSES.includes(b.status as (typeof OCCUPYING_STATUSES)[number])) {
      return false
    }
    if (b.status === 'checked_in') return true
    return isInHouseOnCalendarDay(b.check_in, b.check_out, today, tz)
  })

  const rank = (s: string) => (s === 'checked_in' ? 0 : s === 'confirmed' ? 1 : 2)
  open.sort((a, b) => rank(a.status) - rank(b.status))
  return open[0] ?? null
}

function guestNameFromJoin(guests: { name?: string } | { name?: string }[] | null): string | null {
  if (!guests) return null
  if (Array.isArray(guests)) return guests[0]?.name ?? null
  return guests.name ?? null
}

function roomNumberFromJoin(rooms: { room_number?: string } | { room_number?: string }[] | null): string | null {
  if (!rooms) return null
  if (Array.isArray(rooms)) return rooms[0]?.room_number ?? null
  return rooms.room_number ?? null
}

/** In-house or checked-in booking for a room (outlet charge-to-room). */
export async function findOccupyingBookingByRoom(
  supabase: SupabaseClient,
  organizationId: string,
  roomNumber: string,
): Promise<OccupyingBookingForRoom | null> {
  const rooms = await findRoomsByNumber(supabase, organizationId, roomNumber)
  if (!rooms.length) return null

  const { data: bookings } = await supabase
    .from('bookings')
    .select(
      'id, folio_id, guest_id, room_id, status, check_in, check_out, folio_status, guests(name), rooms(room_number)',
    )
    .eq('organization_id', organizationId)
    .in('room_id', rooms.map((r) => r.id))
    .in('status', [...OCCUPYING_STATUSES])
    .order('check_in', { ascending: false })
    .limit(20)

  const b = pickOccupyingBooking(bookings ?? [])
  if (!b) return null

  return {
    id: b.id,
    folio_id: b.folio_id ?? null,
    guest_id: b.guest_id ?? null,
    guest_name: guestNameFromJoin(b.guests),
    room_number: roomNumberFromJoin(b.rooms) ?? rooms[0]?.room_number ?? roomNumber.trim(),
    status: b.status,
  }
}

/** Batch: occupying booking per room id (for room picker). */
export async function mapOccupyingBookingsByRoomId(
  supabase: SupabaseClient,
  organizationId: string,
  roomIds: string[],
): Promise<
  Map<string, { id: string; guest_name: string | null; folio_id: string | null; status: string }>
> {
  const result = new Map<
    string,
    { id: string; guest_name: string | null; folio_id: string | null; status: string }
  >()
  if (!roomIds.length) return result

  const { data: bookings } = await supabase
    .from('bookings')
    .select(
      'id, folio_id, guest_id, room_id, status, check_in, check_out, folio_status, guests(name)',
    )
    .eq('organization_id', organizationId)
    .in('room_id', roomIds)
    .in('status', [...OCCUPYING_STATUSES])
    .order('check_in', { ascending: false })

  const byRoom = new Map<string, typeof bookings>()
  for (const b of bookings ?? []) {
    if (!b.room_id) continue
    if (!byRoom.has(b.room_id)) byRoom.set(b.room_id, [])
    byRoom.get(b.room_id)!.push(b)
  }

  for (const [roomId, rows] of byRoom) {
    const picked = pickOccupyingBooking(
      rows.map((b) => ({
        ...b,
        rooms: null,
        guests: b.guests as { name?: string } | null,
      })),
    )
    if (!picked) continue
    result.set(roomId, {
      id: picked.id,
      guest_name: guestNameFromJoin(picked.guests),
      folio_id: picked.folio_id ?? null,
      status: picked.status,
    })
  }

  return result
}
