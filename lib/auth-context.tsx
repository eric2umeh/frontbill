'use client'

import { createContext, useContext } from 'react'

interface AuthContextValue {
  userId: string
  email: string
  name: string
  role: string
  organizationId: string
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
    throw new Error('useAuth must be used within AuthProvider (dashboard layout)')
  }
  return ctx
}
