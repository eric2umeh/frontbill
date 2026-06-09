'use client'

import type { ReactNode } from 'react'
import type { PurchaseOrder } from '@/lib/supply-chain/types'
import { formatNaira } from '@/lib/utils/currency'
import { poStatusBadge } from '@/components/supply-chain/po-approval-panel'
import { formatPoRaisedAt } from '@/lib/supply-chain/po-format'
import { PoLinesTable } from '@/components/supply-chain/po-lines-table'
import { Button } from '@/components/ui/button'
import { ChevronDown, ChevronRight } from 'lucide-react'
import { cn } from '@/lib/utils'

type Props = {
  po: PurchaseOrder
  expanded?: boolean
  onToggle?: () => void
  action?: ReactNode
  defaultOpen?: boolean
}

export function PoDetailCard({
  po,
  expanded,
  onToggle,
  action,
  defaultOpen = false,
}: Props) {
  const open = expanded ?? defaultOpen

  return (
    <div className="rounded-lg border overflow-hidden">
      <div
        className={cn(
          'flex flex-wrap items-center justify-between gap-3 p-4',
          onToggle && 'cursor-pointer hover:bg-muted/40 transition-colors',
        )}
        onClick={onToggle}
        onKeyDown={
          onToggle
            ? (e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault()
                  onToggle()
                }
              }
            : undefined
        }
        role={onToggle ? 'button' : undefined}
        tabIndex={onToggle ? 0 : undefined}
      >
        <div className="flex items-start gap-2 min-w-0">
          {onToggle &&
            (open ? (
              <ChevronDown className="h-4 w-4 mt-0.5 shrink-0 text-muted-foreground" />
            ) : (
              <ChevronRight className="h-4 w-4 mt-0.5 shrink-0 text-muted-foreground" />
            ))}
          <div className="space-y-1 min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <p className="font-medium">
                {po.poNumber} — {po.weekLabel}
              </p>
              {poStatusBadge(po.status)}
            </div>
            <p className="text-sm text-muted-foreground">
              {po.createdByName} · {formatNaira(po.totalAmount)} · {po.lines.length} item
              {po.lines.length === 1 ? '' : 's'}
            </p>
            <p className="text-xs text-muted-foreground">
              Raised {formatPoRaisedAt(po.createdAt)}
            </p>
            {po.accountantComment && (
              <p className="text-xs text-muted-foreground">Accountant: {po.accountantComment}</p>
            )}
            {po.managerComment && (
              <p className="text-xs text-muted-foreground">Manager: {po.managerComment}</p>
            )}
          </div>
        </div>
        {action && (
          <div onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>
            {action}
          </div>
        )}
      </div>
      {open && (
        <div className="border-t bg-muted/20 px-4 py-3">
          <PoLinesTable rows={po.lines.map((line) => ({ kind: 'po' as const, line }))} />
        </div>
      )}
    </div>
  )
}

export function PoDetailPanel({
  po,
  onBack,
}: {
  po: PurchaseOrder
  onBack?: () => void
}) {
  return (
    <div className="space-y-4">
      {onBack && (
        <Button type="button" variant="ghost" onClick={onBack}>
          ← Back to list
        </Button>
      )}
      <PoDetailCard po={po} defaultOpen />
    </div>
  )
}
