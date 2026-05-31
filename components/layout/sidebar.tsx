'use client'

import { useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { useAuth } from '@/lib/auth-context'
import { canonicalRoleKey, hasPermission, type Permission } from '@/lib/permissions'
import { Sheet, SheetContent, SheetTitle } from '@/components/ui/sheet'
import {
  LayoutDashboard,
  Calendar,
  CalendarClock,
  Users,
  Bed,
  Receipt,
  Moon,
  FileBarChart,
  ShieldCheck,
  Settings,
  ChevronLeft,
  ChevronRight,
  X,
  Hotel,
  Sparkles,
  Wrench,
  Wallet,
  Warehouse,
  ChefHat,
  ShoppingCart,
  ClipboardCheck,
  Store,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { useNightAuditPendingCounts } from '@/hooks/use-night-audit-pending-counts'
import { nightAuditHrefForPendingCounts } from '@/lib/night-audit/pending-approval-counts'

type NavRoute = {
  label: string
  icon: LucideIcon
  href: string
  permission?: Permission
  permissionAny?: Permission[]
}

type NavSection = {
  title: string
  routes: NavRoute[]
}

const NAV_SECTIONS: NavSection[] = [
  {
    title: 'Front Office',
    routes: [
      { label: 'Dashboard', icon: LayoutDashboard, href: '/dashboard', permission: 'dashboard:view' },
      { label: 'Bookings', icon: Calendar, href: '/bookings', permission: 'bookings:view' },
      { label: 'Reservations / Events', icon: CalendarClock, href: '/reservations', permission: 'reservations:view' },
      { label: 'Guest / Org', icon: Users, href: '/accounts', permissionAny: ['guests:view', 'organizations:view'] },
    ],
  },
  {
    title: 'Outlets & Services',
    routes: [
      {
        label: 'Outlets (POS)',
        icon: Store,
        href: '/outlets',
        permission: 'outlet:view',
      },
    ],
  },
  {
    title: 'Supply Chain',
    routes: [
      { label: 'Central Store', icon: Warehouse, href: '/supply/store', permission: 'supply:store' },
      { label: 'Kitchen', icon: ChefHat, href: '/supply/kitchen', permission: 'supply:kitchen' },
      { label: 'Purchasing', icon: ShoppingCart, href: '/supply/purchasing', permissionAny: ['supply:purchasing', 'supply:approve_accountant', 'supply:approve_manager'] },
      { label: 'Supply Log', icon: ClipboardCheck, href: '/supply/activity', permission: 'supply:activity' },
    ],
  },
  {
    title: 'Property',
    routes: [
      { label: 'Housekeeping', icon: Sparkles, href: '/housekeeping', permission: 'housekeeping:view' },
      { label: 'Maintenance', icon: Wrench, href: '/maintenance', permission: 'maintenance:view' },
      { label: 'Rooms', icon: Bed, href: '/rooms', permission: 'rooms:view' },
    ],
  },
  {
    title: 'Finance',
    routes: [
      { label: 'Expenses', icon: Wallet, href: '/expenses', permission: 'expenses:view' },
      { label: 'Reports', icon: FileBarChart, href: '/reports', permission: 'reports:view' },
      { label: 'Night Audit', icon: Moon, href: '/night-audit', permission: 'night_audit:view' },
      { label: 'Transactions / Analytics', icon: Receipt, href: '/transactions', permissionAny: ['transactions:view', 'analytics:view'] },
    ],
  },
  {
    title: 'Administration',
    routes: [
      { label: 'Users & Roles', icon: ShieldCheck, href: '/users-roles', permission: 'users:view' },
      { label: 'Settings', icon: Settings, href: '/settings', permission: 'settings:view' },
    ],
  },
]

function routeIsVisible(route: NavRoute, role: string | null): boolean {
  const roleKey = canonicalRoleKey(role)
  if (route.href === '/dashboard' && roleKey === 'cashier') return false
  if (route.permissionAny?.length) {
    return route.permissionAny.some((p) => hasPermission(role, p))
  }
  if (!route.permission) return true
  return hasPermission(role, route.permission)
}

function routeIsActive(pathname: string, href: string): boolean {
  if (href === '/outlets') {
    return pathname === '/outlets' || pathname.startsWith('/outlets/')
  }
  if (href === '/accounts') {
    return (
      pathname === '/accounts' ||
      pathname.startsWith('/accounts/') ||
      pathname === '/organizations' ||
      pathname.startsWith('/organizations/')
    )
  }
  if (href === '/transactions') {
    return (
      pathname === '/transactions' ||
      pathname.startsWith('/transactions/') ||
      pathname === '/analytics' ||
      pathname.startsWith('/analytics/')
    )
  }
  if (href.startsWith('/supply')) {
    return pathname === href || pathname.startsWith(`${href}/`)
  }
  return pathname === href || pathname.startsWith(`${href}/`)
}

interface SidebarProps {
  mobileOpen?: boolean
  onMobileClose?: () => void
}

export function Sidebar({ mobileOpen, onMobileClose }: SidebarProps = {}) {
  const pathname = usePathname()
  const [collapsed, setCollapsed] = useState(false)
  const { role, organizationLogoUrl } = useAuth()
  const nightAuditPending = useNightAuditPendingCounts()
  const pendingNightAuditTotal = nightAuditPending.total
  const nightAuditHref =
    pendingNightAuditTotal > 0
      ? nightAuditHrefForPendingCounts(nightAuditPending)
      : '/night-audit'

  const visibleSections = NAV_SECTIONS.map((section) => ({
    ...section,
    routes: section.routes.filter((route) => routeIsVisible(route, role)),
  })).filter((section) => section.routes.length > 0)

  const SidebarContent = ({ isMobile = false }: { isMobile?: boolean }) => (
    <div
      className={cn(
        'h-full flex flex-col border-r bg-card',
        !isMobile && collapsed && 'w-16',
        !isMobile && !collapsed && 'w-64',
      )}
    >
      <div className="flex h-16 items-center gap-2 border-b px-6 relative">
        {isMobile && (
          <Button
            variant="ghost"
            size="icon"
            className="absolute right-2 top-3"
            onClick={onMobileClose}
          >
            <X className="h-4 w-4" />
          </Button>
        )}
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary flex-shrink-0 overflow-hidden">
          {organizationLogoUrl ? (
            <img
              src={organizationLogoUrl}
              alt=""
              className="h-full w-full object-contain bg-white p-1"
            />
          ) : (
            <Hotel className="h-6 w-6 text-primary-foreground" />
          )}
        </div>
        {(!collapsed || isMobile) && (
          <div>
            <h1 className="text-lg font-bold leading-none">FrontBill</h1>
            <p className="text-xs text-muted-foreground">Hotel Management</p>
          </div>
        )}
      </div>

      <ScrollArea className="flex-1 px-3 py-4">
        <div className="space-y-5">
          {visibleSections.map((section) => (
            <div key={section.title}>
              {(!collapsed || isMobile) && (
                <p className="mb-1.5 px-3 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/80">
                  {section.title}
                </p>
              )}
              <div className="space-y-0.5">
                {section.routes.map((route) => {
                  const Icon = route.icon
                  const href = route.href === '/night-audit' ? nightAuditHref : route.href
                  const isActive = routeIsActive(pathname, route.href)

                  return (
                    <Link
                      key={route.href}
                      href={href}
                      onClick={() => isMobile && onMobileClose?.()}
                      className={cn(
                        'flex items-center rounded-lg px-3 py-2.5 text-sm font-medium transition-colors',
                        !collapsed || isMobile ? 'gap-3' : 'justify-center gap-0',
                        isActive
                          ? 'bg-primary text-primary-foreground'
                          : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground',
                      )}
                      title={
                        collapsed && !isMobile
                          ? route.href === '/night-audit' && pendingNightAuditTotal > 0
                            ? `${route.label} (${pendingNightAuditTotal} pending)`
                            : route.label
                          : undefined
                      }
                    >
                      <Icon className="h-4 w-4 flex-shrink-0" />
                      {(!collapsed || isMobile) && (
                        <>
                          <span className="flex-1 text-left">{route.label}</span>
                          {route.href === '/night-audit' && pendingNightAuditTotal > 0 && (
                            <Badge
                              variant="destructive"
                              className={cn(
                                'tabular-nums shrink-0 rounded-full px-1.5 text-[11px] min-w-6 justify-center font-semibold',
                                isActive &&
                                  'bg-primary-foreground/20 text-primary-foreground border-transparent',
                              )}
                            >
                              {pendingNightAuditTotal > 99 ? '99+' : pendingNightAuditTotal}
                            </Badge>
                          )}
                        </>
                      )}
                    </Link>
                  )
                })}
              </div>
            </div>
          ))}
        </div>
      </ScrollArea>

      {!isMobile && (
        <div className="border-t p-2">
          <Button
            variant="ghost"
            size="sm"
            className="w-full justify-center"
            onClick={() => setCollapsed(!collapsed)}
          >
            {collapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
            {!collapsed && <span className="ml-2">Collapse</span>}
          </Button>
        </div>
      )}

      {(!collapsed || isMobile) && (
        <div className="border-t p-4">
          <p className="text-center text-xs text-muted-foreground">Version 1.0.0</p>
        </div>
      )}
    </div>
  )

  return (
    <>
      <div className="hidden md:block">
        <SidebarContent />
      </div>

      <Sheet open={mobileOpen} onOpenChange={onMobileClose}>
        <SheetContent side="left" className="p-0 w-64" aria-describedby={undefined}>
          <SheetTitle className="sr-only">Navigation Menu</SheetTitle>
          <SidebarContent isMobile />
        </SheetContent>
      </Sheet>
    </>
  )
}
