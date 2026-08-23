'use client'

import { useAuth } from '@/lib/auth-context'
import { hasPermission, type Permission } from '@/lib/permissions'

/** Client-side permission check including per-user overrides from auth context. */
export function useHasPermission(permission: Permission): boolean {
  const { role, permissionOverrides, orgRolePermissionOverrides } = useAuth()
  return hasPermission(role, permission, permissionOverrides ?? null, orgRolePermissionOverrides ?? null)
}
