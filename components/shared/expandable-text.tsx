'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

type Props = {
  text: string
  maxLength?: number
  className?: string
}

export function ExpandableText({ text, maxLength = 150, className }: Props) {
  const [expanded, setExpanded] = useState(false)
  const trimmed = text.trim()
  if (!trimmed) return null

  const isLong = trimmed.length > maxLength
  const display =
    !isLong || expanded ? trimmed : `${trimmed.slice(0, maxLength).trim()}…`

  return (
    <div className={cn('space-y-1', className)}>
      <p className="whitespace-pre-wrap break-words">{display}</p>
      {isLong && (
        <Button
          type="button"
          variant="link"
          className="h-auto p-0 text-xs font-medium"
          onClick={() => setExpanded((v) => !v)}
        >
          {expanded ? 'Show less' : 'Show all'}
        </Button>
      )}
    </div>
  )
}
