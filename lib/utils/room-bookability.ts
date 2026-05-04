/**
 * Rooms that are not in maintenance can be assigned when the calendar is free.
 * Housekeeping statuses (cleaning, occupied, reserved, available) must not hide
 * rooms from booking pickers — the Rooms menu and booking flow stay in sync.
 */
export function isRoomAssignable(status: string | null | undefined): boolean {
  return String(status ?? '').toLowerCase().trim() !== 'maintenance'
}

/** Supabase REST often caps rows (~1000); large hotels need an explicit ceiling. */
export const BOOKING_MODAL_ROOMS_LIMIT = 20_000

const DEFAULT_ROOM_TYPE_LABEL = 'Standard'

/**
 * After fetch: trim room_number, coerce blank room_type (legacy / bad imports), exclude maintenance only.
 */
export function normalizeRoomsForBookingPickers(roomData: unknown[] | null | undefined): Record<string, unknown>[] {
  if (!roomData?.length) return []

  const out: Record<string, unknown>[] = []
  for (const raw of roomData) {
    const r = raw as Record<string, unknown>
    const id = r.id as string | undefined
    if (!id) continue

    const numRaw = r.room_number
    const room_number =
      typeof numRaw === 'string'
        ? numRaw.trim()
        : numRaw !== null && numRaw !== undefined
          ? String(numRaw).trim()
          : ''
    if (!room_number) continue
    if (!isRoomAssignable(r.status as string | undefined)) continue

    const rt = String(r.room_type ?? '').replace(/\s+/g, ' ').trim()
    const room_type = rt || DEFAULT_ROOM_TYPE_LABEL

    out.push({ ...r, id, room_number, room_type })
  }
  return out
}
