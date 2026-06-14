'use client'

import { Suspense, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { usePathname, useSearchParams } from 'next/navigation'
import { cn } from '@/lib/utils'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { useAuth } from '@/lib/auth-context'
import { canonicalRoleKey, hasPermission, type Permission } from '@/lib/permissions'
import { Sheet, SheetContent, SheetTitle } from '@/components/ui/sheet'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible'
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
  ChevronDown,
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
  RotateCcw,
  Building2,
  Package,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { useNightAuditPendingCounts } from '@/hooks/use-night-audit-pending-counts'
import { nightAuditHrefForPendingCounts } from '@/lib/night-audit/pending-approval-counts'

type NavChild = { label: string; href: string; permission?: Permission; permissionAny?: Permission[] }

type NavRoute = {
  label: string
  icon: LucideIcon
  href?: string
  permission?: Permission
  permissionAny?: Permission[]
  children?: NavChild[]
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
      { label: 'Outlets (POS)', icon: Store, href: '/outlets', permission: 'outlet:view' },
    ],
  },
  {
    title: 'Kitchen',
    routes: [
      { label: 'Kitchen', icon: ChefHat, href: '/supply/kitchen', permission: 'supply:kitchen' },
      { label: 'F&B Store', icon: Store, href: '/supply/fnb', permission: 'supply:kitchen' },
    ],
  },
  {
    title: 'Supply Chain',
    routes: [
      { label: 'Central Store', icon: Warehouse, href: '/supply/store', permission: 'supply:store' },
      {
        label: 'Purchasing',
        icon: ShoppingCart,
        href: '/supply/purchasing',
        permissionAny: ['supply:purchasing', 'supply:approve_accountant', 'supply:approve_manager'],
      },
      { label: 'Supply Log', icon: ClipboardCheck, href: '/supply/activity', permission: 'supply:activity' },
    ],
  },
  {
    title: 'Accounting',
    routes: [
      { label: 'Expenses', icon: Wallet, href: '/expenses', permission: 'expenses:view' },
      { label: 'Reports', icon: FileBarChart, href: '/reports', permission: 'reports:view' },
      { label: 'Night Audit', icon: Moon, href: '/night-audit', permission: 'night_audit:view' },
      {
        label: 'Transactions / Analytics',
        icon: Receipt,
        href: '/transactions',
        permissionAny: ['transactions:view', 'analytics:view'],
      },
      { label: 'Refunds', icon: RotateCcw, href: '/refunds', permission: 'payments:refund' },
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
    title: 'Administration',
    routes: [
      { label: 'Users & Roles', icon: ShieldCheck, href: '/users-roles', permission: 'users:view' },
      { label: 'Settings', icon: Settings, href: '/settings', permission: 'settings:view' },
    ],
  },
]

function routeIsVisible(route: NavRoute | NavChild, role: string | null): boolean {
  const roleKey = canonicalRoleKey(role)
  if ('href' in route && route.href === '/dashboard' && roleKey === 'cashier') return false
  if (route.permissionAny?.length) {
    return route.permissionAny.some((p) => hasPermission(role, p))
  }
  if (!route.permission) return true
  return hasPermission(role, route.permission)
}

function usesCompactNav(role: string | null): boolean {
  const rk = canonicalRoleKey(role)
  return rk === 'superadmin' || rk === 'admin' || rk === 'manager'
}

function routeIsActive(
  pathname: string,
  href: string,
  _searchParams?: URLSearchParams | null,
): boolean {
  if (href === '/supply/kitchen') {
    return pathname === '/supply/kitchen' || pathname.startsWith('/supply/kitchen/')
  }
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

function groupIsActive(
  pathname: string,
  children: NavChild[],
  searchParams?: URLSearchParams | null,
): boolean {
  return children.some((c) => routeIsActive(pathname, c.href, searchParams))
}

function collapseRoutesToDropdown(
  label: string,
  icon: LucideIcon,
  routes: NavRoute[],
  role: string | null,
): NavRoute[] {
  const visibleChildren = routes
    .filter((r) => r.href)
    .map((r) => ({
      label: r.label,
      href: r.href!,
      permission: r.permission,
      permissionAny: r.permissionAny,
    }))
    .filter((c) => routeIsVisible(c, role))

  if (visibleChildren.length === 0) return []
  if (visibleChildren.length === 1) {
    const only = routes.find((r) => r.href === visibleChildren[0].href)
    return only ? [only] : []
  }
  return [{ label, icon, children: visibleChildren }]
}

const DROPDOWN_SECTIONS: Record<string, LucideIcon> = {
  'Supply Chain': Package,
  Accounting: Wallet,
  Property: Building2,
  Administration: ShieldCheck,
}

function buildSections(role: string | null): NavSection[] {
  const compact = usesCompactNav(role)
  return NAV_SECTIONS.map((section) => {
    let routes = section.routes.filter((r) => routeIsVisible(r, role))

    const dropdownIcon = DROPDOWN_SECTIONS[section.title]
    const useDropdown =
      dropdownIcon &&
      routes.length > 1 &&
      (section.title !== 'Accounting' || compact)

    if (useDropdown && dropdownIcon) {
      routes = collapseRoutesToDropdown(section.title, dropdownIcon, routes, role)
    }

    routes = routes
      .map((r) => {
        if (!r.children?.length) return r
        const children = r.children.filter((c) => routeIsVisible(c, role))
        if (!children.length) return null
        return { ...r, children }
      })
      .filter(Boolean) as NavRoute[]

    return { ...section, routes }
  }).filter((s) => s.routes.length > 0)
}

interface SidebarProps {
  mobileOpen?: boolean
  onMobileClose?: () => void
}

function SidebarInner({ mobileOpen, onMobileClose, isMobile = false }: SidebarProps & { isMobile?: boolean }) {
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const [collapsed, setCollapsed] = useState(false)
  const { role, organizationLogoUrl } = useAuth()
  const nightAuditPending = useNightAuditPendingCounts()
  const pendingNightAuditTotal = nightAuditPending.total
  const nightAuditHref =
    pendingNightAuditTotal > 0
      ? nightAuditHrefForPendingCounts(nightAuditPending)
      : '/night-audit'

  const visibleSections = useMemo(() => buildSections(role), [role])
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({})
  const [radixReady, setRadixReady] = useState(false)

  useEffect(() => {
    setRadixReady(true)
  }, [])

  const isGroupOpen = (key: string, children: NavChild[]) => {
    if (openGroups[key] !== undefined) return openGroups[key]
    return groupIsActive(pathname, children, searchParams)
  }

  const linkClass = (active: boolean) =>
    cn(
      'flex items-center rounded-lg px-3 py-2.5 text-sm font-medium transition-colors',
      !collapsed || isMobile ? 'gap-3' : 'justify-center gap-0',
      active
        ? 'bg-primary text-primary-foreground'
        : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground',
    )

  const childLinkClass = (active: boolean) =>
    cn(
      'flex items-center rounded-md px-3 py-2 text-sm transition-colors ml-6',
      active
        ? 'bg-primary/10 text-primary font-medium'
        : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground',
    )

  return (
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
                  const groupKey = `${section.title}-${route.label}`

                  if (route.children?.length) {
                    const open = isGroupOpen(groupKey, route.children)
                    const active = groupIsActive(pathname, route.children, searchParams)

                    if (collapsed && !isMobile) {
                      return (
                        <Link
                          key={groupKey}
                          href={route.children[0].href}
                          className={linkClass(active)}
                          title={route.label}
                        >
                          <Icon className="h-4 w-4 flex-shrink-0" />
                        </Link>
                      )
                    }

                    if (!radixReady) {
                      return (
                        <div key={groupKey} className="space-y-0.5">
                          <div
                            className={cn(
                              'flex w-full items-center rounded-lg px-3 py-2.5 text-sm font-medium gap-3',
                              active
                                ? 'bg-primary/10 text-primary'
                                : 'text-muted-foreground',
                            )}
                          >
                            <Icon className="h-4 w-4 flex-shrink-0" />
                            <span className="flex-1 text-left">{route.label}</span>
                          </div>
                          {route.children.map((child) => {
                            const href =
                              child.href === '/night-audit' ? nightAuditHref : child.href
                            const childActive = routeIsActive(pathname, child.href, searchParams)
                            return (
                              <Link
                                key={child.href}
                                href={href}
                                onClick={() => isMobile && onMobileClose?.()}
                                className={childLinkClass(childActive)}
                              >
                                <span className="flex-1">{child.label}</span>
                              </Link>
                            )
                          })}
                        </div>
                      )
                    }

                    return (
                      <Collapsible
                        key={groupKey}
                        open={open}
                        onOpenChange={(v) => setOpenGroups((p) => ({ ...p, [groupKey]: v }))}
                      >
                        <CollapsibleTrigger
                          className={cn(
                            'flex w-full items-center rounded-lg px-3 py-2.5 text-sm font-medium transition-colors',
                            'gap-3',
                            active
                              ? 'bg-primary/10 text-primary'
                              : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground',
                          )}
                        >
                          <Icon className="h-4 w-4 flex-shrink-0" />
                          <span className="flex-1 text-left">{route.label}</span>
                          <ChevronDown
                            className={cn(
                              'h-4 w-4 shrink-0 transition-transform',
                              open && 'rotate-180',
                            )}
                          />
                        </CollapsibleTrigger>
                        <CollapsibleContent className="space-y-0.5 pt-0.5 pb-1">
                          {route.children.map((child) => {
                            const href =
                              child.href === '/night-audit' ? nightAuditHref : child.href
                            const childActive = routeIsActive(pathname, child.href, searchParams)
                            return (
                              <Link
                                key={child.href}
                                href={href}
                                onClick={() => isMobile && onMobileClose?.()}
                                className={childLinkClass(childActive)}
                              >
                                <span className="flex-1">{child.label}</span>
                                {child.href === '/night-audit' && pendingNightAuditTotal > 0 && (
                                  <Badge variant="destructive" className="tabular-nums text-[10px]">
                                    {pendingNightAuditTotal > 99 ? '99+' : pendingNightAuditTotal}
                                  </Badge>
                                )}
                              </Link>
                            )
                          })}
                        </CollapsibleContent>
                      </Collapsible>
                    )
                  }

                  const href =
                    route.href === '/night-audit' ? nightAuditHref : route.href!
                  const isActive = routeIsActive(pathname, route.href!, searchParams)

                  return (
                    <Link
                      key={route.href}
                      href={href}
                      onClick={() => isMobile && onMobileClose?.()}
                      className={linkClass(isActive)}
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
}

export function Sidebar({ mobileOpen, onMobileClose }: SidebarProps = {}) {
  return (
    <Suspense fallback={<div className="hidden md:block w-64 border-r bg-card" />}>
      <div className="hidden md:block">
        <SidebarInner />
      </div>

      <Sheet open={mobileOpen} onOpenChange={onMobileClose}>
        <SheetContent side="left" className="p-0 w-64" aria-describedby={undefined}>
          <SheetTitle className="sr-only">Navigation Menu</SheetTitle>
          <SidebarInner isMobile mobileOpen={mobileOpen} onMobileClose={onMobileClose} />
        </SheetContent>
      </Sheet>
    </Suspense>
  )
}
