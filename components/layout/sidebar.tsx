'use client'

import { useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'
import {
  LayoutDashboard,
  Users,
  Bed,
  Calendar,
  CreditCard,
  Building2,
  TrendingUp,
  Settings,
  Hotel,
  FileBarChart,
  Briefcase,
  CalendarClock,
  Receipt,
  Database,
  ChevronLeft,
  ChevronRight,
  X,
  Moon,
} from 'lucide-react'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Separator } from '@/components/ui/separator'
import { Button } from '@/components/ui/button'
import { Sheet, SheetContent } from '@/components/ui/sheet'

const routes = [
  {
    label: 'Dashboard',
    icon: LayoutDashboard,
    href: '/dashboard',
  },
  {
    label: 'Bookings',
    icon: Calendar,
    href: '/bookings',
  },
  {
    label: 'Reservations',
    icon: CalendarClock,
    href: '/reservations',
  },
  {
    label: 'Guest Database',
    icon: Database,
    href: '/guest-database',
  },
  {
    label: 'Rooms',
    icon: Bed,
    href: '/rooms',
  },
  {
    label: 'Transactions',
    icon: Receipt,
    href: '/transactions',
  },
  {
    label: 'Organizations',
    icon: Building2,
    href: '/organizations',
  },
  {
    label: 'Analytics',
    icon: TrendingUp,
    href: '/analytics',
  },
  {
    label: 'Reconciliation',
    icon: Briefcase,
    href: '/reconciliation',
  },
  {
    label: 'Night Audit',
    icon: Moon,
    href: '/night-audit',
  },
  {
    label: 'Reports',
    icon: FileBarChart,
    href: '/reports',
  },
  {
    label: 'Settings',
    icon: Settings,
    href: '/settings',
  },
]

interface SidebarProps {
  mobileOpen?: boolean
  onMobileClose?: () => void
}

export function Sidebar({ mobileOpen, onMobileClose }: SidebarProps = {}) {
  const pathname = usePathname()
  const [collapsed, setCollapsed] = useState(false)

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
          {routes.map((route) => {
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
        <SheetContent side="left" className="p-0 w-64">
          <SidebarContent isMobile />
        </SheetContent>
      </Sheet>
    </>
  )
}
