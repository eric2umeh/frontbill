import { canonicalRoleKey } from '@/lib/permissions'

/** Admin / Superadmin may set any housekeeping floor status from the HK menu. */
export function canAdminOverrideHousekeepingStatus(role: string): boolean {
  const k = canonicalRoleKey(role)
  return k === 'admin' || k === 'superadmin'
}

/** Housekeeper, Admin, or Superadmin may open the HK status editor. */
export function canUpdateHousekeepingRoomStatus(role: string): boolean {
  const k = canonicalRoleKey(role)
  return k === 'housekeeping' || k === 'admin' || k === 'superadmin'
}

/** Only housekeepers are limited to the checkout/vacant/OOO transition matrix. */
export function shouldEnforceHousekeeperTransitions(role: string): boolean {
  return canonicalRoleKey(role) === 'housekeeping'
}
