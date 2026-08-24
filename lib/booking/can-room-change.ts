import { canonicalRoleKey, hasPermission } from '@/lib/permissions'

/** Submit a room-change request (or apply immediately when allowed). */
export function canRequestRoomChange(role: string | null | undefined): boolean {
  return hasPermission(role, 'room_change:request')
}

/**
 * Front desk / receptionist may move a guest to another room immediately —
 * Night Audit approval is optional, not required.
 */
export function canFrontDeskApplyRoomChange(role: string | null | undefined): boolean {
  const k = canonicalRoleKey(role)
  return k === 'front_desk' || k === 'receptionist'
}

/** Approve or reject pending room-change requests (manager / admin / superadmin). */
export function canApproveRoomChange(role: string | null | undefined): boolean {
  return hasPermission(role, 'room_change:approve')
}
