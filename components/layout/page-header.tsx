import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

type Props = {
  title: string
  description?: string
  backLink?: ReactNode
  trailing?: ReactNode
  className?: string
}

/** Compact page title row — less vertical space than default h1 + subtitle stacks. */
export function PageHeader({ title, description, backLink, trailing, className }: Props) {
  return (
    <div className={cn('flex flex-wrap items-center gap-2', className)}>
      {backLink}
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
          <h1 className="text-lg font-bold tracking-tight leading-tight">{title}</h1>
          {trailing}
        </div>
        {description ? (
          <p className="text-xs text-muted-foreground leading-snug mt-0.5">{description}</p>
        ) : null}
      </div>
    </div>
  )
}
