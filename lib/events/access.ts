import { canonicalRoleKey, hasPermission, type RoleKey } from '@/lib/permissions'

const EVENT_MANAGER_ROLES: RoleKey[] = ['superadmin', 'admin', 'manager', 'front_desk']

/** Create, edit, and delete events (admin, superadmin, front desk, manager). */
export function canManageEvents(role: string | null | undefined): boolean {
  const rk = canonicalRoleKey(role)
  return rk != null && EVENT_MANAGER_ROLES.includes(rk)
}

export function canViewEvents(role: string | null | undefined): boolean {
  return hasPermission(role, 'events:view')
}
