'use client'

import { cn } from '@/lib/utils'
import type { LucideIcon } from 'lucide-react'

/** Compact inline stat pill — ~10% larger than the original h-7 / text-[10px] badges. */
const BADGE_BASE =
  'inline-flex h-[31px] items-center gap-1 rounded-md border px-[7px] text-[11px] font-medium leading-none shadow-sm'

export type CompactStatBadgeItem = {
  key: string
  label: string
  value: string | number
  icon?: LucideIcon
  borderClass: string
  bgClass: string
  iconClass: string
  title?: string
}

export function CompactStatBadgeRow({
  items,
  suffix,
  className,
}: {
  items: CompactStatBadgeItem[]
  suffix?: React.ReactNode
  className?: string
}) {
  return (
    <div className={cn('flex flex-wrap items-center justify-center gap-1.5', className)}>
      {items.map((item) => {
        const Icon = item.icon
        return (
          <div
            key={item.key}
            className={cn(BADGE_BASE, item.borderClass, item.bgClass)}
            title={item.title}
          >
            {Icon ? (
              <Icon className={cn('h-3.5 w-3.5 shrink-0', item.iconClass)} aria-hidden />
            ) : null}
            <span className="text-muted-foreground">{item.label}</span>
            <span className="tabular-nums text-foreground">{item.value}</span>
          </div>
        )
      })}
      {suffix}
    </div>
  )
}
