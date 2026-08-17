'use client'

import { useMemo } from 'react'
import {
  DEPT_LABELS,
  normalizeSupplyDept,
  type PurchaseOrder,
  type RetirementLine,
} from '@/lib/supply-chain/types'
import { formatNaira } from '@/lib/utils/currency'
import { Badge } from '@/components/ui/badge'
import { Ban, Pencil, TrendingDown, TrendingUp } from 'lucide-react'
import { cn } from '@/lib/utils'
import { formatUnitLabel } from '@/lib/supply-chain/measurement-units'

function lineNotBought(line: RetirementLine) {
  return line.notBought === true || line.removed === true
}

export function RetirementLinesReview({
  po,
  deptFilter = 'all',
}: {
  po: PurchaseOrder
  deptFilter?: string
}) {
  const rows = useMemo(() => {
    const rLines = po.retirement?.lines ?? []
    return rLines
      .map((line) => {
        const orig = po.lines.find((l) => l.id === line.lineId)
        const dept = normalizeSupplyDept(orig?.dept ?? 'kitchen')
        const notBought = lineNotBought(line)
        const qtyChanged =
          !notBought &&
          orig != null &&
          Number(line.quantityBought) !== Number(orig.quantityOrdered)
        const priceChanged =
          !notBought &&
          orig != null &&
          Number(line.actualPrice) !== Number(orig.unitPrice)
        return { line, orig, dept, notBought, qtyChanged, priceChanged }
      })
      .filter((row) => {
        if (!deptFilter || deptFilter === 'all') return true
        return row.dept === normalizeSupplyDept(deptFilter)
      })
  }, [po, deptFilter])

  if (!rows.length) {
    return (
      <p className="text-sm text-muted-foreground text-center py-4">
        No retirement lines to show.
      </p>
    )
  }

  return (
    <ul className="space-y-2">
      {rows.map(({ line, orig, dept, notBought, qtyChanged, priceChanged }) => (
        <li
          key={line.lineId}
          className={cn(
            'rounded-md border px-3 py-2.5 text-sm',
            notBought &&
              'border-red-200 bg-red-50/60 dark:bg-red-950/25 dark:border-red-900',
            !notBought &&
              (qtyChanged || priceChanged) &&
              'border-amber-300 bg-amber-50/70 dark:bg-amber-950/30 dark:border-amber-800',
          )}
        >
          <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
            <div className="min-w-0 flex-1 space-y-1">
              <p
                className={cn(
                  'font-medium flex items-center gap-1.5',
                  notBought && 'line-through text-muted-foreground decoration-2',
                )}
              >
                {!notBought && priceChanged && orig ? (
                  Number(line.actualPrice) > Number(orig.unitPrice) ? (
                    <TrendingUp
                      className="h-3.5 w-3.5 shrink-0 text-red-600"
                      aria-label="Price higher than PO"
                    />
                  ) : (
                    <TrendingDown
                      className="h-3.5 w-3.5 shrink-0 text-emerald-600"
                      aria-label="Price lower than PO"
                    />
                  )
                ) : null}
                {line.name}
              </p>
              <p
                className={cn(
                  'text-[11px] text-muted-foreground',
                  notBought && 'line-through',
                )}
              >
                {DEPT_LABELS[dept] ?? dept}
                {orig
                  ? ` · Ordered ${orig.quantityOrdered} ${formatUnitLabel(orig.unit)} @ ${formatNaira(orig.unitPrice)}`
                  : null}
              </p>
              <div className="flex flex-wrap gap-1.5 pt-0.5">
                {notBought ? (
                  <Badge className="bg-red-100 text-red-900 gap-1">
                    <Ban className="h-3 w-3" />
                    Not bought / removed
                  </Badge>
                ) : null}
                {qtyChanged ? (
                  <Badge
                    variant="outline"
                    className="border-amber-400 text-amber-950 bg-amber-100/80 gap-1"
                  >
                    <Pencil className="h-3 w-3" />
                    Qty {orig?.quantityOrdered} → {line.quantityBought}{' '}
                    {formatUnitLabel(line.unit ?? orig?.unit ?? '')}
                  </Badge>
                ) : null}
                {priceChanged ? (
                  <Badge
                    variant="outline"
                    className={cn(
                      'gap-1',
                      orig && Number(line.actualPrice) > Number(orig.unitPrice)
                        ? 'border-red-300 text-red-800 bg-red-50'
                        : 'border-emerald-300 text-emerald-800 bg-emerald-50',
                    )}
                  >
                    {orig && Number(line.actualPrice) > Number(orig.unitPrice) ? (
                      <TrendingUp className="h-3 w-3" />
                    ) : (
                      <TrendingDown className="h-3 w-3" />
                    )}
                    Price {formatNaira(orig?.unitPrice ?? line.poPrice)} →{' '}
                    {formatNaira(line.actualPrice)}
                  </Badge>
                ) : null}
              </div>
            </div>
            <div
              className={cn(
                'shrink-0 tabular-nums',
                // Laptop+: qty · unit price · total on one line (less empty middle).
                'sm:flex sm:flex-row sm:items-baseline sm:gap-3 sm:text-right',
                // Mobile: stacked.
                'flex flex-col gap-0.5 text-left sm:text-right',
                notBought && 'line-through text-muted-foreground',
              )}
            >
              {!notBought ? (
                <>
                  <span className="whitespace-nowrap">
                    {line.quantityBought} {formatUnitLabel(line.unit ?? '')}
                  </span>
                  <span className="text-xs text-muted-foreground whitespace-nowrap">
                    {formatNaira(line.actualPrice)} each
                  </span>
                  <span className="font-semibold whitespace-nowrap">
                    {formatNaira(line.totalPaid)}
                  </span>
                </>
              ) : (
                <span className="text-xs font-medium text-red-800 no-underline">
                  ₦0
                </span>
              )}
            </div>
          </div>
        </li>
      ))}
    </ul>
  )
}
