'use client'

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
  FileText,
  TrendingUp,
  Settings,
  Hotel,
  FileBarChart,
  Briefcase,
} from 'lucide-react'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Separator } from '@/components/ui/separator'

const routes = [
  {
    label: 'Dashboard',
    icon: LayoutDashboard,
    href: '/dashboard',
  },
  {
    label: 'Guests',
    icon: Users,
    href: '/guests',
  },
  {
    label: 'Rooms',
    icon: Bed,
    href: '/rooms',
  },
  {
    label: 'Bookings',
    icon: Calendar,
    href: '/bookings',
  },
  {
    label: 'Payments',
    icon: CreditCard,
    href: '/payments',
  },
  {
    label: 'City Ledger',
    icon: FileText,
    href: '/ledger',
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

export function Sidebar() {
  const pathname = usePathname()

  return (
    <div className="hidden h-full w-64 flex-col border-r bg-card md:flex">
      <div className="flex h-16 items-center gap-2 border-b px-6">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary">
          <Hotel className="h-6 w-6 text-primary-foreground" />
        </div>
        <div>
          <h1 className="text-lg font-bold leading-none">FrontBill</h1>
          <p className="text-xs text-muted-foreground">Hotel Management</p>
        </div>
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
                className={cn(
                  'flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors',
                  isActive
                    ? 'bg-primary text-primary-foreground'
                    : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
                )}
              >
                <Icon className="h-4 w-4" />
                {route.label}
              </Link>
            )
          })}
        </div>
      </ScrollArea>

      <div className="border-t p-4">
        <p className="text-center text-xs text-muted-foreground">
          Version 1.0.0
        </p>
      </div>
    </div>
  )
}
