import { canonicalRoleKey } from '@/lib/permissions'

/** Only the Housekeeper role may change housekeeping floor status (not admin/manager). */
export function canUpdateHousekeepingRoomStatus(role: string): boolean {
  return canonicalRoleKey(role) === 'housekeeping'
}
