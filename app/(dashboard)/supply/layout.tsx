'use client'

import { Suspense } from 'react'
import { Loader2 } from 'lucide-react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'
import { useAuth } from '@/lib/auth-context'
import { hasPermission } from '@/lib/permissions'

const NAV: Array<{ href: string; label: string; permissions: import('@/lib/permissions').Permission[] }> = [
  { href: '/supply/store', label: 'Central Store', permissions: ['supply:store'] },
  { href: '/supply/kitchen', label: 'Kitchen', permissions: ['supply:kitchen'] },
  { href: '/supply/purchasing', label: 'Purchasing', permissions: ['supply:purchasing', 'supply:approve_accountant', 'supply:approve_manager'] },
  { href: '/supply/activity', label: 'Activity Log', permissions: ['supply:activity'] },
  { href: '/outlets', label: 'Outlets (POS)', permissions: ['outlet:view', 'supply:fnb'] },
]

function SupplyNav() {
  const pathname = usePathname()
  const { role } = useAuth()

  const visible = NAV.filter((n) => n.permissions.some((p) => hasPermission(role, p)))

  if (visible.length === 0) return null

  return (
    <nav className="flex flex-wrap gap-1 border-b pb-3 mb-2">
      {visible.map((n) => {
        const isActive =
          n.href === '/outlets'
            ? pathname === '/outlets' || pathname.startsWith('/outlets/')
            : pathname.startsWith(n.href)
        return (
          <Link
            key={n.href}
            href={n.href}
            className={cn(
              'rounded-md px-3 py-1.5 text-sm font-medium',
              isActive
                ? 'bg-primary text-primary-foreground'
                : 'text-muted-foreground hover:bg-muted',
            )}
          >
            {n.label}
          </Link>
        )
      })}
    </nav>
  )
}

export default function SupplyLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <SupplyNav />
      {children}
    </>
  )
}

export function SupplyPageShell({ children }: { children: React.ReactNode }) {
  return (
    <Suspense
      fallback={
        <div className="flex justify-center py-24">
          <Loader2 className="h-8 w-8 animate-spin" />
        </div>
      }
    >
      {children}
    </Suspense>
  )
}
