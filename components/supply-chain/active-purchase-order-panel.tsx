'use client'

import { useEffect } from 'react'
import { useSupplyChain } from '@/lib/supply-chain/supply-chain-context'
import {
  canDeleteStorePurchaseOrder,
  canEditStorePurchaseOrder,
  formatPoActorStamp,
  formatPoDecisionStamp,
  isPurchaseOrderAwaitingAccountant,
  listKitchenOrdersAtStore,
  poOriginOf,
  showsStoreDraftPurchaseList,
} from '@/lib/supply-chain/po-active'
import { useAuth } from '@/lib/auth-context'
import { Badge } from '@/components/ui/badge'
import { formatNaira } from '@/lib/utils/currency'
import { Button } from '@/components/ui/button'
import { PoReviewLinesPanel } from '@/components/supply-chain/po-review-lines-panel'
import { PoDetailCard } from '@/components/supply-chain/po-detail-card'
import { PoCommentBanner } from '@/components/supply-chain/po-comment-banner'
import { poStatusBadge } from '@/components/supply-chain/po-approval-panel'
import { toast } from 'sonner'
import { Send, Trash2 } from 'lucide-react'
import Link from 'next/link'
import type { StoreItem } from '@/lib/supply-chain/types'
import { playNotificationBeep } from '@/lib/utils/play-notification-beep'
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
  const { role } = useAuth()
  const {
    activePurchaseOrder,
    purchaseOrders,
    basket,
    stats,
    setBasketLineQty,
    removeFromBasket,
    sendBasketForApproval,
    deleteActivePurchaseOrder,
    selectWorkingPurchaseOrder,
    kitchenOrdersAtStore,
  } = useSupplyChain()

  const po = activePurchaseOrder
  const canEdit = canEditStorePurchaseOrder(po)
  const canDelete = canDeleteStorePurchaseOrder(po, role)
  const awaitingAccountant = isPurchaseOrderAwaitingAccountant(po)
  const showDraftList = showsStoreDraftPurchaseList(po)
  const isDraft = po?.status === 'draft'
  const isRejected =
    po?.status === 'accountant_rejected' || po?.status === 'manager_rejected'
  const isPendingStore = po?.status === 'pending_store'
  const linesEditable =
    canEdit &&
    !awaitingAccountant &&
    (isDraft || isRejected || isPendingStore)
  const kitchenInbox =
    kitchenOrdersAtStore ?? listKitchenOrdersAtStore(purchaseOrders ?? [])

  // Rejected / store-review kitchen POs must load lines into the cart for editing.
  useEffect(() => {
    if (!po) return
    if (!(isRejected || isPendingStore)) return
    if (!po.lines.length) return
    if (basket.length > 0) return
    selectWorkingPurchaseOrder?.(po.id)
  }, [
    po?.id,
    po?.status,
    po?.lines?.length,
    basket.length,
    isRejected,
    isPendingStore,
    selectWorkingPurchaseOrder,
  ])

  const handleSend = () => {
    const res = sendBasketForApproval(actor)
    if ('error' in res) toast.error(res.error)
    else {
      playNotificationBeep()
      toast.success(
        `${res.po.poNumber} sent — accountant reviews in Expenses → Purchase orders`,
      )
    }
  }

  const handleQtyChange = (stockItemId: string, qty: number) => {
    const item = storeItems.find((s) => s.id === stockItemId)
    if (!item) return
    const existing = basket.find((line) => line.stockItemId === stockItemId)
    const poLine = po?.lines.find((l) => l.stockItemId === stockItemId)
    const storeQty =
      existing?.storeQtyToBuy && existing.qtyToBuy > 0
        ? (qty / existing.qtyToBuy) * existing.storeQtyToBuy
        : poLine?.stockQuantityOrdered && poLine.quantityOrdered > 0
          ? (qty / poLine.quantityOrdered) * poLine.stockQuantityOrdered
          : qty
    const unitPrice =
      (existing?.unitPrice && existing.unitPrice > 0
        ? existing.unitPrice
        : undefined) ??
      (poLine?.unitPrice && poLine.unitPrice > 0 ? poLine.unitPrice : undefined) ??
      (item.lastPrice > 0 ? item.lastPrice : 0)
    const storeUnitPrice =
      (existing?.storeUnitPrice && existing.storeUnitPrice > 0
        ? existing.storeUnitPrice
        : undefined) ??
      (poLine?.stockUnitPrice && poLine.stockUnitPrice > 0
        ? poLine.stockUnitPrice
        : undefined) ??
      (storeQty > 0 && unitPrice > 0 ? (qty * unitPrice) / storeQty : item.lastPrice)
    const err = setBasketLineQty(item, storeQty, storeUnitPrice, actor, {
      purchaseUnit: existing?.unit ?? poLine?.unit ?? item.unit,
      purchaseQty: qty,
      purchaseUnitPrice: unitPrice,
      storeQty,
      storeUnitPrice,
    })
    if (err) toast.error(err)
  }

  const handleRemoveLine = (stockItemId: string) => {
    const res = removeFromBasket(stockItemId)
    if (res && typeof res === 'object' && 'error' in res) toast.error(String(res.error))
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

  const showSend =
    canEdit &&
    basket.length > 0 &&
    !awaitingAccountant &&
    (isDraft || isRejected || isPendingStore)

  return (
    <div className="space-y-4">
      {kitchenInbox.length > 0 && (
        <div className="rounded-xl border border-violet-200 bg-violet-50/40 p-3 space-y-2">
          <p className="text-sm font-semibold text-violet-900">Kitchen orders awaiting store</p>
          <p className="text-xs text-muted-foreground">
            Open a kitchen list to edit (same cart UX), add store lines if needed, then send to
            accountant.
          </p>
          <ul className="space-y-2">
            {kitchenInbox.map((kpo) => {
              const isEditing = po?.id === kpo.id
              const decision = formatPoDecisionStamp(kpo)
              return (
              <li
                key={kpo.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-md border bg-background px-3 py-2"
              >
                <div className="min-w-0">
                  <p className="text-sm font-medium">{kpo.poNumber}</p>
                  <p className="text-xs text-muted-foreground">{formatPoActorStamp(kpo)}</p>
                  {decision ? (
                    <p className="text-xs text-red-700 mt-0.5">{decision}</p>
                  ) : null}
                </div>
                <Button
                  type="button"
                  size="sm"
                  variant={isEditing ? 'default' : 'outline'}
                  onClick={() => {
                    // Always focus + reload basket (toggle-to-null was a no-op for rejected POs).
                    selectWorkingPurchaseOrder?.(kpo.id)
                    if (isEditing) {
                      toast.message('This list is open for editing below')
                    } else {
                      toast.success(`Opened ${kpo.poNumber} for editing`)
                    }
                  }}
                >
                  {isEditing ? 'Editing' : 'Open & edit'}
                </Button>
              </li>
              )
            })}
          </ul>
        </div>
      )}

    <div className="rounded-xl border overflow-hidden">
      <div className="border-b px-4 py-3 bg-muted/30 flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0 space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-sm font-medium">{po.poNumber} — purchase list</p>
            {poOriginOf(po) === 'kitchen' ? (
              <Badge variant="outline" className="text-[10px] bg-violet-50 text-violet-800">
                Kitchen order
              </Badge>
            ) : null}
            {poStatusBadge(po.status)}
          </div>
          {formatPoDecisionStamp(po) ? (
            <p
              className={
                isRejected
                  ? 'text-xs text-red-700 font-medium'
                  : 'text-xs text-emerald-800 font-medium'
              }
            >
              {formatPoDecisionStamp(po)}
            </p>
          ) : null}
        </div>
        <p className="text-sm font-semibold tabular-nums">{formatNaira(stats.basketTotal)}</p>
      </div>
      <p className="px-4 pt-2 text-xs text-muted-foreground">{formatPoActorStamp(po)}</p>

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
          <PoReviewLinesPanel
            kind="basket"
            lines={basket}
            editable={linesEditable}
            onQtyChange={linesEditable ? handleQtyChange : undefined}
            onDelete={linesEditable ? handleRemoveLine : undefined}
            compact
            showDept
            pageSize={10}
            title={`Draft lines (${basket.length} · ${formatNaira(stats.basketTotal)})`}
          />
        </div>
      )}

      <div className="border-t px-4 py-3 flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs text-muted-foreground max-w-xl">
          {awaitingAccountant
            ? 'With accountant — quantities are locked until they accept or reject. Open Expenses → Purchase orders to review.'
            : isPendingStore
              ? 'Kitchen order at store — edit or add lines, then send to accountant.'
              : isDraft
                ? 'Adjust quantities here or on Raise purchase request, then send to accountant.'
                : isRejected
                  ? 'Rejected — edit quantities directly, then send again.'
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
    </div>
  )
}
