import { housekeepingStatusLabel } from '@/lib/rooms/housekeeping-status'

export type HousekeepingFloorRoomRow = {
  room_id: string
  room_number: string
  room_type: string
  pms_status: string
  housekeeping_status: string | null
  housekeeping_status_label: string
  guest_name: string | null
  stay_check_in: string | null
  stay_check_out: string | null
  stay_status: string | null
}

export type HousekeepingFutureReservationRow = {
  booking_id: string
  folio_id: string | null
  guest_name: string
  room_number: string
  room_type: string
  check_in: string
  check_out: string
  status: string
}

export type HousekeepingFloorReport = {
  as_of_date: string
  rooms: HousekeepingFloorRoomRow[]
  future_reservations: HousekeepingFutureReservationRow[]
}

function ymd(value: unknown): string {
  if (!value) return ''
  const s = String(value)
  return s.includes('T') ? s.slice(0, 10) : s.slice(0, 10)
}

function guestNameFromJoin(guests: unknown): string {
  const row = Array.isArray(guests) ? guests[0] : guests
  if (!row || typeof row !== 'object') return 'Guest'
  const name = (row as { name?: string }).name
  return String(name || '').trim() || 'Guest'
}

function roomFromJoin(rooms: unknown): { room_number: string; room_type: string } {
  const row = Array.isArray(rooms) ? rooms[0] : rooms
  if (!row || typeof row !== 'object') {
    return { room_number: '—', room_type: '—' }
  }
  return {
    room_number: String((row as { room_number?: string }).room_number || '—'),
    room_type: String((row as { room_type?: string }).room_type || 'Standard'),
  }
}

type RoomDbRow = {
  id: string
  room_number: string
  room_type: string | null
  status: string | null
  housekeeping_status: string | null
}

type BookingDbRow = {
  id: string
  room_id: string | null
  check_in: string
  check_out: string
  status: string
  folio_id?: string | null
  folio_status?: string | null
  guests?: unknown
  rooms?: unknown
}

/** Pick the active in-house folio on a room for display (no financial fields). */
export function pickInHouseBookingForRoom(
  rows: BookingDbRow[],
  todayYmd: string,
): BookingDbRow | null {
  const open = rows.filter((b) => {
    const st = String(b.status || '').toLowerCase()
    const fs = String(b.folio_status || 'active').toLowerCase()
    if (st === 'checked_out' || st === 'cancelled') return false
    if (fs === 'checked_out' || fs === 'cancelled') return false
    if (!['checked_in', 'confirmed', 'reserved'].includes(st)) return false
    const ci = ymd(b.check_in)
    const co = ymd(b.check_out)
    return ci <= todayYmd && co > todayYmd
  })
  const rank = (s: string) =>
    s === 'checked_in' ? 0 : s === 'confirmed' ? 1 : 2
  open.sort((a, b) => rank(a.status) - rank(b.status))
  return open[0] ?? null
}

export function buildHousekeepingFloorReport(input: {
  asOfDate: string
  rooms: RoomDbRow[]
  bookings: BookingDbRow[]
}): HousekeepingFloorReport {
  const today = input.asOfDate
  const byRoom = new Map<string, BookingDbRow[]>()
  for (const b of input.bookings) {
    if (!b.room_id) continue
    if (!byRoom.has(b.room_id)) byRoom.set(b.room_id, [])
    byRoom.get(b.room_id)!.push(b)
  }

  const rooms: HousekeepingFloorRoomRow[] = (input.rooms || [])
    .map((r) => {
      const inHouse = pickInHouseBookingForRoom(byRoom.get(r.id) ?? [], today)
      return {
        room_id: r.id,
        room_number: String(r.room_number || ''),
        room_type: String(r.room_type || 'Standard'),
        pms_status: String(r.status || 'available'),
        housekeeping_status: r.housekeeping_status,
        housekeeping_status_label: r.housekeeping_status
          ? housekeepingStatusLabel(r.housekeeping_status)
          : 'Not set',
        guest_name: inHouse ? guestNameFromJoin(inHouse.guests) : null,
        stay_check_in: inHouse ? ymd(inHouse.check_in) : null,
        stay_check_out: inHouse ? ymd(inHouse.check_out) : null,
        stay_status: inHouse ? inHouse.status : null,
      }
    })
    .sort((a, b) =>
      a.room_number.localeCompare(b.room_number, undefined, { numeric: true }),
    )

  const future_reservations: HousekeepingFutureReservationRow[] = (input.bookings || [])
    .filter((b) => {
      const st = String(b.status || '').toLowerCase()
      if (!['reserved', 'confirmed'].includes(st)) return false
      const ci = ymd(b.check_in)
      return ci >= today
    })
    .map((b) => {
      const room = roomFromJoin(b.rooms)
      return {
        booking_id: b.id,
        folio_id: b.folio_id ? String(b.folio_id) : null,
        guest_name: guestNameFromJoin(b.guests),
        room_number: room.room_number,
        room_type: room.room_type,
        check_in: ymd(b.check_in),
        check_out: ymd(b.check_out),
        status: b.status,
      }
    })
    .sort((a, b) => {
      const d = a.check_in.localeCompare(b.check_in)
      if (d !== 0) return d
      return a.room_number.localeCompare(b.room_number, undefined, { numeric: true })
    })

  return {
    as_of_date: today,
    rooms,
    future_reservations,
  }
}
