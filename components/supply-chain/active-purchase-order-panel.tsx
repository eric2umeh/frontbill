'use client'

import { useEffect, useMemo } from 'react'
import { useSupplyChain } from '@/lib/supply-chain/supply-chain-context'
import {
  canDeleteStorePurchaseOrder,
  canEditStorePurchaseOrder,
  formatPoActorStamp,
  formatPoDecisionStamp,
  formatPoLinesEditStamp,
  isPurchaseOrderAwaitingAccountant,
  isPurchaseOrderDeleted,
  listKitchenOrdersAtStore,
  poOriginOf,
  showsStoreDraftPurchaseList,
} from '@/lib/supply-chain/po-active'
import { resolvePoDisplayStatus } from '@/lib/supply-chain/po-format'
import { useAuth } from '@/lib/auth-context'
import { canRaisePurchaseRequest } from '@/lib/permissions'
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
  const displayStatus = po ? resolvePoDisplayStatus(po) : undefined
  const canEdit = canEditStorePurchaseOrder(po)
  const canRaise = canRaisePurchaseRequest(role)
  const canDelete = canDeleteStorePurchaseOrder(po, role)
  const awaitingAccountant =
    displayStatus === 'pending_accountant' || isPurchaseOrderAwaitingAccountant(po)
  const showDraftList = showsStoreDraftPurchaseList(po)
  const isDraft = displayStatus === 'draft'
  const isRejected =
    displayStatus === 'accountant_rejected' || displayStatus === 'manager_rejected'
  const isPendingStore = displayStatus === 'pending_store'
  const linesEditable =
    canRaise &&
    canEdit &&
    !awaitingAccountant &&
    (isDraft || isRejected || isPendingStore)
  const kitchenInbox =
    kitchenOrdersAtStore ?? listKitchenOrdersAtStore(purchaseOrders ?? [])

  /** Store's own in-progress list — kept separate from kitchen inbox for concurrent work. */
  const storeDraftSibling = useMemo(() => {
    return (purchaseOrders ?? []).find(
      (p) =>
        !isPurchaseOrderDeleted(p) &&
        poOriginOf(p) === 'store' &&
        (p.status === 'draft' ||
          p.status === 'accountant_rejected' ||
          p.status === 'manager_rejected') &&
        p.lines.length > 0 &&
        p.id !== po?.id,
    )
  }, [purchaseOrders, po?.id])

  // Only auto-focus a kitchen inbox PO when it is already the active cart and the
  // basket is empty — never steal focus from a store draft that already has lines.
  useEffect(() => {
    if (!po) return
    if (po.origin !== 'kitchen') return
    if (!(isRejected || isPendingStore)) return
    if (!po.lines.length) return
    if (basket.length > 0) return
    selectWorkingPurchaseOrder?.(po.id)
  }, [
    po?.id,
    po?.origin,
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
        `${res.po.poNumber} sent — kitchen + store draft lines are combined for accountant review under Purchase Orders`,
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

  const approvedForMarket =
    displayStatus === 'approved' ||
    displayStatus === 'disbursed' ||
    displayStatus === 'retirement_pending' ||
    displayStatus === 'retirement_rejected'
  const retirementInReview = displayStatus === 'retirement_pending_accountant'
  const inApprovalPipeline =
    displayStatus === 'pending_accountant' || displayStatus === 'pending_manager'
  const decidedBy =
    po.managerDecidedBy ||
    po.accountantDecidedBy ||
    'Manager'

  const kitchenInboxBlock =
    kitchenInbox.length > 0 || storeDraftSibling ? (
      <div className="rounded-xl border border-violet-200 bg-violet-50/40 p-3 space-y-2">
        <p className="text-sm font-semibold text-violet-900">Kitchen orders awaiting store</p>
        <p className="text-xs text-muted-foreground">
          Kitchen lists stay listed here until you send. Send to accountant combines the open list
          with your store draft into one approval for the accountant.
        </p>
        {storeDraftSibling && poOriginOf(po) === 'kitchen' ? (
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-sky-200 bg-sky-50/60 px-3 py-2">
            <div className="min-w-0">
              <p className="text-sm font-medium">{storeDraftSibling.poNumber}</p>
              <p className="text-[13px] text-muted-foreground">Your store draft (in progress)</p>
            </div>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => {
                selectWorkingPurchaseOrder?.(storeDraftSibling.id)
                toast.success(`Back to ${storeDraftSibling.poNumber}`)
              }}
            >
              Back to store draft
            </Button>
          </div>
        ) : null}
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
                  <p className="text-[13px] text-muted-foreground">{formatPoActorStamp(kpo)}</p>
                  {formatPoLinesEditStamp(kpo) ? (
                    <p className="text-[12px] text-sky-800 dark:text-sky-200">
                      {formatPoLinesEditStamp(kpo)}
                    </p>
                  ) : null}
                  {decision ? (
                    <p className="text-xs text-red-700 mt-0.5">{decision}</p>
                  ) : null}
                  {isEditing ? (
                    <p className="text-[12px] font-medium text-violet-800 mt-0.5">
                      Open below for review
                    </p>
                  ) : null}
                </div>
                {!isEditing ? (
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      selectWorkingPurchaseOrder?.(kpo.id)
                      toast.success(`Opened ${kpo.poNumber} for editing`)
                    }}
                  >
                    Open & edit
                  </Button>
                ) : null}
              </li>
            )
          })}
        </ul>
      </div>
    ) : null

  if (!showDraftList) {
    return (
      <div className="space-y-3">
        {kitchenInboxBlock}
        {approvedForMarket || retirementInReview ? (
          <div className="rounded-lg border border-emerald-200 bg-emerald-50/70 dark:bg-emerald-950/30 px-3 py-2.5 space-y-1">
            <p className="text-sm font-semibold text-emerald-900 dark:text-emerald-100">
              {retirementInReview
                ? 'Retirement awaiting accountant review'
                : displayStatus === 'retirement_rejected'
                  ? 'Retirement rejected — adjust and retire again'
                  : `Approved by ${decidedBy} — ready for market`}
            </p>
            <p className="text-xs text-emerald-800/90 dark:text-emerald-200/90">
              {retirementInReview
                ? 'You cannot retire again until the accountant accepts or rejects this submission.'
                : displayStatus === 'retirement_rejected'
                  ? 'Fix the retirement and resubmit from Retirement.'
                  : 'Cash is disbursed. Add purchased items to stock from Retirement → Active.'}
            </p>
          </div>
        ) : inApprovalPipeline ? (
          <div className="rounded-lg border border-sky-200 bg-sky-50/70 dark:bg-sky-950/30 px-3 py-2.5 space-y-1">
            <p className="text-sm font-semibold text-sky-900 dark:text-sky-100">
              {displayStatus === 'pending_manager'
                ? 'Awaiting manager approval'
                : 'Awaiting accountant review'}
            </p>
            <p className="text-xs text-sky-800/90 dark:text-sky-200/90">
              This list has been sent for approval. Editing is locked until it is accepted or
              rejected.
            </p>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            This PO is in the approval pipeline — open Purchase Orders to track it.
          </p>
        )}
        <PoDetailCard
          po={po}
          defaultOpen
          action={
            retirementInReview ? (
              <Badge className="bg-violet-100 text-violet-900">
                Retirement in review
              </Badge>
            ) : approvedForMarket ? (
              <Button asChild variant="outline" size="sm">
                <Link href={`/supply/purchasing?po=${po.id}&tab=active`}>
                  {displayStatus === 'retirement_rejected'
                    ? 'Continue Add to stock'
                    : 'Add to stock'}
                </Link>
              </Button>
            ) : (
              <Button asChild variant="outline" size="sm">
                <Link href="/supply/purchase-orders?tab=approvals">Open approvals</Link>
              </Button>
            )
          }
        />
      </div>
    )
  }

  const showSend =
    canRaise &&
    canEdit &&
    basket.length > 0 &&
    !awaitingAccountant &&
    (isDraft || isRejected || isPendingStore)

  return (
    <div className="space-y-4">
      {kitchenInboxBlock}

    <div className="rounded-xl border overflow-hidden">
      <div className="border-b px-4 py-3 bg-muted/30 flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0 space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-sm font-medium">{po.poNumber} — purchase list</p>
            {poOriginOf(po) === 'kitchen' ? (
              <Badge variant="outline" className="text-xs bg-violet-50 text-violet-800">
                Kitchen order
              </Badge>
            ) : null}
            {poStatusBadge(po)}
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
        {stats.basketTotal > 0 ? (
          <p className="text-sm font-semibold tabular-nums">{formatNaira(stats.basketTotal)}</p>
        ) : null}
      </div>
      <p className="px-4 pt-2 text-[13px] text-muted-foreground">{formatPoActorStamp(po)}</p>
      {formatPoLinesEditStamp(po) ? (
        <p className="px-4 text-[12px] text-sky-800 dark:text-sky-200">
          {formatPoLinesEditStamp(po)}
        </p>
      ) : null}

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
            ? 'With accountant — quantities are locked until they accept or reject. Open Supply Chain → Purchase Orders to review.'
            : isPendingStore
              ? 'Kitchen order at store — review this draft list (same as Raise purchase), edit if needed, then Send to accountant.'
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
