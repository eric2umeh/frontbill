'use client'

import { Button } from '@/components/ui/button'
import type { BasketLine } from '@/lib/supply-chain/types'
import { formatNaira } from '@/lib/utils/currency'
import { AlertTriangle, Send } from 'lucide-react'
import { PoReviewLinesPanel } from '@/components/supply-chain/po-review-lines-panel'
import {
  isZeroPoUnitPrice,
  zeroPriceRowClass,
  zeroPriceTextClass,
} from '@/lib/supply-chain/retirement-review-utils'
import { cn } from '@/lib/utils'

type Props = {
  basket: BasketLine[]
  /** @deprecated grouping is handled inside PoReviewLinesPanel */
  basketByDept?: Map<string, BasketLine[]>
  total: number
  readOnly?: boolean
  onClear: () => void
  onRemove: (stockItemId: string) => void
  onQtyChange: (stockItemId: string, qty: number) => void
  onPriceChange?: (stockItemId: string, price: number) => void
  onSend?: () => void
  sendLabel?: string
  /** Hide Clear when the list must stay until Send (e.g. kitchen → store). */
  hideClear?: boolean
}

export function DraftBasketSidebar({
  basket,
  total,
  readOnly = false,
  onClear,
  onRemove,
  onQtyChange,
  onPriceChange,
  onSend,
  sendLabel = 'Send for approval',
  hideClear = false,
}: Props) {
  const zeroPriceItems = basket.filter((b) => isZeroPoUnitPrice(b.unitPrice))

  return (
    <div className="rounded-xl border bg-card p-3 shadow-md flex flex-col gap-2 min-w-0 w-full max-h-[min(85vh,780px)] overflow-hidden lg:sticky lg:top-4">
      <div className="shrink-0 flex justify-between items-start gap-2 min-w-0">
        <div className="min-w-0">
          <h3 className="text-[15px] font-semibold leading-tight">Draft basket</h3>
          <p className="text-[13px] text-muted-foreground leading-snug">
            {readOnly
              ? 'Locked in this status'
              : basket.length > 8
                ? `${basket.length} items · 8 per page — use search or Previous/Next`
                : `${basket.length} item${basket.length === 1 ? '' : 's'}`}
          </p>
        </div>
        {basket.length > 0 && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-8 shrink-0 px-2.5 text-[13px] text-destructive border-destructive/30 hover:bg-destructive/5"
            onClick={onClear}
          >
            Clear
          </Button>
        )}
      </div>

      {zeroPriceItems.length > 0 && (
        <div className={cn('shrink-0 flex gap-2 rounded-md border px-2.5 py-2 text-[12px] max-h-24 overflow-y-auto', zeroPriceRowClass(), zeroPriceTextClass())}>
          <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
          <div className="leading-snug min-w-0 space-y-1">
            <p>
              <span className="font-semibold">Missing or ₦0 price</span>
              {' — '}
              set unit price before sending:
            </p>
            <p className="flex flex-wrap gap-x-1.5 gap-y-1">
              {zeroPriceItems.map((item, i) => (
                <button
                  key={item.stockItemId}
                  type="button"
                  className="underline underline-offset-2 font-medium hover:text-sky-700 dark:hover:text-sky-50 text-left"
                  onClick={() => {
                    window.dispatchEvent(
                      new CustomEvent('frontbill:focus-raise-po-item', {
                        detail: {
                          stockItemId: item.stockItemId,
                          name: item.name,
                        },
                      }),
                    )
                  }}
                >
                  {item.name}
                  {i < zeroPriceItems.length - 1 ? ',' : ''}
                </button>
              ))}
            </p>
          </div>
        </div>
      )}

      {!basket.length ? (
        <p className="text-[13px] text-muted-foreground py-6 text-center leading-snug shrink-0">
          No items yet — enter quantities on Raise purchase request
        </p>
      ) : (
        <div className="flex-1 min-h-0 flex flex-col overflow-hidden border-t pt-2">
          <PoReviewLinesPanel
            kind="basket"
            lines={basket}
            editable={!readOnly}
            onQtyChange={readOnly ? undefined : onQtyChange}
            onPriceChange={readOnly ? undefined : onPriceChange}
            onDelete={readOnly ? undefined : onRemove}
            pageSize={8}
            compact
            sidebarVariant
            title="Draft purchase list"
          />
        </div>
      )}

      <div className="shrink-0 border-t pt-2 space-y-1 bg-card">
        <div className="flex justify-between items-center gap-2 min-w-0 text-[13px] text-muted-foreground">
          <span>Items</span>
          <span className="tabular-nums font-medium text-foreground">
            {basket.length}
          </span>
        </div>
        <div className="flex justify-between items-center gap-2 min-w-0 text-[15px] font-bold">
          <span className="shrink-0">Sum total</span>
          <span className="tabular-nums shrink-0 whitespace-nowrap text-right text-base">
            {formatNaira(total)}
          </span>
        </div>
      </div>

      {basket.length > 0 && (
        <div className="shrink-0 flex flex-wrap gap-2">
          <Button
            type="button"
            variant="outline"
            className="flex-1 min-w-[7rem] h-9 text-[13px] text-destructive border-destructive/30 hover:bg-destructive/5"
            onClick={onClear}
          >
            Clear basket
          </Button>
          {onSend && !readOnly && (
            <Button
              className="flex-1 min-w-[7rem] h-9 text-[13px]"
              onClick={onSend}
            >
              <Send className="h-3.5 w-3.5 mr-1.5" />
              {sendLabel}
            </Button>
          )}
        </div>
      )}
    </div>
  )
}
