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

/** FnB outlets for the single Food & Beverage staff role (hotel department). */
export const FOOD_BEVERAGE_OUTLET_DEPARTMENTS: OutletDepartmentKey[] = [
  'restaurant',
  'main_bar',
  'pool_bar',
  'banquets',
]

const OUTLET_ROLE_DEPARTMENTS: Partial<Record<RoleKey, OutletDepartmentKey[]>> = {
  food_beverage: FOOD_BEVERAGE_OUTLET_DEPARTMENTS,
  laundry: ['laundry'],
  gym: ['gym'],
}

const MANAGEMENT_ROLES: RoleKey[] = ['superadmin', 'admin', 'manager']

/** Create, edit, and delete outlet menu categories & items (not outlet POS staff). */
export function canManageOutletMenu(role: string | null | undefined): boolean {
  const rk = canonicalRoleKey(role)
  return rk != null && MANAGEMENT_ROLES.includes(rk)
}

/** Edit or delete/void outlet orders (superadmin, admin, manager). */
export function canManageOutletOrders(role: string | null | undefined): boolean {
  return hasPermission(role, 'outlet:edit')
}

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
