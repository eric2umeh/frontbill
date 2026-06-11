'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

const EXPAND_THRESHOLD = 150

type Props = {
  label: string
  comment: string
  variant?: 'reject' | 'info' | 'manager'
  className?: string
  compact?: boolean
}

export function PoCommentBanner({
  label,
  comment,
  variant = 'info',
  className,
  compact = false,
}: Props) {
  const [expanded, setExpanded] = useState(false)
  const trimmed = comment.trim()
  if (!trimmed) return null

  const isLong = trimmed.length > EXPAND_THRESHOLD
  const display = !isLong || expanded ? trimmed : `${trimmed.slice(0, EXPAND_THRESHOLD).trim()}…`

  const styles = {
    reject: 'border-red-300 bg-red-50 text-red-900 dark:bg-red-950/30 dark:border-red-900',
    manager: 'border-blue-300 bg-blue-50 text-blue-900 dark:bg-blue-950/30 dark:border-blue-900',
    info: 'border-amber-300 bg-amber-50 text-amber-950 dark:bg-amber-950/30 dark:border-amber-900',
  }

  return (
    <div
      className={cn(
        compact
          ? 'rounded-md border px-2.5 py-2 text-xs'
          : 'rounded-lg border-2 px-4 py-3 text-sm shadow-sm',
        styles[variant],
        className,
      )}
      role="note"
    >
      <p
        className={cn(
          'font-semibold uppercase tracking-wide opacity-80 mb-0.5',
          compact ? 'text-[10px]' : 'text-xs font-bold mb-1',
        )}
      >
        {label}
      </p>
      <p
        className={cn(
          'leading-snug whitespace-pre-wrap break-words',
          compact ? 'text-xs' : 'text-base font-medium leading-relaxed',
        )}
      >
        {display}
      </p>
      {isLong && (
        <Button
          type="button"
          variant="link"
          className={cn(
            'h-auto p-0 font-semibold',
            compact ? 'mt-1 text-[10px]' : 'mt-2 text-sm',
          )}
          onClick={() => setExpanded((v) => !v)}
        >
          {expanded ? 'Show less' : 'Show full comment'}
        </Button>
      )}
    </div>
  )
}
