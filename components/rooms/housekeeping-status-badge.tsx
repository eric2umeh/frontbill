'use client'

import { Badge } from '@/components/ui/badge'
import {
  getHousekeepingStatusDef,
  housekeepingStatusAbbr,
  housekeepingStatusLabel,
} from '@/lib/rooms/housekeeping-status'
import { cn } from '@/lib/utils'

type Props = {
  status: string | null | undefined
  /** Show abbreviation only (default) or full label */
  variant?: 'abbr' | 'label' | 'both'
  className?: string
  title?: string
}

export function HousekeepingStatusBadge({
  status,
  variant = 'abbr',
  className,
  title,
}: Props) {
  if (!status) return null

  const def = getHousekeepingStatusDef(status)
  const text =
    variant === 'label'
      ? housekeepingStatusLabel(status)
      : variant === 'both'
        ? `${housekeepingStatusLabel(status)} (${housekeepingStatusAbbr(status)})`
        : housekeepingStatusAbbr(status)

  return (
    <Badge
      variant="outline"
      className={cn('text-[10px] font-semibold tabular-nums px-1.5 py-0', def?.color, className)}
      title={title ?? def?.description ?? housekeepingStatusLabel(status)}
    >
      {text}
    </Badge>
  )
}
