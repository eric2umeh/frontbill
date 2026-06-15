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
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'relative inline-flex items-center overflow-visible rounded-full border px-3 py-1.5 text-xs font-medium transition-colors',
        showCount && 'pr-5',
        active ? 'bg-primary text-primary-foreground border-primary' : 'bg-muted/50 hover:bg-muted',
      )}
    >
      <span className="leading-tight">{label}</span>
      {showCount && (
        <span
          className={cn(
            'pointer-events-none absolute -right-1 -top-1 flex h-[1.125rem] min-w-[1.125rem] items-center justify-center rounded-full border bg-background px-1 text-[9px] font-bold leading-none tabular-nums',
            active
              ? 'border-primary-foreground text-primary-foreground'
              : 'border-foreground text-foreground',
          )}
          aria-label={`${count} items`}
        >
          {count! > 99 ? '99+' : count}
        </span>
      )}
    </button>
  )
}
