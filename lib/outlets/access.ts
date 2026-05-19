import {
  canonicalRoleKey,
  hasPermission,
  type Permission,
  type RoleKey,
} from '@/lib/permissions'
import {
  OUTLET_DEPARTMENTS,
  type OutletDepartmentKey,
  isOutletDepartmentKey,
} from '@/lib/outlets/departments'

const OUTLET_ROLE_DEPARTMENTS: Partial<Record<RoleKey, OutletDepartmentKey[]>> = {
  restaurant: ['restaurant'],
  bar: ['main_bar', 'pool_bar'],
  laundry: ['laundry'],
  gym: ['gym'],
}

const MANAGEMENT_ROLES: RoleKey[] = ['superadmin', 'admin', 'manager']

export function departmentsForRole(role: string | null | undefined): OutletDepartmentKey[] {
  const rk = canonicalRoleKey(role)
  if (!rk) return []
  if (MANAGEMENT_ROLES.includes(rk)) {
    return OUTLET_DEPARTMENTS.map((d) => d.key)
  }
  const scoped = OUTLET_ROLE_DEPARTMENTS[rk]
  if (scoped) return scoped
  if (hasPermission(role, 'outlet:view')) {
    return OUTLET_DEPARTMENTS.map((d) => d.key)
  }
  return []
}

export function canAccessOutletDepartment(
  role: string | null | undefined,
  department: string,
): boolean {
  if (!isOutletDepartmentKey(department)) return false
  if (!hasPermission(role, 'outlet:view')) return false
  const allowed = departmentsForRole(role)
  return allowed.includes(department)
}

export function hasOutletPermission(
  role: string | null | undefined,
  permission: Permission,
  department?: string,
): boolean {
  if (!hasPermission(role, permission)) return false
  if (!department) return true
  return canAccessOutletDepartment(role, department)
}
