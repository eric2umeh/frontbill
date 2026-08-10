'use client'

import { useEffect, useMemo, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  DEPT_LABELS,
  STORE_DEPT_PICKER_OPTIONS_SORTED,
  type BasketLine,
  type SupplyDept,
} from '@/lib/supply-chain/types'
import {
  parseQuantityValue,
  formatUnitLabel,
  sanitizeQuantityInput,
} from '@/lib/supply-chain/measurement-units'
import { formatNaira } from '@/lib/utils/currency'
import { Minus, Plus, Send, Trash2 } from 'lucide-react'
import { PaginatedListShell } from '@/components/shared/paginated-list-shell'

function BasketLineQtyControls({
  stockItemId,
  committedQty,
  unitPrice,
  onCommit,
}: {
  stockItemId: string
  committedQty: number
  unitPrice: number
  onCommit: (qty: number) => void
}) {
  const [draft, setDraft] = useState(String(committedQty))
  useEffect(() => {
    setDraft(String(committedQty))
  }, [committedQty, stockItemId])

  const commit = () => {
    const trimmed = draft.trim()
    if (!trimmed) {
      setDraft(String(committedQty))
      return
    }
    const qty = parseQuantityValue(trimmed)
    if (!Number.isFinite(qty) || qty <= 0) {
      setDraft(String(committedQty))
      return
    }
    if (qty !== committedQty) onCommit(qty)
  }

  const trimmed = draft.trim()
  const parsed = trimmed ? parseQuantityValue(trimmed) : NaN
  const liveQty = Number.isFinite(parsed) && parsed > 0 ? parsed : committedQty
  const liveTotal = liveQty * (Number.isFinite(unitPrice) ? unitPrice : 0)

  return (
    <>
      <div className="flex items-center gap-1">
        <Button
          type="button"
          variant="outline"
          size="icon"
          className="h-7 w-7"
          allowRepeatClick
          onClick={() => onCommit(Math.max(0, committedQty - 1))}
        >
          <Minus className="h-3 w-3" />
        </Button>
        <Input
          inputMode="decimal"
          className="h-7 w-14 text-center px-1"
          value={draft}
          onChange={(e) => setDraft(sanitizeQuantityInput(e.target.value))}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              ;(e.target as HTMLInputElement).blur()
            }
          }}
        />
        <Button
          type="button"
          variant="outline"
          size="icon"
          className="h-7 w-7"
          allowRepeatClick
          onClick={() => onCommit(committedQty + 1)}
        >
          <Plus className="h-3 w-3" />
        </Button>
      </div>
      <span className="tabular-nums font-medium min-w-[4.5rem] text-right">
        {formatNaira(liveTotal)}
      </span>
    </>
  )
}

type Props = {
  basket: BasketLine[]
  /** @deprecated grouping is handled by the department filter */
  basketByDept?: Map<string, BasketLine[]>
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
  total,
  readOnly = false,
  onClear,
  onRemove,
  onQtyChange,
  onSend,
  sendLabel = 'Send for approval',
}: Props) {
  const deptFilters = useMemo(() => {
    const present = new Set(basket.map((b) => b.dept))
    return [
      {
        key: 'dept',
        label: 'Department',
        options: STORE_DEPT_PICKER_OPTIONS_SORTED.filter((d) => present.has(d)).map(
          (d) => ({
            value: d,
            label: DEPT_LABELS[d as SupplyDept] ?? d,
          }),
        ),
      },
    ]
  }, [basket])

  return (
    <div className="rounded-xl border bg-card p-4 h-fit sticky top-4 shadow-md space-y-3">
      <div className="flex justify-between items-center">
        <div>
          <h3 className="font-semibold">Draft basket</h3>
          <p className="text-[11px] text-muted-foreground">
            {readOnly
              ? 'Locked for your role in this status'
              : 'Quick view — send from Purchase orders / kitchen tab'}
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
        <div className="max-h-[480px] overflow-y-auto pr-0.5">
          <PaginatedListShell
            items={basket}
            pageSize={8}
            searchPlaceholder="Search basket…"
            searchMatch={(line, query) => {
              const q = query.trim().toLowerCase()
              if (!q) return true
              return (
                line.name.toLowerCase().includes(q) ||
                line.unit.toLowerCase().includes(q) ||
                (DEPT_LABELS[line.dept] ?? line.dept).toLowerCase().includes(q)
              )
            }}
            filters={deptFilters}
            filterMatch={(line, key, value) => {
              if (key !== 'dept') return undefined
              if (!value || value === 'all') return true
              return line.dept === value
            }}
            emptyMessage="No basket lines match."
          >
            {(pageItems) => (
              <ul className="space-y-2">
                {pageItems.map((l) => (
                  <li
                    key={l.stockItemId}
                    className="rounded-lg border px-2 py-2 text-sm space-y-1.5"
                  >
                    <div className="flex justify-between gap-2 items-start">
                      <span className="font-medium leading-snug">
                        {l.name}{' '}
                        <span className="text-muted-foreground font-normal">
                          ({formatUnitLabel(l.unit)})
                        </span>
                        <span className="block text-[10px] text-muted-foreground font-normal">
                          {DEPT_LABELS[l.dept] ?? l.dept}
                        </span>
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
                          {l.qtyToBuy} {formatUnitLabel(l.unit)} × {formatNaira(l.unitPrice)}
                        </span>
                      ) : (
                        <BasketLineQtyControls
                          stockItemId={l.stockItemId}
                          committedQty={l.qtyToBuy}
                          unitPrice={l.unitPrice}
                          onCommit={(qty) => onQtyChange(l.stockItemId, qty)}
                        />
                      )}
                    </div>
                    {l.storeQtyToBuy != null &&
                      l.storeUnit &&
                      l.storeUnit !== l.unit && (
                        <p className="text-[11px] text-muted-foreground">
                          Receives {l.storeQtyToBuy} {formatUnitLabel(l.storeUnit)} into
                          store
                          {l.storeUnitPrice
                            ? ` · ${formatNaira(l.storeUnitPrice)}/${formatUnitLabel(l.storeUnit)}`
                            : ''}
                        </p>
                      )}
                  </li>
                ))}
              </ul>
            )}
          </PaginatedListShell>
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
