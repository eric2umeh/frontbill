'use client'

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
  dept,
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
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'relative rounded-full border px-3 py-1 text-xs font-medium transition-colors',
        active ? 'bg-primary text-primary-foreground border-primary' : 'bg-muted/50 hover:bg-muted',
      )}
    >
      {label}
      {count != null && count > 0 && (
        <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-yellow-400 px-0.5 text-[9px] font-bold text-yellow-950">
          {count}
        </span>
      )}
    </button>
  )
}
