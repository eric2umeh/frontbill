'use client'

import { useEffect, useLayoutEffect, useState } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { Sidebar } from '@/components/layout/sidebar'
import { Header } from '@/components/layout/header'
import { AuthProvider } from '@/lib/auth-context'
import type { DashboardUserPayload } from '@/lib/auth/load-dashboard-user'
import {
  hasPermission,
  canAccessExpenseMenu,
  canAccessSupplyPurchaseOrdersMenu,
  type Permission,
  canonicalRoleKey,
} from '@/lib/permissions'
import type { PermissionOverrides, RolePermissionOverridesMap } from '@/lib/permission-overrides'
import { NightAuditPendingProvider } from '@/components/providers/night-audit-pending-provider'
import { BRAND_LOGO_SESSION_KEY } from '@/lib/branding/constants'
import { documentTitleForPath } from '@/lib/nav/document-title'
import { getPostLoginPath } from '@/lib/utils/post-login-path'
import { SupplyChainProvider } from '@/lib/supply-chain/supply-chain-context'
import { SupplyPendingAlerts } from '@/components/supply-chain/supply-pending-alerts'
import { StockShortageDialogHost } from '@/components/shared/stock-shortage-dialog-host'
import { InstallAppBanner } from '@/components/pwa/install-app-banner'
import { AppSessionLogger } from '@/components/pwa/app-session-logger'
import { HelpAssistant } from '@/components/help/help-assistant'
import { RoleOnboardingTour } from '@/components/onboarding/role-onboarding-tour'

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
  { path: '/cashback', permission: 'cashback:view' },
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

function canAccessPath(
  pathname: string,
  userRole: string,
  overrides?: PermissionOverrides | null,
  orgRoleOverrides?: RolePermissionOverridesMap | null,
): boolean {
  const perm = (p: Permission) =>
    hasPermission(userRole, p, overrides, orgRoleOverrides)

  if (pathname === '/expenses' || pathname.startsWith('/expenses/')) {
    return canAccessExpenseMenu(userRole) && perm('expenses:view')
  }
  if (pathname === '/accounts' || pathname.startsWith('/accounts/')) {
    return perm('guests:view') || perm('organizations:view')
  }
  if (pathname === '/organizations' || pathname.startsWith('/organizations/')) {
    return perm('organizations:view') || perm('guests:view')
  }
  if (
    pathname.startsWith('/transactions/analytics') ||
    pathname === '/transactions/revenue' ||
    pathname === '/transactions/profitability'
  ) {
    return perm('analytics:view')
  }
  if (pathname === '/transactions' || pathname.startsWith('/transactions/')) {
    if (pathname === '/transactions') {
      return perm('transactions:view') || perm('analytics:view')
    }
    return perm('transactions:view')
  }
  if (pathname === '/analytics' || pathname.startsWith('/analytics/')) {
    return perm('analytics:view')
  }
  if (pathname.startsWith('/supply/')) {
    if (pathname.startsWith('/supply/store')) return perm('supply:store')
    if (pathname.startsWith('/supply/kitchen')) return perm('supply:kitchen')
    if (pathname.startsWith('/supply/fnb')) return perm('supply:fnb')
    if (pathname.startsWith('/supply/purchasing')) return perm('supply:purchasing')
    if (pathname.startsWith('/supply/purchase-orders')) {
      return canAccessSupplyPurchaseOrdersMenu(userRole)
    }
    if (pathname.startsWith('/supply/activity')) return perm('supply:activity')
    return perm('supply:store')
  }
  if (pathname === '/store/requisitions' || pathname.startsWith('/store/requisitions/')) {
    return perm('store:requisition') || perm('store:view')
  }
  if (pathname === '/store/purchase-orders' || pathname.startsWith('/store/purchase-orders/')) {
    return perm('store:view')
  }
  if (pathname === '/store' || pathname.startsWith('/store/')) {
    return perm('store:view') || perm('store:requisition')
  }
  if (pathname === '/outlets' || pathname.startsWith('/outlets/')) {
    return perm('outlet:view')
  }
  const requiredPermission = getRequiredPermission(pathname)
  if (!requiredPermission) return true
  return perm(requiredPermission)
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
      if (rk === 'store') {
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
      if (!hasPermission(user.role, 'dashboard:view', user.permissionOverrides, user.orgRolePermissionOverrides)) {
        router.replace(getPostLoginPath(user.role))
        return
      }
    }

    if (!canAccessPath(pathname, user.role, user.permissionOverrides, user.orgRolePermissionOverrides)) {
      router.replace('/access-denied')
    }
  }, [pathname, router, user.role, user.permissionOverrides, user.orgRolePermissionOverrides])

  useLayoutEffect(() => {
    document.title = documentTitleForPath(pathname)
  }, [pathname])

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

  const allowed = canAccessPath(pathname, user.role, user.permissionOverrides, user.orgRolePermissionOverrides)

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
        permissionOverrides: user.permissionOverrides ?? null,
        orgRolePermissionOverrides: user.orgRolePermissionOverrides ?? null,
      }}
    >
      <title>{documentTitleForPath(pathname)}</title>
      <SupplyChainProvider>
        <SupplyPendingAlerts />
        <NightAuditPendingProvider>
          <StockShortageDialogHost />
          <div className="flex h-screen overflow-hidden bg-background">
            {allowed && (
              <Sidebar mobileOpen={mobileMenuOpen} onMobileClose={() => setMobileMenuOpen(false)} />
            )}
            <div className="flex flex-1 flex-col overflow-hidden">
              {allowed && (
                <Header user={user} onMenuClick={() => setMobileMenuOpen(true)} />
              )}
              {allowed && <InstallAppBanner />}
              {allowed && <AppSessionLogger />}
              {allowed && <RoleOnboardingTour />}
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
              {allowed && <HelpAssistant />}
            </div>
          </div>
        </NightAuditPendingProvider>
      </SupplyChainProvider>
    </AuthProvider>
  )
}
