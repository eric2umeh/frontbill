'use client'

import { useEffect, useState } from 'react'
import type { BasketLine, PoLine } from '@/lib/supply-chain/types'
import { DEPT_LABELS } from '@/lib/supply-chain/types'
import { formatPoLineEditorStamp } from '@/lib/supply-chain/po-active'
import {
  formatUnitLabel,
  sanitizeQuantityInput,
  parseQuantityValue,
} from '@/lib/supply-chain/measurement-units'
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
import { Eye, AlertTriangle } from 'lucide-react'
import { cn } from '@/lib/utils'

const PO_QTY_INPUT_CLASS =
  'h-8 ml-auto text-right tabular-nums [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none'

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
  editable?: boolean
  onQtyChange?: (stockItemId: string, qty: number) => void
  onDelete?: (stockItemId: string) => void
}

type Props = {
  rows: BasketRow[] | PoRow[]
  showDept?: boolean
  compact?: boolean
}

function effectiveDraftQty(draft: string, committedQty: number): number {
  const trimmed = draft.trim()
  if (!trimmed) return committedQty
  const qty = parseQuantityValue(trimmed)
  return Number.isFinite(qty) && qty > 0 ? qty : committedQty
}

function QtyDraftInput({
  stockItemId,
  committedQty,
  unitPrice,
  onCommit,
  className,
  showTotal,
  compactInline,
}: {
  stockItemId: string
  committedQty: number
  unitPrice: number
  onCommit: (stockItemId: string, qty: number) => void
  className?: string
  showTotal?: boolean
  /** Keep qty + total as a tight inline group (basket single-row). */
  compactInline?: boolean
}) {
  const [draft, setDraft] = useState(String(committedQty))

  useEffect(() => {
    setDraft(String(committedQty))
  }, [committedQty, stockItemId])

  const commit = () => {
    const trimmed = draft.trim()
    if (!trimmed) {
      // Blank blur (dept switch / list remount) — keep the line, restore qty.
      setDraft(String(committedQty))
      return
    }
    const qty = parseQuantityValue(trimmed)
    if (!Number.isFinite(qty) || qty < 0) {
      setDraft(String(committedQty))
      return
    }
    if (qty === 0) {
      onCommit(stockItemId, 0)
      return
    }
    if (qty !== committedQty) onCommit(stockItemId, qty)
  }

  const liveQty = effectiveDraftQty(draft, committedQty)
  const liveTotal = liveQty * (Number.isFinite(unitPrice) ? unitPrice : 0)

  return (
    <div
      className={
        showTotal
          ? cn(
              'flex items-center gap-1.5 shrink-0',
              compactInline ? 'w-auto' : 'w-full min-w-0 justify-between',
            )
          : undefined
      }
    >
      <Input
        inputMode="decimal"
        min={0}
        className={className}
        value={draft}
        onChange={(e) => setDraft(sanitizeQuantityInput(e.target.value))}
        onBlur={(e) => {
          if (!e.currentTarget.isConnected) return
          commit()
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault()
            ;(e.target as HTMLInputElement).blur()
          }
        }}
      />
      {showTotal ? (
        <span
          className={cn(
            'font-medium tabular-nums shrink-0 text-right leading-none whitespace-nowrap',
            compactInline ? 'text-[12px] w-[4.25rem]' : 'text-[13px] pl-1',
          )}
        >
          {formatNaira(liveTotal)}
        </span>
      ) : null}
    </div>
  )
}

export function PoLinesTable({ rows, showDept = true, compact = false }: Props) {
  const [detailRow, setDetailRow] = useState<BasketRow | PoRow | null>(null)

  if (!rows.length) {
    return (
      <p className="text-sm text-muted-foreground py-6 text-center">No line items.</p>
    )
  }

  // Compact (sidebar cart): always use dense stacked rows so wide tables
  // never clip amounts in a ~300px column.
  if (compact) {
    return (
      <ul className="space-y-1.5">
        {rows.map((row) => {
          if (row.kind === 'basket') {
            const line = row.line
            const qty = line.qtyToBuy
            const total = line.qtyToBuy * line.unitPrice
            const stamp = formatPoLineEditorStamp(line)
            return (
              <li
                key={line.stockItemId}
                className="flex flex-col gap-0.5 rounded-md border px-2 py-1.5 min-w-0"
              >
                <div className="flex items-center gap-1.5 min-w-0">
                  <p className="min-w-0 flex-1 text-[12px] font-medium leading-none truncate">
                    {line.name}
                    <span className="text-muted-foreground font-normal">
                      {' '}
                      ({formatUnitLabel(line.unit)})
                    </span>
                  </p>
                  {row.editable && row.onQtyChange ? (
                    <QtyDraftInput
                      stockItemId={line.stockItemId}
                      committedQty={qty}
                      unitPrice={line.unitPrice}
                      onCommit={row.onQtyChange}
                      className={`h-7 w-12 shrink-0 text-[12px] ${PO_QTY_INPUT_CLASS}`}
                      showTotal
                      compactInline
                    />
                  ) : (
                    <>
                      <span className="text-[11px] text-muted-foreground tabular-nums shrink-0">
                        {qty}
                      </span>
                      <span className="text-[12px] font-medium tabular-nums shrink-0 whitespace-nowrap w-[4.25rem] text-right">
                        {formatNaira(total)}
                      </span>
                    </>
                  )}
                  {row.editable && row.onDelete ? (
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6 shrink-0 text-destructive"
                      onClick={() => row.onDelete!(line.stockItemId)}
                      aria-label={`Remove ${line.name}`}
                    >
                      ×
                    </Button>
                  ) : null}
                </div>
                {stamp ? (
                  <p className="text-[10px] text-sky-800 dark:text-sky-200 truncate leading-tight">
                    {stamp}
                  </p>
                ) : null}
              </li>
            )
          }

          const line = row.line
          const stamp = formatPoLineEditorStamp(line)
          const removed = line.notBought === true
          return (
            <li
              key={line.id}
              className={cn(
                'flex flex-col gap-0.5 rounded-md border px-2 py-1.5 min-w-0',
                removed && 'border-red-200 bg-red-50/70 dark:bg-red-950/20',
              )}
            >
              <div className="flex items-center gap-1.5 min-w-0">
                <p
                  className={cn(
                    'min-w-0 flex-1 text-[12px] font-medium leading-none truncate',
                    removed && 'line-through text-muted-foreground decoration-2',
                  )}
                >
                  {line.name}
                  <span className="text-muted-foreground font-normal">
                    {' '}
                    ({formatUnitLabel(line.unit)})
                  </span>
                </p>
                {row.editable && row.onQtyChange ? (
                  <QtyDraftInput
                    stockItemId={line.stockItemId}
                    committedQty={line.quantityOrdered}
                    unitPrice={line.unitPrice}
                    onCommit={row.onQtyChange}
                    className={`h-7 w-12 shrink-0 text-[12px] ${PO_QTY_INPUT_CLASS}`}
                    showTotal
                    compactInline
                  />
                ) : (
                  <>
                    <span
                      className={cn(
                        'text-[11px] text-muted-foreground tabular-nums shrink-0',
                        removed && 'line-through',
                      )}
                    >
                      {line.quantityOrdered}
                    </span>
                    <span
                      className={cn(
                        'text-[12px] font-medium tabular-nums shrink-0 whitespace-nowrap w-[4.25rem] text-right',
                        removed && 'line-through text-muted-foreground',
                      )}
                    >
                      {formatNaira(line.lineTotal)}
                    </span>
                  </>
                )}
                {row.editable && row.onDelete ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6 shrink-0 text-destructive"
                    onClick={() => row.onDelete!(line.stockItemId)}
                  >
                    ×
                  </Button>
                ) : null}
              </div>
              {stamp ? (
                <p className="text-[10px] text-sky-800 dark:text-sky-200 truncate leading-tight">
                  {stamp}
                </p>
              ) : null}
            </li>
          )
        })}
      </ul>
    )
  }

  return (
    <>
      <div className="md:hidden space-y-2">
        {rows.map((row) => {
          if (row.kind === 'basket') {
            const line = row.line
            const qty = line.qtyToBuy
            const total = line.qtyToBuy * line.unitPrice

            return (
              <div key={line.stockItemId} className="rounded-lg border p-2.5 text-[13px] space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-medium leading-snug truncate text-[13px]">
                      {line.name}{' '}
                      <span className="text-muted-foreground font-normal text-xs">
                        ({formatUnitLabel(line.unit)})
                      </span>
                    </p>
                    {line.storeUnit && line.storeUnit !== line.unit && (
                      <p className="text-xs text-muted-foreground">
                        Receives {line.storeQtyToBuy} {formatUnitLabel(line.storeUnit)}
                      </p>
                    )}
                  </div>
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
                <div className="flex items-center justify-between gap-2 min-w-0">
                  {row.editable && row.onQtyChange ? (
                    <QtyDraftInput
                      stockItemId={line.stockItemId}
                      committedQty={qty}
                      unitPrice={line.unitPrice}
                      onCommit={row.onQtyChange}
                      className={`w-20 ${PO_QTY_INPUT_CLASS}`}
                      showTotal
                    />
                  ) : (
                    <>
                      <span className="text-muted-foreground text-xs">
                        Qty: {qty} {formatUnitLabel(line.unit)}
                      </span>
                      <span className="font-medium tabular-nums shrink-0 whitespace-nowrap">
                        {formatNaira(total)}
                      </span>
                    </>
                  )}
                  {row.editable && row.onDelete && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-destructive shrink-0"
                      onClick={() => row.onDelete!(line.stockItemId)}
                    >
                      ×
                    </Button>
                  )}
                </div>
              </div>
            )
          }

          const line = row.line
          const removed = line.notBought === true
          return (
            <div
              key={line.id}
              className={cn(
                'rounded-lg border p-2.5 text-[13px] space-y-2',
                removed && 'border-red-200 bg-red-50/70 dark:bg-red-950/20',
              )}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p
                    className={cn(
                      'font-medium leading-snug text-[13px] truncate',
                      removed && 'line-through text-muted-foreground decoration-2',
                    )}
                  >
                    {line.name}{' '}
                    <span className="text-muted-foreground font-normal text-xs">
                      ({formatUnitLabel(line.unit)})
                    </span>
                  </p>
                  {removed ? (
                    <p className="text-[10px] text-red-800 font-medium mt-0.5">
                      Not bought / removed
                    </p>
                  ) : null}
                  {line.storeUnit && line.storeUnit !== line.unit && (
                    <p className="text-xs text-muted-foreground">
                      Receives {line.stockQuantityOrdered} {formatUnitLabel(line.storeUnit)}
                    </p>
                  )}
                </div>
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
              <div
                className={cn(
                  'flex items-center justify-between gap-2',
                  removed && 'line-through text-muted-foreground',
                )}
              >
                {row.editable && row.onQtyChange ? (
                  <QtyDraftInput
                    stockItemId={line.stockItemId}
                    committedQty={line.quantityOrdered}
                    unitPrice={line.unitPrice}
                    onCommit={row.onQtyChange}
                    className={`w-20 text-[13px] ${PO_QTY_INPUT_CLASS}`}
                    showTotal
                  />
                ) : (
                  <>
                    <span className="text-muted-foreground text-[13px]">
                      Qty: {line.quantityOrdered} {formatUnitLabel(line.unit)}
                    </span>
                    <span className="font-medium tabular-nums text-[13px] shrink-0 whitespace-nowrap">
                      {formatNaira(line.lineTotal)}
                    </span>
                  </>
                )}
                {row.editable && row.onDelete && (
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

      <table className="hidden md:table w-full text-[13px]">
        <thead>
          <tr className="border-b text-left text-muted-foreground text-[13px]">
            <th className="pb-2 font-medium">Item</th>
            {showDept && !compact && <th className="pb-2 font-medium">Dept</th>}
            <th className="pb-2 font-medium text-right">Qty</th>
            {!compact && <th className="pb-2 font-medium text-right">Unit price</th>}
            <th className="pb-2 font-medium text-right">Line total</th>
            {rows.some(
              (r) =>
                (r.kind === 'basket' || r.kind === 'po') &&
                r.editable &&
                r.onDelete,
            ) && <th className="pb-2 w-10" />}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            if (row.kind === 'basket') {
              const l = row.line
              return (
                <EditableBasketTableRow
                  key={l.stockItemId}
                  line={l}
                  showDept={showDept}
                  compact={compact}
                  editable={Boolean(row.editable && row.onQtyChange)}
                  onQtyChange={row.onQtyChange}
                  onDelete={row.onDelete}
                />
              )
            }
            const l = row.line
            return (
              <EditablePoTableRow
                key={l.id}
                line={l}
                showDept={showDept}
                compact={compact}
                editable={Boolean(row.editable && row.onQtyChange)}
                onQtyChange={row.onQtyChange}
                onDelete={row.onDelete}
              />
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
                <dd>{formatUnitLabel(detailRow.line.unit)}</dd>
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
              {detailRow.line.storeUnit && detailRow.line.storeUnit !== detailRow.line.unit && (
                <div className="flex justify-between gap-2">
                  <dt className="text-muted-foreground">Store receipt</dt>
                  <dd>
                    {detailRow.kind === 'basket'
                      ? detailRow.line.storeQtyToBuy
                      : detailRow.line.stockQuantityOrdered}{' '}
                    {formatUnitLabel(detailRow.line.storeUnit)}
                  </dd>
                </div>
              )}
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

function EditableBasketTableRow({
  line: l,
  showDept,
  compact,
  editable,
  onQtyChange,
  onDelete,
}: {
  line: BasketLine
  showDept: boolean
  compact: boolean
  editable: boolean
  onQtyChange?: (stockItemId: string, qty: number) => void
  onDelete?: (stockItemId: string) => void
}) {
  const [draft, setDraft] = useState(String(l.qtyToBuy))
  useEffect(() => {
    setDraft(String(l.qtyToBuy))
  }, [l.qtyToBuy, l.stockItemId])

  const commit = () => {
    const trimmed = draft.trim()
    if (!trimmed) {
      setDraft(String(l.qtyToBuy))
      return
    }
    const qty = parseQuantityValue(trimmed)
    if (!Number.isFinite(qty) || qty < 0) {
      setDraft(String(l.qtyToBuy))
      return
    }
    if (qty === 0) {
      onQtyChange?.(l.stockItemId, 0)
      return
    }
    if (qty !== l.qtyToBuy) onQtyChange?.(l.stockItemId, qty)
  }

  const liveQty = effectiveDraftQty(draft, l.qtyToBuy)
  const liveTotal = liveQty * (Number.isFinite(l.unitPrice) ? l.unitPrice : 0)
  const zeroPrice = !(Number(l.unitPrice) > 0)

  return (
    <tr className="border-b last:border-0 text-[13px]">
      <td className="py-2 pr-2 font-medium text-[13px]">
        <span className="inline-flex items-start gap-1.5">
          {zeroPrice && (
            <AlertTriangle
              className="h-3.5 w-3.5 shrink-0 mt-0.5 text-sky-700 dark:text-sky-300"
              aria-label="Unit price is ₦0"
            />
          )}
          <span>
            {l.name}{' '}
            <span className="text-muted-foreground font-normal text-xs">
              ({formatUnitLabel(l.unit)})
            </span>
            {l.storeUnit && l.storeUnit !== l.unit && (
              <span className="block text-xs text-muted-foreground font-normal">
                Receives {l.storeQtyToBuy} {formatUnitLabel(l.storeUnit)}
              </span>
            )}
          </span>
        </span>
      </td>
      {showDept && !compact && (
        <td className="py-2">
          <Badge variant="outline" className="text-xs">
            {DEPT_LABELS[l.dept]}
          </Badge>
        </td>
      )}
      <td className="py-2 text-right">
        {editable && onQtyChange ? (
          <Input
            inputMode="decimal"
            min={0}
            className={`w-16 text-[13px] ${PO_QTY_INPUT_CLASS}`}
            value={draft}
            onChange={(e) => setDraft(sanitizeQuantityInput(e.target.value))}
            onBlur={(e) => {
              if (!e.currentTarget.isConnected) return
              commit()
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                ;(e.target as HTMLInputElement).blur()
              }
            }}
          />
        ) : (
          <span className="tabular-nums text-[13px]">
            {l.qtyToBuy} {formatUnitLabel(l.unit)}
          </span>
        )}
      </td>
      {!compact && (
        <td
          className={cn(
            'py-2 text-right tabular-nums text-[13px]',
            zeroPrice && 'font-semibold text-sky-800 dark:text-sky-200',
          )}
        >
          <span className="inline-flex flex-wrap items-baseline justify-end gap-x-1.5 gap-y-0.5">
            <span>{formatNaira(l.unitPrice)}</span>
            {zeroPrice && (
              <span className="text-[10px] font-medium text-sky-800 dark:text-sky-200 whitespace-nowrap">
                Warning: ₦0 unit price
              </span>
            )}
          </span>
        </td>
      )}
      <td className="py-2 text-right tabular-nums font-medium text-[13px] whitespace-nowrap">
        {formatNaira(liveTotal)}
      </td>
      {editable && onDelete && (
        <td className="py-2 text-right">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-7 w-7 text-destructive"
            onClick={() => onDelete(l.stockItemId)}
          >
            ×
          </Button>
        </td>
      )}
    </tr>
  )
}

function EditablePoTableRow({
  line: l,
  showDept,
  compact,
  editable,
  onQtyChange,
  onDelete,
}: {
  line: PoLine
  showDept: boolean
  compact: boolean
  editable: boolean
  onQtyChange?: (stockItemId: string, qty: number) => void
  onDelete?: (stockItemId: string) => void
}) {
  const [draft, setDraft] = useState(String(l.quantityOrdered))
  useEffect(() => {
    setDraft(String(l.quantityOrdered))
  }, [l.quantityOrdered, l.stockItemId])

  const commit = () => {
    const trimmed = draft.trim()
    if (!trimmed) {
      setDraft(String(l.quantityOrdered))
      return
    }
    const qty = parseQuantityValue(trimmed)
    if (!Number.isFinite(qty) || qty < 0) {
      setDraft(String(l.quantityOrdered))
      return
    }
    if (qty === 0) {
      onQtyChange?.(l.stockItemId, 0)
      return
    }
    if (qty !== l.quantityOrdered) onQtyChange?.(l.stockItemId, qty)
  }

  const liveQty = effectiveDraftQty(draft, l.quantityOrdered)
  const liveTotal = liveQty * (Number.isFinite(l.unitPrice) ? l.unitPrice : 0)
  const zeroPrice = !(Number(l.unitPrice) > 0)
  const removed = l.notBought === true

  return (
    <tr
      className={cn(
        'border-b last:border-0 text-[13px]',
        removed && 'bg-red-50/70 dark:bg-red-950/20',
      )}
    >
      <td
        className={cn(
          'py-2 pr-2 font-medium text-[13px]',
          removed && 'line-through text-muted-foreground decoration-2',
        )}
      >
        <span className="inline-flex items-start gap-1.5">
          {zeroPrice && !removed && (
            <AlertTriangle
              className="h-3.5 w-3.5 shrink-0 mt-0.5 text-sky-700 dark:text-sky-300"
              aria-label="Unit price is ₦0"
            />
          )}
          <span>
            {l.name}{' '}
            <span className="text-muted-foreground font-normal text-xs">
              ({formatUnitLabel(l.unit)})
            </span>
            {removed ? (
              <span className="block text-[10px] text-red-800 font-medium no-underline mt-0.5">
                Not bought / removed
              </span>
            ) : null}
            {l.storeUnit && l.storeUnit !== l.unit && (
              <span className="block text-xs text-muted-foreground font-normal">
                Receives {l.stockQuantityOrdered} {formatUnitLabel(l.storeUnit)}
              </span>
            )}
            {formatPoLineEditorStamp(l) ? (
              <span className="block text-[10px] text-sky-800 dark:text-sky-200 font-normal mt-0.5">
                {formatPoLineEditorStamp(l)}
              </span>
            ) : null}
          </span>
        </span>
      </td>
      {showDept && !compact && (
        <td className={cn('py-2', removed && 'line-through text-muted-foreground')}>
          <Badge variant="outline" className="text-xs">
            {DEPT_LABELS[l.dept]}
          </Badge>
        </td>
      )}
      <td
        className={cn(
          'py-2 text-right',
          removed && 'line-through text-muted-foreground',
        )}
      >
        {editable && onQtyChange ? (
          <Input
            inputMode="decimal"
            min={0}
            className={`w-16 text-[13px] ${PO_QTY_INPUT_CLASS}`}
            value={draft}
            onChange={(e) => setDraft(sanitizeQuantityInput(e.target.value))}
            onBlur={(e) => {
              if (!e.currentTarget.isConnected) return
              commit()
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                ;(e.target as HTMLInputElement).blur()
              }
            }}
          />
        ) : (
          <span className="tabular-nums text-[13px]">
            {l.quantityOrdered} {formatUnitLabel(l.unit)}
          </span>
        )}
      </td>
      {!compact && (
        <td
          className={cn(
            'py-2 text-right tabular-nums text-[13px]',
            zeroPrice && 'font-semibold text-sky-800 dark:text-sky-200',
          )}
        >
          <span className="inline-flex flex-wrap items-baseline justify-end gap-x-1.5 gap-y-0.5">
            <span>{formatNaira(l.unitPrice)}</span>
            {zeroPrice && (
              <span className="text-[10px] font-medium text-sky-800 dark:text-sky-200 whitespace-nowrap">
                Warning: ₦0 unit price
              </span>
            )}
          </span>
        </td>
      )}
      <td className="py-2 text-right tabular-nums font-medium text-[13px] whitespace-nowrap">
        {formatNaira(liveTotal)}
      </td>
      {editable && onDelete && (
        <td className="py-2 text-right">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-7 w-7 text-destructive"
            onClick={() => onDelete(l.stockItemId)}
          >
            ×
          </Button>
        </td>
      )}
    </tr>
  )
}
