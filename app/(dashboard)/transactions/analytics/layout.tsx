'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'

const ANALYTICS_TABS = [
  { href: '/transactions/analytics/revenue', label: 'Revenue' },
  { href: '/transactions/analytics/profitability', label: 'Profitability' },
]

export default function TransactionsAnalyticsLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()

  return (
    <div className="space-y-6">
      <nav className="flex gap-1 border-b overflow-x-auto">
        {ANALYTICS_TABS.map((tab) => {
          const active =
            pathname === tab.href ||
            (tab.href === '/transactions/analytics/revenue' &&
              pathname === '/transactions/analytics')
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
      {children}
    </div>
  )
}
