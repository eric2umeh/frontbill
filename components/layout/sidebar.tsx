'use client'

import { useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { useAuth } from '@/lib/auth-context'
import { hasPermission, type Permission } from '@/lib/permissions'
import { Sheet, SheetContent, SheetTitle, SheetDescription } from '@/components/ui/sheet'
import {
  LayoutDashboard,
  Calendar,
  CalendarClock,
  Users,
  Bed,
  Receipt,
  Building2,
  TrendingUp,
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
  ShoppingBag,
} from 'lucide-react'
import { useBackdatePendingCount } from '@/hooks/use-backdate-pending-count'

const routes: Array<{ label: string; icon: any; href: string; permission?: Permission }> = [
  {
    label: 'Dashboard',
    icon: LayoutDashboard,
    href: '/dashboard',
    permission: 'dashboard:view',
  },
  {
    label: 'Bookings',
    icon: Calendar,
    href: '/bookings',
    permission: 'bookings:view',
  },
  {
    label: 'Reservations',
    icon: CalendarClock,
    href: '/reservations',
    permission: 'reservations:view',
  },
  {
    label: 'Guests',
    icon: Users,
    href: '/accounts',
    permission: 'guests:view', // Guests & city ledger accounts
  },
  {
    label: 'Organizations',
    icon: Building2,
    href: '/organizations',
    permission: 'organizations:view',
  },
  {
    label: 'Transactions',
    icon: Receipt,
    href: '/transactions',
    permission: 'transactions:view',
  },
  {
    label: 'Reports',
    icon: FileBarChart,
    href: '/reports',
    permission: 'reports:view',
  },
  {
    label: 'Night Audit',
    icon: Moon,
    href: '/night-audit',
    permission: 'night_audit:view',
  },
  {
    label: 'Housekeeping',
    icon: Sparkles,
    href: '/housekeeping',
    permission: 'housekeeping:view',
  },
  {
    label: 'Maintenance',
    icon: Wrench,
    href: '/maintenance',
    permission: 'maintenance:view',
  },
  {
    label: 'Store',
    icon: ShoppingBag,
    href: '/store',
    permission: 'store:view',
  },
  {
    label: 'Analytics',
    icon: TrendingUp,
    href: '/analytics',
    permission: 'analytics:view',
  },
  {
    label: 'Rooms',
    icon: Bed,
    href: '/rooms',
    permission: 'rooms:view',
  },
  {
    label: 'Users & Roles',
    icon: ShieldCheck,
    href: '/users-roles',
    permission: 'users:view',
  },
  {
    label: 'Settings',
    icon: Settings,
    href: '/settings',
    permission: 'settings:view',
  },
]

interface SidebarProps {
  mobileOpen?: boolean
  onMobileClose?: () => void
}

export function Sidebar({ mobileOpen, onMobileClose }: SidebarProps = {}) {
  const pathname = usePathname()
  const [collapsed, setCollapsed] = useState(false)
  const { role, userId } = useAuth()
  const pendingBackdateCount = useBackdatePendingCount(hasPermission(role, 'backdate:approve'), userId)

  // Filter sidebar routes based on the logged-in user's role
  const visibleRoutes = routes.filter(route => {
    if (!route.permission) return true
    return hasPermission(role, route.permission)
  })

  const SidebarContent = ({
    isMobile = false,
  }: {
    isMobile?: boolean
  }) => (
    <div className={cn(
      "h-full flex flex-col border-r bg-card",
      !isMobile && collapsed && "w-16",
      !isMobile && !collapsed && "w-64"
    )}>
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
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary flex-shrink-0">
          <Hotel className="h-6 w-6 text-primary-foreground" />
        </div>
        {(!collapsed || isMobile) && (
          <div>
            <h1 className="text-lg font-bold leading-none">FrontBill</h1>
            <p className="text-xs text-muted-foreground">Hotel Management</p>
          </div>
        )}
      </div>

      <ScrollArea className="flex-1 px-3 py-4">
        <div className="space-y-1">
          {visibleRoutes.map((route) => {
            const Icon = route.icon
            const isActive = pathname === route.href || pathname.startsWith(`${route.href}/`)
            
            return (
              <Link
                key={route.href}
                href={route.href === '/night-audit' && pendingBackdateCount > 0 ? '/night-audit?tab=backdate-requests' : route.href}
                onClick={() => isMobile && onMobileClose?.()}
                className={cn(
                  'flex items-center rounded-lg px-3 py-2.5 text-sm font-medium transition-colors',
                  (!collapsed || isMobile) ? 'gap-3' : 'justify-center gap-0',
                  isActive
                    ? 'bg-primary text-primary-foreground'
                    : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground',
                )}
                title={
                  collapsed && !isMobile
                    ? (route.href === '/night-audit' && pendingBackdateCount > 0
                      ? `${route.label} (${pendingBackdateCount} pending backdate)`
                      : route.label)
                    : undefined
                }
              >
                <Icon className="h-4 w-4 flex-shrink-0" />
                {(!collapsed || isMobile) && (
                  <>
                    <span className="flex-1 text-left">{route.label}</span>
                    {route.href === '/night-audit' && pendingBackdateCount > 0 && (
                      <Badge
                        variant="destructive"
                        className={cn(
                          'tabular-nums shrink-0 rounded-full px-1.5 text-[11px] min-w-6 justify-center font-semibold',
                          isActive && 'bg-primary-foreground/20 text-primary-foreground border-transparent',
                        )}
                      >
                        {pendingBackdateCount > 99 ? '99+' : pendingBackdateCount}
                      </Badge>
                    )}
                  </>
                )}
              </Link>
            )
          })}
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
          <p className="text-center text-xs text-muted-foreground">
            Version 1.0.0
          </p>
        </div>
      )}
    </div>
  )

  return (
    <>
      {/* Desktop Sidebar */}
      <div className="hidden md:block">
        <SidebarContent />
      </div>

      {/* Mobile Sidebar */}
      <Sheet open={mobileOpen} onOpenChange={onMobileClose}>
        <SheetContent side="left" className="p-0 w-64" aria-describedby={undefined}>
          <SheetTitle className="sr-only">Navigation Menu</SheetTitle>
          <SidebarContent isMobile />
        </SheetContent>
      </Sheet>
    </>
  )
}
