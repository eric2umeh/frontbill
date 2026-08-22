'use client'

import { useMemo, useState } from 'react'
import {
  DEPT_LABELS,
  normalizeSupplyDept,
  type PurchaseOrder,
  type RetirementLine,
} from '@/lib/supply-chain/types'
import { formatNaira } from '@/lib/utils/currency'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Ban, Pencil, TrendingDown, TrendingUp } from 'lucide-react'
import { cn } from '@/lib/utils'
import {
  formatUnitLabel,
  parseQuantityValue,
  sanitizeQuantityInput,
} from '@/lib/supply-chain/measurement-units'

function lineNotBought(line: RetirementLine) {
  return line.notBought === true || line.removed === true
}

function CorrectInput({
  value,
  onCommit,
  className,
}: {
  value: number
  onCommit: (v: number) => void
  className?: string
}) {
  const [draft, setDraft] = useState(String(value))
  return (
    <Input
      inputMode="decimal"
      className={cn('h-7 w-16 text-right tabular-nums text-xs', className)}
      value={draft}
      onChange={(e) => setDraft(sanitizeQuantityInput(e.target.value))}
      onBlur={() => {
        const n = parseQuantityValue(draft)
        if (Number.isFinite(n) && n >= 0 && n !== value) onCommit(n)
        else setDraft(String(value))
      }}
    />
  )
}

export function RetirementLinesReview({
  po,
  deptFilter = 'all',
  lines: linesOverride,
  emptyMessage = 'No retirement lines to show.',
  compact = false,
  editable = false,
  onQtyCorrect,
  onPriceCorrect,
}: {
  po: PurchaseOrder
  deptFilter?: string
  lines?: RetirementLine[]
  emptyMessage?: string
  compact?: boolean
  editable?: boolean
  onQtyCorrect?: (lineId: string, qty: number) => void
  onPriceCorrect?: (lineId: string, price: number) => void
}) {
  const rows = useMemo(() => {
    const rLines = linesOverride ?? po.retirement?.lines ?? []
    return rLines
      .map((line) => {
        const orig = po.lines.find((l) => l.id === line.lineId)
        const dept = normalizeSupplyDept(line.dept ?? orig?.dept ?? 'kitchen')
        const notBought = lineNotBought(line)
        const newlyAdded = line.newlyAdded === true
        const qtyChanged =
          !notBought &&
          !newlyAdded &&
          orig != null &&
          Number(line.quantityBought) !== Number(orig.quantityOrdered)
        const priceChanged =
          !notBought &&
          orig != null &&
          Number(line.actualPrice) !== Number(orig.unitPrice)
        return { line, orig, dept, notBought, qtyChanged, priceChanged, newlyAdded }
      })
      .filter((row) => {
        if (!deptFilter || deptFilter === 'all') return true
        return row.dept === normalizeSupplyDept(deptFilter)
      })
  }, [po, deptFilter, linesOverride])

  if (!rows.length) {
    return (
      <p className={cn('text-muted-foreground text-center py-3', compact ? 'text-xs' : 'text-sm')}>
        {emptyMessage}
      </p>
    )
  }

  return (
    <ul className={cn(compact ? 'space-y-1' : 'space-y-2')}>
      {rows.map(({ line, orig, dept, notBought, qtyChanged, priceChanged, newlyAdded }) => (
        <li
          key={`${line.lineId}-${line.stockedAt ?? 'x'}-${line.batchId ?? ''}`}
          className={cn(
            'rounded-md border text-sm',
            compact ? 'px-2 py-1.5 text-xs' : 'px-3 py-2.5',
            newlyAdded &&
              'border-emerald-400 bg-emerald-50/70 dark:bg-emerald-950/25 dark:border-emerald-800',
            notBought &&
              'border-red-200 bg-red-50/60 dark:bg-red-950/25 dark:border-red-900',
            !notBought &&
              !newlyAdded &&
              (qtyChanged || priceChanged) &&
              'border-amber-300 bg-amber-50/70 dark:bg-amber-950/30 dark:border-amber-800',
          )}
        >
          <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
            <div className="min-w-0 flex-1">
              <p
                className={cn(
                  'font-medium truncate',
                  notBought && 'line-through text-muted-foreground decoration-2',
                )}
              >
                {line.name}
                <span className="text-muted-foreground font-normal ml-1">
                  · {DEPT_LABELS[dept] ?? dept}
                </span>
              </p>
              {!compact && orig ? (
                <p className={cn('text-[11px] text-muted-foreground', notBought && 'line-through')}>
                  Ordered {orig.quantityOrdered} @ {formatNaira(orig.unitPrice)}
                </p>
              ) : null}
              {!compact ? (
                <div className="flex flex-wrap gap-1 pt-0.5">
                  {newlyAdded ? (
                    <Badge className="bg-emerald-600 text-white text-[10px]">New</Badge>
                  ) : null}
                  {notBought ? (
                    <Badge className="bg-red-100 text-red-900 gap-1 text-[10px]">
                      <Ban className="h-3 w-3" />
                      Not bought
                    </Badge>
                  ) : null}
                  {qtyChanged ? (
                    <Badge variant="outline" className="text-[10px] border-amber-400">
                      Qty Δ
                    </Badge>
                  ) : null}
                  {priceChanged ? (
                    <Badge variant="outline" className="text-[10px]">
                      Price Δ
                    </Badge>
                  ) : null}
                </div>
              ) : null}
            </div>
            <div
              className={cn(
                'shrink-0 tabular-nums flex items-center gap-2',
                notBought && 'line-through text-muted-foreground',
              )}
            >
              {!notBought ? (
                <>
                  {editable && onQtyCorrect ? (
                    <CorrectInput
                      value={line.quantityBought}
                      onCommit={(v) => onQtyCorrect(line.lineId, v)}
                    />
                  ) : (
                    <span>
                      {line.quantityBought} {formatUnitLabel(line.unit ?? '')}
                    </span>
                  )}
                  {editable && onPriceCorrect ? (
                    <CorrectInput
                      value={line.actualPrice}
                      onCommit={(v) => onPriceCorrect(line.lineId, v)}
                      className="w-20"
                    />
                  ) : (
                    <span className="text-muted-foreground">@ {formatNaira(line.actualPrice)}</span>
                  )}
                  <span className="font-semibold">{formatNaira(line.totalPaid)}</span>
                </>
              ) : (
                <span className="text-xs font-medium text-red-800 no-underline">₦0</span>
              )}
            </div>
          </div>
          {line.corrections?.length ? (
            <p className="text-[10px] text-amber-800 dark:text-amber-200 mt-1">
              Corrected by {line.corrections[line.corrections.length - 1]?.by}
            </p>
          ) : null}
        </li>
      ))}
    </ul>
  )
}
