'use client'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { DEPT_LABELS, type BasketLine, type SupplyDept } from '@/lib/supply-chain/types'
import { parseQuantityValue } from '@/lib/supply-chain/measurement-units'
import { formatNaira } from '@/lib/utils/currency'
import { Minus, Plus, Send, Trash2 } from 'lucide-react'

type Props = {
  basket: BasketLine[]
  basketByDept: Map<string, BasketLine[]>
  total: number
  readOnly?: boolean
  onClear: () => void
  onRemove: (stockItemId: string) => void
  onQtyChange: (stockItemId: string, qty: number) => void
  onSend?: () => void
  sendLabel?: string
}

export function DraftBasketSidebar({
  basket,
  basketByDept,
  total,
  readOnly = false,
  onClear,
  onRemove,
  onQtyChange,
  onSend,
  sendLabel = 'Send for approval',
}: Props) {
  return (
    <div className="rounded-xl border bg-card p-4 h-fit sticky top-4 shadow-md space-y-3">
      <div className="flex justify-between items-center">
        <div>
          <h3 className="font-semibold">Draft basket</h3>
          <p className="text-[11px] text-muted-foreground">
            {readOnly
              ? 'Locked while accountant reviews or PO is in approval'
              : 'Quick view — send from Purchase orders tab'}
          </p>
        </div>
        {!readOnly && basket.length > 0 && (
          <Button type="button" variant="ghost" size="sm" onClick={onClear}>
            Clear all
          </Button>
        )}
      </div>

      {!basket.length ? (
        <p className="text-sm text-muted-foreground py-8 text-center">
          No items yet — enter quantities on Raise purchase request
        </p>
      ) : (
        <div className="space-y-4 max-h-[420px] overflow-y-auto">
          {[...basketByDept.entries()].map(([dept, lines]) => (
            <div key={dept}>
              <p className="text-xs font-bold text-muted-foreground mb-1.5">
                {DEPT_LABELS[dept as SupplyDept]?.toUpperCase() ?? dept}
              </p>
              <ul className="space-y-2">
                {lines.map((l) => (
                  <li
                    key={l.stockItemId}
                    className="rounded-lg border px-2 py-2 text-sm space-y-1.5"
                  >
                    <div className="flex justify-between gap-2 items-start">
                      <span className="font-medium leading-snug">
                        {l.name}{' '}
                        <span className="text-muted-foreground font-normal">({l.unit})</span>
                      </span>
                      {!readOnly && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 shrink-0 text-destructive"
                          onClick={() => onRemove(l.stockItemId)}
                          aria-label={`Remove ${l.name}`}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      )}
                    </div>
                    <div className="flex items-center justify-between gap-2">
                      {readOnly ? (
                        <span className="text-muted-foreground tabular-nums">
                          {l.qtyToBuy} × {formatNaira(l.unitPrice)}
                        </span>
                      ) : (
                        <div className="flex items-center gap-1">
                          <Button
                            type="button"
                            variant="outline"
                            size="icon"
                            className="h-7 w-7"
                            allowRepeatClick
                            onClick={() => onQtyChange(l.stockItemId, Math.max(0, l.qtyToBuy - 1))}
                          >
                            <Minus className="h-3 w-3" />
                          </Button>
                          <Input
                            inputMode="decimal"
                            className="h-7 w-14 text-center px-1"
                            value={String(l.qtyToBuy)}
                            onChange={(e) =>
                              onQtyChange(
                                l.stockItemId,
                                parseQuantityValue(e.target.value),
                              )
                            }
                          />
                          <Button
                            type="button"
                            variant="outline"
                            size="icon"
                            className="h-7 w-7"
                            allowRepeatClick
                            onClick={() => onQtyChange(l.stockItemId, l.qtyToBuy + 1)}
                          >
                            <Plus className="h-3 w-3" />
                          </Button>
                        </div>
                      )}
                      <span className="tabular-nums font-medium">
                        {formatNaira(l.qtyToBuy * l.unitPrice)}
                      </span>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}

      <div className="border-t pt-3 flex justify-between font-bold">
        <span>Total</span>
        <span>{formatNaira(total)}</span>
      </div>

      {onSend && !readOnly && (
        <Button className="w-full" disabled={!basket.length} onClick={onSend}>
          <Send className="h-4 w-4 mr-2" />
          {sendLabel}
        </Button>
      )}
    </div>
  )
}
