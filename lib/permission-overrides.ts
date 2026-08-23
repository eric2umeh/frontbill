import type { Permission, RoleKey } from '@/lib/permissions'

export type PermissionOverrides = {
  /** Extra permissions beyond the role default. */
  grants?: Permission[]
  /** Permissions removed from the role default (admin/superadmin only). */
  denies?: Permission[]
}

/** Lazy load to avoid circular init with permissions.ts (which imports this module). */
function permissionsModule() {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return require('@/lib/permissions') as typeof import('@/lib/permissions')
}

function allPermissionKeys(): Set<Permission> {
  const { ALL_PERMISSIONS } = permissionsModule()
  return new Set(ALL_PERMISSIONS.map((p) => p.key))
}

export function parsePermissionOverrides(raw: unknown): PermissionOverrides | null {
  if (!raw || typeof raw !== 'object') return null
  const row = raw as { grants?: unknown; denies?: unknown }
  const ALL_KEYS = allPermissionKeys()
  const grants = Array.isArray(row.grants)
    ? row.grants.filter((p): p is Permission => typeof p === 'string' && ALL_KEYS.has(p as Permission))
    : []
  const denies = Array.isArray(row.denies)
    ? row.denies.filter((p): p is Permission => typeof p === 'string' && ALL_KEYS.has(p as Permission))
    : []
  if (grants.length === 0 && denies.length === 0) return null
  return { grants, denies }
}

/** Effective permission set for a user (role defaults + grants − denies). */
export function resolveEffectivePermissions(
  roleKey: RoleKey | null,
  overrides?: PermissionOverrides | null,
): Set<Permission> {
  const { getRoleDefinition } = permissionsModule()
  const role = roleKey ? getRoleDefinition(roleKey) : null
  const base = new Set<Permission>(role?.permissions ?? [])
  for (const g of overrides?.grants ?? []) base.add(g)
  for (const d of overrides?.denies ?? []) base.delete(d)
  return base
}

export function hasPermissionWithOverrides(
  roleKey: RoleKey | null,
  permission: Permission,
  overrides?: PermissionOverrides | null,
): boolean {
  return resolveEffectivePermissions(roleKey, overrides).has(permission)
}
