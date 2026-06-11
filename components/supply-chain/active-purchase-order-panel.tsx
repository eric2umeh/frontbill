'use client'

import { useSupplyChain } from '@/lib/supply-chain/supply-chain-context'
import {
  canDeleteStorePurchaseOrder,
  canEditStorePurchaseOrder,
  isPurchaseOrderAwaitingAccountant,
  showsStoreDraftPurchaseList,
} from '@/lib/supply-chain/po-active'
import { formatNaira } from '@/lib/utils/currency'
import { Button } from '@/components/ui/button'
import { PoLinesTable } from '@/components/supply-chain/po-lines-table'
import { PoDetailCard } from '@/components/supply-chain/po-detail-card'
import { PoCommentBanner } from '@/components/supply-chain/po-comment-banner'
import { poStatusBadge } from '@/components/supply-chain/po-approval-panel'
import { toast } from 'sonner'
import { Send, Trash2 } from 'lucide-react'
import Link from 'next/link'
import type { StoreItem } from '@/lib/supply-chain/types'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog'

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
    removeFromBasket,
    sendBasketForApproval,
    deleteActivePurchaseOrder,
  } = useSupplyChain()

  const po = activePurchaseOrder
  const canEdit = canEditStorePurchaseOrder(po)
  const canDelete = canDeleteStorePurchaseOrder(po)
  const awaitingAccountant = isPurchaseOrderAwaitingAccountant(po)
  const showDraftList = showsStoreDraftPurchaseList(po)
  const isDraft = po?.status === 'draft'
  const isRejected = po?.status === 'accountant_rejected'
  const linesEditable = canEdit && (isDraft || isRejected)

  const handleSend = () => {
    const res = sendBasketForApproval(actor)
    if ('error' in res) toast.error(res.error)
    else {
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

  const handleDeletePo = () => {
    const res = deleteActivePurchaseOrder(actor)
    if ('error' in res) toast.error(res.error)
    else toast.success('Purchase order deleted')
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
            ['approved', 'disbursed', 'retirement_pending', 'retirement_rejected'].includes(
              po.status,
            ) ? (
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
  const displayRows = basket.map((line) => ({
    kind: 'basket' as const,
    line,
    editable: linesEditable,
    onQtyChange: linesEditable ? handleQtyChange : undefined,
    onDelete: linesEditable ? (id: string) => handleQtyChange(id, 0) : undefined,
  }))

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
        <div className="p-3 border-b">
          <PoCommentBanner
            label="Accountant rejection"
            comment={po.accountantComment}
            variant="reject"
            compact
          />
        </div>
      )}

      {basket.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-8 px-4">
          No line items — add quantities on Raise purchase request.
        </p>
      ) : (
        <div className="p-3">
          <PoLinesTable rows={displayRows} compact showDept={false} />
        </div>
      )}

      <div className="border-t px-4 py-3 flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs text-muted-foreground max-w-xl">
          {awaitingAccountant
            ? 'Sent to accountant — list stays visible until approved. Editing is locked while under review.'
            : isDraft
              ? 'Adjust quantities here or on Raise purchase request, then send to accountant.'
              : isRejected
                ? 'Accountant rejected — edit quantities directly, then send again.'
                : 'Update lines, then send to accountant again.'}
        </p>
        <div className="flex flex-wrap gap-2">
          {canDelete && (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button type="button" variant="outline" size="sm" className="text-destructive">
                  <Trash2 className="h-3.5 w-3.5 mr-1" />
                  Delete PO
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Delete this purchase order?</AlertDialogTitle>
                  <AlertDialogDescription>
                    This removes all lines and data for {po.poNumber}. You can start a fresh PO from
                    Raise purchase request.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction
                    className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                    onClick={handleDeletePo}
                  >
                    Delete entire PO
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
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
