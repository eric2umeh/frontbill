/**
 * Rooms that are not in maintenance can be assigned when the calendar is free.
 * Housekeeping statuses (cleaning, occupied, reserved, available) must not hide
 * rooms from booking pickers — the Rooms menu and booking flow stay in sync.
 */
export function isRoomAssignable(status: string | null | undefined): boolean {
  return String(status ?? '').toLowerCase().trim() !== 'maintenance'
}
