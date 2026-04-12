'use client'

import { useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Button } from '@/components/ui/button'
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
  Briefcase,
  Moon,
  FileBarChart,
  ShieldCheck,
  Settings,
  ChevronLeft,
  ChevronRight,
  X,
  Hotel,
} from 'lucide-react'

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
    label: 'Accounts',
    icon: Users,
    href: '/accounts',
    permission: 'guests:view', // Guests & city ledger accounts
  },
  {
    label: 'Rooms',
    icon: Bed,
    href: '/rooms',
    permission: 'rooms:view',
  },
  {
    label: 'Transactions',
    icon: Receipt,
    href: '/transactions',
    permission: 'transactions:view',
  },
  {
    label: 'Organizations',
    icon: Building2,
    href: '/organizations',
    permission: 'organizations:view',
  },
  {
    label: 'Analytics',
    icon: TrendingUp,
    href: '/analytics',
    permission: 'analytics:view',
  },
  {
    label: 'Reconciliation',
    icon: Briefcase,
    href: '/reconciliation',
    permission: 'reconciliation:view',
  },
  {
    label: 'Night Audit',
    icon: Moon,
    href: '/night-audit',
    permission: 'night_audit:view',
  },
  {
    label: 'Reports',
    icon: FileBarChart,
    href: '/reports',
    permission: 'analytics:view',
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
  const { role } = useAuth()

  // Filter sidebar routes based on the logged-in user's role
  const visibleRoutes = routes.filter(route => {
    if (!route.permission) return true
    return hasPermission(role, route.permission)
  })

  const SidebarContent = ({ isMobile = false }: { isMobile?: boolean }) => (
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
                href={route.href}
                onClick={() => isMobile && onMobileClose?.()}
                className={cn(
                  'flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors',
                  isActive
                    ? 'bg-primary text-primary-foreground'
                    : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground',
                  collapsed && !isMobile && 'justify-center'
                )}
                title={collapsed && !isMobile ? route.label : undefined}
              >
                <Icon className="h-4 w-4 flex-shrink-0" />
                {(!collapsed || isMobile) && <span>{route.label}</span>}
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
