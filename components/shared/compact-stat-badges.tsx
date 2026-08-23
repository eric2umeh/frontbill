'use client'

import Link from 'next/link'
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
  /** When set, the badge links to daily book or report breakdown. */
  href?: string
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
        const inner = (
          <>
            {Icon ? (
              <Icon className={cn('h-3.5 w-3.5 shrink-0', item.iconClass)} aria-hidden />
            ) : null}
            <span className="text-muted-foreground">{item.label}</span>
            <span className="tabular-nums text-foreground">{item.value}</span>
          </>
        )
        const className = cn(
          BADGE_BASE,
          item.borderClass,
          item.bgClass,
          item.href && 'hover:brightness-[0.98] transition-colors cursor-pointer',
        )
        if (item.href) {
          return (
            <Link
              key={item.key}
              href={item.href}
              className={className}
              title={item.title ?? `View ${item.label} breakdown`}
            >
              {inner}
            </Link>
          )
        }
        return (
          <div key={item.key} className={className} title={item.title}>
            {inner}
          </div>
        )
      })}
      {suffix}
    </div>
  )
}
