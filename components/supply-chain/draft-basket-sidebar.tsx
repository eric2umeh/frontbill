'use client'

import { Button } from '@/components/ui/button'
import type { BasketLine } from '@/lib/supply-chain/types'
import { formatNaira } from '@/lib/utils/currency'
import { AlertTriangle, Send } from 'lucide-react'
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
  onSend,
  sendLabel = 'Send for approval',
  hideClear = false,
}: Props) {
  const zeroPriceItems = basket.filter((b) => !(Number(b.unitPrice) > 0))

  return (
    <div className="rounded-xl border bg-card p-3 h-fit lg:sticky lg:top-4 shadow-md flex flex-col gap-2.5 min-w-0 w-full">
      <div className="flex justify-between items-start gap-2 min-w-0">
        <div className="min-w-0">
          <h3 className="text-[15px] font-semibold leading-tight">Draft basket</h3>
          <p className="text-[13px] text-muted-foreground leading-snug">
            {readOnly
              ? 'Locked in this status'
              : basket.length > 10
                ? `${basket.length} items — search or use Prev/Next below to see all`
                : `${basket.length} item${basket.length === 1 ? '' : 's'} · dept totals below`}
          </p>
        </div>
        {!readOnly && !hideClear && basket.length > 0 && (
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

      {zeroPriceItems.length > 0 && (
        <div className="flex gap-2 rounded-md border border-sky-300 bg-sky-50 px-2.5 py-2 text-[12px] text-sky-950 dark:border-sky-700 dark:bg-sky-950/40 dark:text-sky-100">
          <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
          <div className="leading-snug min-w-0 space-y-1">
            <p>
              <span className="font-semibold">₦0 price</span>
              {' — '}
              set a unit price before sending if this is not intentional:
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
        <p className="text-[13px] text-muted-foreground py-6 text-center leading-snug">
          No items yet — enter quantities on Raise purchase request
        </p>
      ) : (
        <div className="flex flex-col min-h-0 max-h-[min(70vh,720px)]">
          <PoReviewLinesPanel
            kind="basket"
            lines={basket}
            editable={!readOnly}
            onQtyChange={readOnly ? undefined : onQtyChange}
            onDelete={readOnly ? undefined : onRemove}
            pageSize={10}
            compact
            sidebarVariant
            title="Draft purchase list"
          />
        </div>
      )}

      <div className="border-t pt-2 space-y-1">
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
