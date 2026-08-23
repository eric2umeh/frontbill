'use client'

import { createContext, useContext } from 'react'

import type { PermissionOverrides, RolePermissionOverridesMap } from '@/lib/permission-overrides'

export type { PermissionOverrides, RolePermissionOverridesMap } from '@/lib/permission-overrides'

interface AuthContextValue {
  userId: string
  email: string
  name: string
  role: string
  organizationId: string
  /** Public URL for hotel logo; empty when none */
  organizationLogoUrl: string
  setOrganizationLogoUrl: (url: string) => void
  permissionOverrides?: PermissionOverrides | null
  /** Hotel-wide role permission customizations (Admin/Superadmin). */
  orgRolePermissionOverrides?: RolePermissionOverridesMap | null
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({
  children,
  value,
}: {
  children: React.ReactNode
  value: AuthContextValue
}) {
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext)
  if (!ctx) {
    return {
      userId: '',
      email: '',
      name: '',
      role: '',
      organizationId: '',
      organizationLogoUrl: '',
      setOrganizationLogoUrl: () => {},
      permissionOverrides: null,
      orgRolePermissionOverrides: null,
    }
  }
  return ctx
}
