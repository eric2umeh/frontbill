'use client'

import { Button } from '@/components/ui/button'
import type { BasketLine } from '@/lib/supply-chain/types'
import { formatNaira } from '@/lib/utils/currency'
import { Send } from 'lucide-react'
import { PoReviewLinesPanel } from '@/components/supply-chain/po-review-lines-panel'

type Props = {
  basket: BasketLine[]
  /** @deprecated grouping is handled inside PoReviewLinesPanel */
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
  return (
    <div className="rounded-xl border bg-card p-4 h-fit sticky top-4 shadow-md space-y-3">
      <div className="flex justify-between items-center">
        <div>
          <h3 className="font-semibold">Draft basket</h3>
          <p className="text-[11px] text-muted-foreground">
            {readOnly
              ? 'Locked for your role in this status'
              : 'Totals by department first, then items per department'}
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
        <div className="max-h-[560px] overflow-y-auto pr-0.5">
          <PoReviewLinesPanel
            kind="basket"
            lines={basket}
            editable={!readOnly}
            onQtyChange={readOnly ? undefined : onQtyChange}
            onDelete={readOnly ? undefined : onRemove}
            pageSize={8}
            compact
            title="Draft purchase list"
          />
        </div>
      )}

      <div className="border-t pt-3 flex justify-between font-bold">
        <span>Sum total</span>
        <span className="tabular-nums">{formatNaira(total)}</span>
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
