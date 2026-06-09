'use client'

import { useEffect, useState } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { Sidebar } from '@/components/layout/sidebar'
import { Header } from '@/components/layout/header'
import { AuthProvider } from '@/lib/auth-context'
import type { DashboardUserPayload } from '@/lib/auth/load-dashboard-user'
import {
  hasPermission,
  canAccessExpenseMenu,
  type Permission,
  canonicalRoleKey,
} from '@/lib/permissions'
import { NightAuditPendingProvider } from '@/components/providers/night-audit-pending-provider'
import { BrandingFavicon } from '@/components/branding/branding-favicon'
import { BRAND_LOGO_SESSION_KEY } from '@/lib/branding/constants'
import { getPostLoginPath } from '@/lib/utils/post-login-path'
import { SupplyChainProvider } from '@/lib/supply-chain/supply-chain-context'

const ROUTE_PERMISSIONS: Array<{ path: string; permission: Permission }> = [
  { path: '/dashboard', permission: 'dashboard:view' },
  { path: '/bookings', permission: 'bookings:view' },
  { path: '/bulk-bookings', permission: 'bookings:view' },
  { path: '/reservations', permission: 'reservations:view' },
  { path: '/accounts', permission: 'guests:view' },
  { path: '/guest-database', permission: 'guests:view' },
  { path: '/organizations', permission: 'organizations:view' },
  { path: '/transactions/analytics/profitability', permission: 'analytics:view' },
  { path: '/transactions/analytics/revenue', permission: 'analytics:view' },
  { path: '/transactions/analytics', permission: 'analytics:view' },
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
  { path: '/supply', permission: 'supply:store' },
  { path: '/store/requisitions', permission: 'store:requisition' },
  { path: '/store', permission: 'store:view' },
  { path: '/outlets', permission: 'outlet:view' },
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
  if (pathname === '/expenses' || pathname.startsWith('/expenses/')) {
    return canAccessExpenseMenu(userRole) && hasPermission(userRole, 'expenses:view')
  }
  if (pathname === '/accounts' || pathname.startsWith('/accounts/')) {
    return hasPermission(userRole, 'guests:view') || hasPermission(userRole, 'organizations:view')
  }
  if (pathname === '/organizations' || pathname.startsWith('/organizations/')) {
    return hasPermission(userRole, 'organizations:view') || hasPermission(userRole, 'guests:view')
  }
  if (
    pathname.startsWith('/transactions/analytics') ||
    pathname === '/transactions/revenue' ||
    pathname === '/transactions/profitability'
  ) {
    return hasPermission(userRole, 'analytics:view')
  }
  if (pathname === '/transactions' || pathname.startsWith('/transactions/')) {
    if (pathname === '/transactions') {
      return hasPermission(userRole, 'transactions:view') || hasPermission(userRole, 'analytics:view')
    }
    return hasPermission(userRole, 'transactions:view')
  }
  if (pathname === '/analytics' || pathname.startsWith('/analytics/')) {
    return hasPermission(userRole, 'analytics:view')
  }
  if (pathname.startsWith('/supply/')) {
    if (pathname.startsWith('/supply/store')) return hasPermission(userRole, 'supply:store')
    if (pathname.startsWith('/supply/kitchen')) return hasPermission(userRole, 'supply:kitchen')
    if (pathname.startsWith('/supply/fnb'))
      return hasPermission(userRole, 'supply:fnb') || hasPermission(userRole, 'outlet:view')
    if (pathname.startsWith('/supply/purchasing')) {
      const rk = canonicalRoleKey(userRole)
      if (rk === 'admin' || rk === 'superadmin') return true
      return (
        hasPermission(userRole, 'supply:purchasing') ||
        hasPermission(userRole, 'supply:approve_accountant') ||
        hasPermission(userRole, 'supply:approve_manager')
      )
    }
    if (pathname.startsWith('/supply/activity')) return hasPermission(userRole, 'supply:activity')
    return hasPermission(userRole, 'supply:store')
  }
  if (pathname === '/store/requisitions' || pathname.startsWith('/store/requisitions/')) {
    return hasPermission(userRole, 'store:requisition') || hasPermission(userRole, 'store:view')
  }
  if (pathname === '/store/purchase-orders' || pathname.startsWith('/store/purchase-orders/')) {
    return hasPermission(userRole, 'store:view')
  }
  if (pathname === '/store' || pathname.startsWith('/store/')) {
    return hasPermission(userRole, 'store:view') || hasPermission(userRole, 'store:requisition')
  }
  if (pathname === '/outlets' || pathname.startsWith('/outlets/')) {
    return hasPermission(userRole, 'outlet:view')
  }
  const requiredPermission = getRequiredPermission(pathname)
  if (!requiredPermission) return true
  return hasPermission(userRole, requiredPermission)
}

export function DashboardShell({
  initialUser,
  children,
}: {
  initialUser: DashboardUserPayload
  children: React.ReactNode
}) {
  const [user, setUser] = useState(initialUser)
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const router = useRouter()
  const pathname = usePathname()

  const setOrganizationLogoUrl = (url: string) => {
    setUser((prev) => ({ ...prev, organizationLogoUrl: url }))
  }

  useEffect(() => {
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
      if (rk === 'food_beverage') {
        router.replace('/outlets')
        return
      }
      if (rk === 'laundry') {
        router.replace('/outlets/laundry')
        return
      }
      if (rk === 'gym') {
        router.replace('/outlets/gym')
        return
      }
      if (rk === 'staff') {
        router.replace('/bookings')
        return
      }
      if (rk === 'cashier') {
        router.replace('/outlets')
        return
      }
      if (!hasPermission(user.role, 'dashboard:view')) {
        router.replace(getPostLoginPath(user.role))
        return
      }
    }

    if (!canAccessPath(pathname, user.role)) {
      router.replace('/access-denied')
    }
  }, [pathname, router, user.role])

  useEffect(() => {
    if (typeof window === 'undefined' || !user.organizationId) return
    try {
      if (user.organizationLogoUrl) {
        sessionStorage.setItem(BRAND_LOGO_SESSION_KEY, user.organizationLogoUrl)
      } else {
        sessionStorage.removeItem(BRAND_LOGO_SESSION_KEY)
      }
    } catch {
      /* ignore */
    }
  }, [user.organizationId, user.organizationLogoUrl])

  const allowed = canAccessPath(pathname, user.role)

  return (
    <AuthProvider
      value={{
        userId: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        organizationId: user.organizationId,
        organizationLogoUrl: user.organizationLogoUrl,
        setOrganizationLogoUrl,
      }}
    >
      <BrandingFavicon href={user.organizationLogoUrl} />
      <SupplyChainProvider>
        <NightAuditPendingProvider>
          <div className="flex h-screen overflow-hidden bg-background">
            {allowed && (
              <Sidebar mobileOpen={mobileMenuOpen} onMobileClose={() => setMobileMenuOpen(false)} />
            )}
            <div className="flex flex-1 flex-col overflow-hidden">
              {allowed && (
                <Header user={user} onMenuClick={() => setMobileMenuOpen(true)} />
              )}
              {!allowed && (
                <div className="flex flex-1 items-center justify-center">
                  <p className="text-sm text-muted-foreground">Checking access…</p>
                </div>
              )}
              <main
                className={
                  allowed
                    ? 'flex-1 overflow-y-auto p-3 md:p-4 lg:p-5'
                    : 'sr-only'
                }
              >
                {children}
              </main>
            </div>
          </div>
        </NightAuditPendingProvider>
      </SupplyChainProvider>
    </AuthProvider>
  )
}
