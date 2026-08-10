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
    <div className="rounded-xl border bg-card p-3 h-fit sticky top-4 shadow-md space-y-2.5 overflow-hidden">
      <div className="flex justify-between items-start gap-2 min-w-0">
        <div className="min-w-0">
          <h3 className="text-[15px] font-semibold leading-tight">Draft basket</h3>
          <p className="text-[13px] text-muted-foreground leading-snug">
            {readOnly ? 'Locked in this status' : 'Dept totals, then items'}
          </p>
        </div>
        {!readOnly && basket.length > 0 && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-8 shrink-0 px-2 text-[13px]"
            onClick={onClear}
          >
            Clear
          </Button>
        )}
      </div>

      {!basket.length ? (
        <p className="text-[13px] text-muted-foreground py-6 text-center leading-snug">
          No items yet — enter quantities on Raise purchase request
        </p>
      ) : (
        <div className="max-h-[560px] overflow-y-auto overflow-x-hidden -mx-0.5 px-0.5">
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

      <div className="border-t pt-2 flex justify-between items-center gap-2 min-w-0 text-[15px] font-bold">
        <span className="shrink-0">Sum total</span>
        <span className="tabular-nums shrink-0 whitespace-nowrap text-right">
          {formatNaira(total)}
        </span>
      </div>

      {onSend && !readOnly && (
        <Button
          className="w-full h-9 text-[13px]"
          disabled={!basket.length}
          onClick={onSend}
        >
          <Send className="h-3.5 w-3.5 mr-1.5" />
          {sendLabel}
        </Button>
      )}
    </div>
  )
}
