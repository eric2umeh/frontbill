export const ACTIVE_ROOM_HOLD_STATUSES = ['confirmed', 'reserved', 'checked_in'] as const

export interface ActiveRoomHold {
  room_id: string | null
  check_in: string
  check_out: string
}

export function overlappingBookedRoomIds(
  holds: ActiveRoomHold[],
  checkIn: string,
  checkOut: string,
): Set<string> {
  return new Set(
    holds
      .filter((hold) => hold.check_in < checkOut && hold.check_out > checkIn && hold.room_id)
      .map((hold) => hold.room_id as string),
  )
}
