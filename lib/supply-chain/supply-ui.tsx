'use client'

import { useEffect, useState } from 'react'
import { cn } from '@/lib/utils'
import type { LucideIcon } from 'lucide-react'

export function SupplyStatRow({
  cards,
}: {
  cards: { label: string; value: string | number; icon: LucideIcon; tone?: 'green' | 'red' | 'amber' | 'blue' | 'purple' }[]
}) {
  const toneClass = {
    green: 'text-emerald-600',
    red: 'text-red-600',
    amber: 'text-amber-600',
    blue: 'text-blue-600',
    purple: 'text-purple-600',
  }
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      {cards.map((c) => {
        const Icon = c.icon
        return (
          <div key={c.label} className="rounded-xl border bg-card p-4 shadow-sm">
            <div className="flex items-center justify-between">
              <p className="text-xs text-muted-foreground">{c.label}</p>
              <Icon className={cn('h-4 w-4', toneClass[c.tone ?? 'green'])} />
            </div>
            <p className="mt-2 text-2xl font-bold tabular-nums">{c.value}</p>
          </div>
        )
      })}
    </div>
  )
}

export function DeptPill({
  count,
  active,
  onClick,
  label,
}: {
  dept: string
  count?: number
  active?: boolean
  onClick?: () => void
  label: string
}) {
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])

  const showCount = mounted && count != null && count > 0

  return (
    <span className="relative inline-flex shrink-0 pt-1 ml-1">
      <button
        type="button"
        onClick={onClick}
        className={cn(
          'rounded-full border px-2.5 py-1 text-xs font-medium leading-none transition-colors',
          active
            ? 'border-foreground/70 bg-muted/40 text-foreground'
            : 'border-border/60 bg-transparent text-muted-foreground hover:border-border hover:bg-muted/20',
        )}
      >
        {label}
      </button>
      {showCount && (
        <span
          className="pointer-events-none absolute right-0 top-0 z-10 flex h-5 min-w-5 -translate-y-1/2 translate-x-1/2 items-center justify-center rounded-full border border-transparent bg-secondary px-1.5 text-[10px] font-semibold leading-none text-secondary-foreground tabular-nums shadow-sm"
          aria-label={`${count} items`}
        >
          {count! > 99 ? '99+' : count}
        </span>
      )}
    </span>
  )
}
