'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useSupplyChain } from '@/lib/supply-chain/supply-chain-context'
import {
  canEditStorePurchaseOrder,
  isPurchaseOrderAwaitingAccountant,
  showsStoreDraftPurchaseList,
} from '@/lib/supply-chain/po-active'
import { formatNaira } from '@/lib/utils/currency'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { PoLinesTable } from '@/components/supply-chain/po-lines-table'
import { PoDetailCard } from '@/components/supply-chain/po-detail-card'
import { poStatusBadge } from '@/components/supply-chain/po-approval-panel'
import { toast } from 'sonner'
import { Pencil, Send } from 'lucide-react'
import type { StoreItem } from '@/lib/supply-chain/types'

type Props = {
  actor: { name: string; role: string }
  storeItems: StoreItem[]
}

export function ActivePurchaseOrderPanel({ actor, storeItems }: Props) {
  const {
    activePurchaseOrder,
    basket,
    stats,
    setBasketLineQty,
    sendBasketForApproval,
  } = useSupplyChain()
  const [editMode, setEditMode] = useState(false)

  const po = activePurchaseOrder
  const canEdit = canEditStorePurchaseOrder(po)
  const awaitingAccountant = isPurchaseOrderAwaitingAccountant(po)
  const showDraftList = showsStoreDraftPurchaseList(po)
  const isDraft = po?.status === 'draft'
  const isRejected = po?.status === 'accountant_rejected'
  const linesEditable = canEdit && (isDraft || (isRejected && editMode))

  const handleEditClick = () => {
    if (awaitingAccountant) {
      toast.error('Cannot edit — accountant is reviewing this purchase order.')
      return
    }
    if (isRejected) setEditMode((v) => !v)
  }

  const handleSend = () => {
    const res = sendBasketForApproval(actor)
    if ('error' in res) toast.error(res.error)
    else {
      setEditMode(false)
      toast.success(
        `${res.po.poNumber} sent — open Accounting → Purchase orders to approve`,
      )
    }
  }

  const handleQtyChange = (stockItemId: string, qty: number) => {
    const item = storeItems.find((s) => s.id === stockItemId)
    if (!item) return
    const err = setBasketLineQty(item, qty, item.lastPrice, actor)
    if (err) toast.error(err)
  }

  if (!po) {
    return (
      <div className="rounded-xl border overflow-hidden min-h-[200px]">
        <p className="text-sm text-muted-foreground text-center py-12 px-4">
          No active purchase order — add quantities on Raise purchase request. Only one PO can be
          open at a time until it is retired.
        </p>
      </div>
    )
  }

  if (!showDraftList) {
    return (
      <div className="space-y-3">
        <p className="text-sm text-muted-foreground">
          Accountant accepted this PO — it is with the manager or at market until retired.
        </p>
        <PoDetailCard
          po={po}
          defaultOpen
          action={
            ['approved', 'disbursed', 'retirement_pending'].includes(po.status) ? (
              <Button asChild variant="outline" size="sm">
                <Link href={`/supply/purchasing?po=${po.id}`}>Retire at market</Link>
              </Button>
            ) : (
              <Button asChild variant="outline" size="sm">
                <Link href="/expenses?tab=purchase_orders">Open in Accounting</Link>
              </Button>
            )
          }
        />
      </div>
    )
  }

  const showSend = canEdit && basket.length > 0 && !awaitingAccountant
  const showEditButton = isRejected || awaitingAccountant
  const displayRows = basket.map((line) => ({ kind: 'basket' as const, line }))

  return (
    <div className="rounded-xl border overflow-hidden">
      <div className="border-b px-4 py-3 bg-muted/30 flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-sm font-medium">{po.poNumber} — purchase list</p>
          {poStatusBadge(po.status)}
        </div>
        <p className="text-sm font-semibold tabular-nums">{formatNaira(stats.basketTotal)}</p>
      </div>

      {po.accountantComment && isRejected && (
        <p className="text-xs text-red-700 bg-red-50 border-b border-red-100 px-4 py-2">
          Accountant: {po.accountantComment}
        </p>
      )}

      {basket.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-8 px-4">
          No line items — add quantities on Raise purchase request.
        </p>
      ) : linesEditable ? (
        <div className="p-3">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-muted-foreground">
                <th className="pb-2 font-medium">Item</th>
                <th className="pb-2 font-medium text-right">Qty</th>
                <th className="pb-2 font-medium text-right">Unit</th>
                <th className="pb-2 font-medium text-right">Line total</th>
              </tr>
            </thead>
            <tbody>
              {basket.map((line) => (
                <tr key={line.stockItemId} className="border-b last:border-0">
                  <td className="py-2 pr-2">
                    {line.name}{' '}
                    <span className="text-muted-foreground">({line.unit})</span>
                  </td>
                  <td className="py-2 text-right">
                    <Input
                      type="number"
                      min={0}
                      className="h-8 w-20 ml-auto text-right"
                      value={line.qtyToBuy}
                      onChange={(e) =>
                        handleQtyChange(line.stockItemId, Number(e.target.value) || 0)
                      }
                    />
                  </td>
                  <td className="py-2 text-right tabular-nums text-muted-foreground">
                    {formatNaira(line.unitPrice)}
                  </td>
                  <td className="py-2 text-right tabular-nums font-medium">
                    {formatNaira(line.qtyToBuy * line.unitPrice)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="p-3">
          <PoLinesTable rows={displayRows} />
        </div>
      )}

      <div className="border-t px-4 py-3 flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs text-muted-foreground max-w-xl">
          {awaitingAccountant
            ? 'Sent to accountant — list stays visible until approved. Editing is locked while under review.'
            : isDraft
              ? 'Adjust quantities here or on Raise purchase request, then send to accountant.'
              : isRejected && !editMode
                ? 'Accountant rejected this PO — click Edit to change lines, then send again.'
                : 'Update lines, then send to accountant again.'}
        </p>
        <div className="flex flex-wrap gap-2">
          {showEditButton && (
            <Button type="button" variant="outline" size="sm" onClick={handleEditClick}>
              <Pencil className="h-3.5 w-3.5 mr-1" />
              {isRejected && editMode ? 'Done editing' : 'Edit'}
            </Button>
          )}
          {showSend && (
            <Button type="button" size="sm" onClick={handleSend}>
              <Send className="h-3.5 w-3.5 mr-1" />
              Send to accountant
            </Button>
          )}
        </div>
      </div>
    </div>
  )
}
