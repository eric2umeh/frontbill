'use client'

import { useEffect } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { cn } from '@/lib/utils'
import { useAuth } from '@/lib/auth-context'
import { hasPermission } from '@/lib/permissions'

const MAIN_TABS = [
  {
    href: '/transactions/daily-book',
    label: 'Daily book',
    permission: 'transactions:view' as const,
    match: (pathname: string) => pathname.startsWith('/transactions/daily-book'),
  },
  {
    href: '/transactions',
    label: 'Transactions',
    permission: 'transactions:view' as const,
    match: (pathname: string) =>
      pathname === '/transactions' || isTransactionDetailPath(pathname),
  },
  {
    href: '/transactions/analytics/revenue',
    label: 'Analytics',
    permission: 'analytics:view' as const,
    match: (pathname: string) => pathname.startsWith('/transactions/analytics'),
  },
]

function isTransactionDetailPath(pathname: string): boolean {
  return (
    /^\/transactions\/[^/]+$/.test(pathname) &&
    !pathname.startsWith('/transactions/analytics') &&
    !pathname.startsWith('/transactions/daily-book')
  )
}

export function TransactionsSectionLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const router = useRouter()
  const { role } = useAuth()

  const visibleTabs = MAIN_TABS.filter((tab) => hasPermission(role, tab.permission))
  const isDetailPage = isTransactionDetailPath(pathname)

  useEffect(() => {
    if (pathname !== '/transactions') return
    if (hasPermission(role, 'transactions:view')) return
    if (hasPermission(role, 'analytics:view')) {
      router.replace('/transactions/analytics/revenue')
    }
  }, [pathname, role, router])

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Transactions / Analytics</h1>
        <p className="text-muted-foreground">
          Payment ledger, daily book (in-house guests + sales collection), and profitability
        </p>
      </div>

      {visibleTabs.length > 0 && !isDetailPage && (
        <nav className="flex gap-1 border-b overflow-x-auto">
          {visibleTabs.map((tab) => {
            const active = tab.match(pathname)
            return (
              <Link
                key={tab.href}
                href={tab.href}
                className={cn(
                  'px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors whitespace-nowrap',
                  active
                    ? 'border-primary text-foreground'
                    : 'border-transparent text-muted-foreground hover:text-foreground',
                )}
              >
                {tab.label}
              </Link>
            )
          })}
        </nav>
      )}

      {children}
    </div>
  )
}
