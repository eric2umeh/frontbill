'use client'

import { useState } from 'react'
import type { BasketLine, PoLine } from '@/lib/supply-chain/types'
import { DEPT_LABELS } from '@/lib/supply-chain/types'
import { formatNaira } from '@/lib/utils/currency'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Eye } from 'lucide-react'

type BasketRow = {
  kind: 'basket'
  line: BasketLine
  editable?: boolean
  onQtyChange?: (stockItemId: string, qty: number) => void
  onDelete?: (stockItemId: string) => void
}

type PoRow = {
  kind: 'po'
  line: PoLine
}

type Props = {
  rows: BasketRow[] | PoRow[]
  showDept?: boolean
  compact?: boolean
}

export function PoLinesTable({ rows, showDept = true, compact = false }: Props) {
  const [detailRow, setDetailRow] = useState<BasketRow | PoRow | null>(null)

  if (!rows.length) {
    return (
      <p className="text-sm text-muted-foreground py-6 text-center">No line items.</p>
    )
  }

  return (
    <>
      <div className="md:hidden space-y-2">
        {rows.map((row) => {
          const isBasket = row.kind === 'basket'
          const line = row.line
          const key = isBasket ? line.stockItemId : line.id
          const qty = isBasket ? line.qtyToBuy : line.quantityOrdered
          const unitPrice = isBasket ? line.unitPrice : line.unitPrice
          const total = isBasket ? line.qtyToBuy * line.unitPrice : line.lineTotal
          const editable = isBasket && row.editable

          return (
            <div key={key} className="rounded-lg border p-2.5 text-sm space-y-2">
              <div className="flex items-start justify-between gap-2">
                <p className="font-medium leading-snug">
                  {line.name}{' '}
                  <span className="text-muted-foreground font-normal">({line.unit})</span>
                </p>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 shrink-0"
                  onClick={() => setDetailRow(row)}
                >
                  <Eye className="h-3.5 w-3.5" />
                </Button>
              </div>
              <div className="flex items-center justify-between gap-2">
                {editable && row.onQtyChange ? (
                  <Input
                    type="number"
                    min={0}
                    className="h-8 w-20"
                    value={qty}
                    onChange={(e) =>
                      row.onQtyChange!(line.stockItemId, Number(e.target.value) || 0)
                    }
                  />
                ) : (
                  <span className="text-muted-foreground text-xs">Qty: {qty}</span>
                )}
                <span className="font-medium tabular-nums">{formatNaira(total)}</span>
                {editable && row.onDelete && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-destructive"
                    onClick={() => row.onDelete!(line.stockItemId)}
                  >
                    ×
                  </Button>
                )}
              </div>
            </div>
          )
        })}
      </div>

      <table className="hidden md:table w-full text-sm">
        <thead>
          <tr className="border-b text-left text-muted-foreground">
            <th className="pb-2 font-medium">Item</th>
            {showDept && !compact && <th className="pb-2 font-medium">Dept</th>}
            <th className="pb-2 font-medium text-right">Qty</th>
            {!compact && <th className="pb-2 font-medium text-right">Unit price</th>}
            <th className="pb-2 font-medium text-right">Line total</th>
            {rows.some((r) => r.kind === 'basket' && r.editable) && (
              <th className="pb-2 w-10" />
            )}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            if (row.kind === 'basket') {
              const l = row.line
              return (
                <tr key={l.stockItemId} className="border-b last:border-0">
                  <td className="py-2 pr-2 font-medium">
                    {l.name}{' '}
                    <span className="text-muted-foreground font-normal">({l.unit})</span>
                  </td>
                  {showDept && !compact && (
                    <td className="py-2">
                      <Badge variant="outline" className="text-[10px]">
                        {DEPT_LABELS[l.dept]}
                      </Badge>
                    </td>
                  )}
                  <td className="py-2 text-right">
                    {row.editable && row.onQtyChange ? (
                      <Input
                        type="number"
                        min={0}
                        className="h-8 w-16 ml-auto text-right"
                        value={l.qtyToBuy}
                        onChange={(e) =>
                          row.onQtyChange!(l.stockItemId, Number(e.target.value) || 0)
                        }
                      />
                    ) : (
                      <span className="tabular-nums">
                        {l.qtyToBuy} {l.unit}
                      </span>
                    )}
                  </td>
                  {!compact && (
                    <td className="py-2 text-right tabular-nums">
                      {formatNaira(l.unitPrice)}
                    </td>
                  )}
                  <td className="py-2 text-right tabular-nums font-medium">
                    {formatNaira(l.qtyToBuy * l.unitPrice)}
                  </td>
                  {row.editable && row.onDelete && (
                    <td className="py-2 text-right">
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-destructive"
                        onClick={() => row.onDelete!(l.stockItemId)}
                      >
                        ×
                      </Button>
                    </td>
                  )}
                </tr>
              )
            }
            const l = row.line
            return (
              <tr key={l.id} className="border-b last:border-0">
                <td className="py-2 pr-2 font-medium">
                  {l.name}{' '}
                  <span className="text-muted-foreground font-normal">({l.unit})</span>
                </td>
                {showDept && !compact && (
                  <td className="py-2">
                    <Badge variant="outline" className="text-[10px]">
                      {DEPT_LABELS[l.dept]}
                    </Badge>
                  </td>
                )}
                <td className="py-2 text-right tabular-nums">
                  {l.quantityOrdered} {l.unit}
                </td>
                {!compact && (
                  <td className="py-2 text-right tabular-nums">
                    {formatNaira(l.unitPrice)}
                  </td>
                )}
                <td className="py-2 text-right tabular-nums font-medium">
                  {formatNaira(l.lineTotal)}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>

      <Dialog open={!!detailRow} onOpenChange={() => setDetailRow(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Line details</DialogTitle>
          </DialogHeader>
          {detailRow && (
            <dl className="text-sm space-y-2">
              <div className="flex justify-between gap-2">
                <dt className="text-muted-foreground">Item</dt>
                <dd className="font-medium text-right">{detailRow.line.name}</dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-muted-foreground">Unit</dt>
                <dd>{detailRow.line.unit}</dd>
              </div>
              {'dept' in detailRow.line && showDept && (
                <div className="flex justify-between gap-2">
                  <dt className="text-muted-foreground">Dept</dt>
                  <dd>{DEPT_LABELS[detailRow.line.dept]}</dd>
                </div>
              )}
              <div className="flex justify-between gap-2">
                <dt className="text-muted-foreground">Qty</dt>
                <dd>
                  {detailRow.kind === 'basket'
                    ? detailRow.line.qtyToBuy
                    : detailRow.line.quantityOrdered}
                </dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-muted-foreground">Unit price</dt>
                <dd>{formatNaira(detailRow.line.unitPrice)}</dd>
              </div>
              <div className="flex justify-between gap-2 font-medium">
                <dt>Line total</dt>
                <dd>
                  {formatNaira(
                    detailRow.kind === 'basket'
                      ? detailRow.line.qtyToBuy * detailRow.line.unitPrice
                      : detailRow.line.lineTotal,
                  )}
                </dd>
              </div>
            </dl>
          )}
        </DialogContent>
      </Dialog>
    </>
  )
}
