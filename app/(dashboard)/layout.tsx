'use client'

import { useEffect, useState } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { Sidebar } from '@/components/layout/sidebar'
import { Header } from '@/components/layout/header'
import { LoadingScreen } from '@/components/shared/loading-screen'
import { createClient } from '@/lib/supabase/client'
import { AuthProvider } from '@/lib/auth-context'
import { hasPermission, type Permission, canonicalRoleKey } from '@/lib/permissions'

interface DashboardUser {
  id: string
  email: string
  name: string
  role: string
  organizationId?: string
}

const ROUTE_PERMISSIONS: Array<{ path: string; permission: Permission }> = [
  { path: '/dashboard', permission: 'dashboard:view' },
  { path: '/bookings', permission: 'bookings:view' },
  { path: '/bulk-bookings', permission: 'bookings:view' },
  { path: '/reservations', permission: 'reservations:view' },
  { path: '/accounts', permission: 'guests:view' },
  { path: '/guest-database', permission: 'guests:view' },
  { path: '/organizations', permission: 'organizations:view' },
  { path: '/transactions', permission: 'transactions:view' },
  { path: '/payments', permission: 'payments:view' },
  { path: '/reports', permission: 'reports:view' },
  { path: '/analytics', permission: 'analytics:view' },
  { path: '/night-audit', permission: 'night_audit:view' },
  { path: '/reconciliation', permission: 'reconciliation:view' },
  { path: '/ledger', permission: 'ledger:view' },
  { path: '/housekeeping', permission: 'housekeeping:view' },
  { path: '/maintenance', permission: 'maintenance:view' },
  { path: '/store', permission: 'store:view' },
  { path: '/rooms', permission: 'rooms:view' },
  { path: '/users-roles', permission: 'users:view' },
  { path: '/settings', permission: 'settings:view' },
]

function getRequiredPermission(pathname: string) {
  return ROUTE_PERMISSIONS
    .sort((a, b) => b.path.length - a.path.length)
    .find(route => pathname === route.path || pathname.startsWith(`${route.path}/`))
    ?.permission
}

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const [user, setUser] = useState<DashboardUser | null>(null)
  const [loading, setLoading] = useState(true)
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const [redirected, setRedirected] = useState(false)
  const router = useRouter()
  const pathname = usePathname()

  useEffect(() => {
    let isMounted = true

    const checkAuth = async () => {
      try {
        const supabase = createClient()
        if (!supabase) {
          // If Supabase is not configured, show a placeholder user to allow navigation
          // (assumes user is authenticated through other means like cookies)
          if (isMounted) {
            setUser({
              id: 'placeholder',
              email: 'user@example.com',
              name: 'User',
              role: 'admin',
            })
            setLoading(false)
          }
          return
        }

        // Get authenticated user (single call instead of multiple)
        const { data: { user: authUser }, error: authError } = await supabase.auth.getUser()
        
        if (authError || !authUser) {
          if (isMounted) {
            setRedirected(true)
            router.push('/auth/login')
          }
          return
        }

        // Get user profile from database (include organization_id so pages don't re-fetch)
        const { data: profile, error: profileError } = await supabase
          .from('profiles')
          .select('full_name, role, organization_id')
          .eq('id', authUser.id)
          .single()

        if (isMounted) {
          if (!profileError && profile) {
            setUser({
              id: authUser.id,
              email: authUser.email || '',
              name: profile.full_name || authUser.email?.split('@')[0] || 'User',
              role: profile.role || 'admin',
              organizationId: profile.organization_id || '',
            })
            // Check if role has dashboard access
            const rk = canonicalRoleKey(profile.role) || canonicalRoleKey('admin')
            const roleForAccess = rk || ''
            const allowedRoles: Array<NonNullable<ReturnType<typeof canonicalRoleKey>>> = [
              'superadmin',
              'admin',
              'manager',
              'front_desk',
              'receptionist',
              'housekeeping',
              'maintenance',
              'accountant',
              'auditor',
              'store',
            ]
            if (roleForAccess && !allowedRoles.includes(roleForAccess)) {
              if (isMounted) {
                setRedirected(true)
                router.push('/access-denied')
              }
              return
            }
          } else {
            setUser({
              id: authUser.id,
              email: authUser.email || '',
              name: authUser.email?.split('@')[0] || 'User',
              role: 'admin',
            })
          }
          setLoading(false)
        }
      } catch (error) {
        if (isMounted && !redirected) {
          // On error, show a placeholder user to allow demo access
          setUser({
            id: 'placeholder',
            email: 'user@example.com',
            name: 'User',
            role: 'staff',
          })
          setLoading(false)
        }
      }
    }

    checkAuth()

    return () => {
      isMounted = false
    }
  }, [])

  useEffect(() => {
    if (!user) return

    if (
      user.role === 'store' &&
      (pathname === '/dashboard' || pathname.startsWith('/dashboard/'))
    ) {
      router.replace('/store')
      return
    }

    const requiredPermission = getRequiredPermission(pathname)
    if (requiredPermission && !hasPermission(user.role, requiredPermission)) {
      setRedirected(true)
      router.replace('/access-denied')
    }
  }, [pathname, router, user])

  if (loading || !user) {
    return <LoadingScreen />
  }

  const requiredPermission = getRequiredPermission(pathname)
  if (requiredPermission && !hasPermission(user.role, requiredPermission)) {
    return <LoadingScreen />
  }

  return (
    <AuthProvider value={{
      userId: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      organizationId: user.organizationId || '',
    }}>
      <div className="flex h-screen overflow-hidden bg-background">
        <Sidebar mobileOpen={mobileMenuOpen} onMobileClose={() => setMobileMenuOpen(false)} />
        <div className="flex flex-1 flex-col overflow-hidden">
          <Header user={user} onMenuClick={() => setMobileMenuOpen(true)} />
          <main className="flex-1 overflow-y-auto p-4 md:p-6 lg:p-8">
            {children}
          </main>
        </div>
      </div>
    </AuthProvider>
  )
}
