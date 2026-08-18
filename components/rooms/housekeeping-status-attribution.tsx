'use client'

import { formatHousekeepingStatusUpdated } from '@/lib/rooms/format-housekeeping-status-updated'
import { cn } from '@/lib/utils'

type Props = {
  updatedAt?: string | null
  updatedByName?: string | null
  className?: string
}

export function HousekeepingStatusAttribution({ updatedAt, updatedByName, className }: Props) {
  const text = formatHousekeepingStatusUpdated({ updatedAt, updatedByName })
  if (!text) return null

  return (
    <p className={cn('text-[10px] text-muted-foreground leading-snug', className)}>
      {text}
    </p>
  )
}
