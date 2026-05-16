'use client'

import { useEffect, useState } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { Sidebar } from '@/components/layout/sidebar'
import { Header } from '@/components/layout/header'
import { LoadingScreen } from '@/components/loading-screen'
import { createClient } from '@/lib/supabase/client'
import { AuthProvider } from '@/lib/auth-context'
import { hasPermission, type Permission, canonicalRoleKey, APP_LOGIN_ROLE_KEYS } from '@/lib/permissions'
import { BackdatePendingProvider } from '@/components/providers/backdate-pending-provider'
import { BrandingFavicon } from '@/components/branding/branding-favicon'
import { BRAND_LOGO_SESSION_KEY } from '@/lib/branding/constants'

interface DashboardUser {
  id: string
  email: string
  name: string
  role: string
  organizationId?: string
  organizationLogoUrl?: string
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
  { path: '/expenses', permission: 'expenses:view' },
  { path: '/analytics', permission: 'analytics:view' },
  { path: '/night-audit', permission: 'night_audit:view' },
  { path: '/reconciliation', permission: 'reconciliation:view' },
  { path: '/ledger', permission: 'ledger:view' },
  { path: '/housekeeping', permission: 'housekeeping:view' },
  { path: '/maintenance', permission: 'maintenance:view' },
  /** Longer prefix wins: store requisitions allow departmental staff (`store:requisition`) or store team (`store:view`). */
  { path: '/store/requisitions', permission: 'store:requisition' },
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

function canAccessPath(pathname: string, userRole: string): boolean {
  if (pathname === '/store/requisitions' || pathname.startsWith('/store/requisitions/')) {
    return hasPermission(userRole, 'store:requisition') || hasPermission(userRole, 'store:view')
  }
  if (pathname === '/store/purchase-orders' || pathname.startsWith('/store/purchase-orders/')) {
    return hasPermission(userRole, 'store:view')
  }
  if (pathname === '/store' || pathname.startsWith('/store/')) {
    return hasPermission(userRole, 'store:view') || hasPermission(userRole, 'store:requisition')
  }
  const requiredPermission = getRequiredPermission(pathname)
  if (!requiredPermission) return true
  return hasPermission(userRole, requiredPermission)
}

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const [user, setUser] = useState<DashboardUser | null>(null)
  const [loading, setLoading] = useState(true)

  const setOrganizationLogoUrl = (url: string) => {
    setUser((prev) => (prev ? { ...prev, organizationLogoUrl: url } : prev))
  }
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
              organizationLogoUrl: '',
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
            const rk = canonicalRoleKey(profile.role)
            if (!rk || !APP_LOGIN_ROLE_KEYS.includes(rk)) {
              if (isMounted) {
                setRedirected(true)
                router.push('/access-denied')
              }
              return
            }
            let organizationLogoUrl = ''
            const oid = profile.organization_id
            if (oid) {
              const { data: orgRow, error: orgErr } = await supabase
                .from('organizations')
                .select('logo_url')
                .eq('id', oid)
                .maybeSingle()
              if (!orgErr && orgRow?.logo_url) {
                organizationLogoUrl = String(orgRow.logo_url)
              }
            }
            setUser({
              id: authUser.id,
              email: authUser.email || '',
              name: profile.full_name || authUser.email?.split('@')[0] || 'User',
              role: rk,
              organizationId: profile.organization_id || '',
              organizationLogoUrl,
            })
          } else {
            setUser({
              id: authUser.id,
              email: authUser.email || '',
              name: authUser.email?.split('@')[0] || 'User',
              role: 'admin',
              organizationLogoUrl: '',
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
            organizationLogoUrl: '',
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

    const rk = canonicalRoleKey(user.role) || ''
    const onDashboard = pathname === '/dashboard' || pathname.startsWith('/dashboard/')

    if (onDashboard) {
      if (rk === 'store' || rk === 'auditor') {
        router.replace('/store')
        return
      }
      if (rk === 'housekeeping') {
        router.replace('/housekeeping')
        return
      }
      if (rk === 'maintenance') {
        router.replace('/maintenance')
        return
      }
      if (rk === 'staff') {
        router.replace('/bookings')
        return
      }
    }

    if (!canAccessPath(pathname, user.role)) {
      setRedirected(true)
      router.replace('/access-denied')
    }
  }, [pathname, router, user])

  useEffect(() => {
    if (typeof window === 'undefined' || !user?.organizationId) return
    try {
      if (user.organizationLogoUrl) {
        sessionStorage.setItem(BRAND_LOGO_SESSION_KEY, user.organizationLogoUrl)
      } else {
        sessionStorage.removeItem(BRAND_LOGO_SESSION_KEY)
      }
    } catch {
      /* ignore quota / private mode */
    }
  }, [user?.organizationId, user?.organizationLogoUrl])

  if (loading || !user) {
    return <LoadingScreen />
  }

  if (!canAccessPath(pathname, user.role)) {
    return <LoadingScreen />
  }

  return (
    <AuthProvider value={{
      userId: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      organizationId: user.organizationId || '',
      organizationLogoUrl: user.organizationLogoUrl || '',
      setOrganizationLogoUrl,
    }}>
      <BrandingFavicon href={user.organizationLogoUrl} />
      <BackdatePendingProvider>
      <div className="flex h-screen overflow-hidden bg-background">
        <Sidebar mobileOpen={mobileMenuOpen} onMobileClose={() => setMobileMenuOpen(false)} />
        <div className="flex flex-1 flex-col overflow-hidden">
          <Header user={user} onMenuClick={() => setMobileMenuOpen(true)} />
          <main className="flex-1 overflow-y-auto p-4 md:p-6 lg:p-8">
            {children}
          </main>
        </div>
      </div>
      </BackdatePendingProvider>
    </AuthProvider>
  )
}
