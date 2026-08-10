'use client'

import { useEffect, useMemo, useState } from 'react'
import { useAuth } from '@/lib/auth-context'
import { useSupplyChain } from '@/lib/supply-chain/supply-chain-context'
import { formatNaira } from '@/lib/utils/currency'
import { storeItemMatchesDept, type BasketLine, type StoreItem } from '@/lib/supply-chain/types'
import {
  defaultUnitForStoreItem,
  formatUnitLabel,
  isCompleteQuantityInput,
  parseQuantityValue,
  sanitizeQuantityInput,
  unitOptionsForStoreItem,
} from '@/lib/supply-chain/measurement-units'
import { purchaseUnitPriceFromStorePrice } from '@/lib/supply-chain/purchase-unit-pricing'
import {
  convertToStoreUnitsWithFactors,
  mergeUnitFactors,
} from '@/lib/supply-chain/unit-factor-storage'
import { DraftBasketSidebar } from '@/components/supply-chain/draft-basket-sidebar'
import { PoReviewLinesPanel } from '@/components/supply-chain/po-review-lines-panel'
import { PoCommentBanner } from '@/components/supply-chain/po-comment-banner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { PaginatedListShell } from '@/components/shared/paginated-list-shell'
import { UnitSelect } from '@/components/supply-chain/unit-select'
import { toast } from 'sonner'
import { playNotificationBeep } from '@/lib/utils/play-notification-beep'
import {
  canMutatePurchaseOrder,
  formatPoDecisionStamp,
  poOriginOf,
} from '@/lib/supply-chain/po-active'

function unitLabel(u: string) {
  return formatUnitLabel(u)
}

export function KitchenPurchasePanel() {
  const { name, role } = useAuth()
  const {
    storeItems,
    basket,
    activePurchaseOrder,
    setBasketLineQty,
    removeFromBasket,
    clearBasket,
    sendKitchenOrderToStore,
    setPurchaseWorkspaceOrigin,
    stats,
  } = useSupplyChain()

  const actor = { name: name ?? 'Chef', role: role ?? 'chef' }

  useEffect(() => {
    setPurchaseWorkspaceOrigin('kitchen')
    return () => setPurchaseWorkspaceOrigin('store')
  }, [setPurchaseWorkspaceOrigin])

  const [qtyMap, setQtyMap] = useState<Record<string, string>>({})
  const [purchaseUnitMap, setPurchaseUnitMap] = useState<Record<string, string>>({})
  const [purchasePriceMap, setPurchasePriceMap] = useState<Record<string, string>>({})

  const kitchenItems = useMemo(
    () => storeItems.filter((i) => storeItemMatchesDept(i, 'kitchen')),
    [storeItems],
  )

  const basketByDept = useMemo(() => {
    const m = new Map<string, BasketLine[]>()
    for (const l of basket) {
      if (!m.has(l.dept)) m.set(l.dept, [])
      m.get(l.dept)!.push(l)
    }
    return m
  }, [basket])

  const po = activePurchaseOrder
  const canEdit = canMutatePurchaseOrder(po, role)
  const isRejected = po?.status === 'accountant_rejected'
  const awaitingStore = po?.status === 'pending_store'
  const locked = Boolean(po && !canEdit)

  const factorsFor = (item: StoreItem) =>
    mergeUnitFactors(item.id, item.unit, item.unitFactors)

  const toStoreQty = (item: StoreItem, qty: number, unit: string) =>
    convertToStoreUnitsWithFactors(qty, unit, item.unit, factorsFor(item))

  const commitQty = (item: StoreItem, raw: string, unitOverride?: string) => {
    if (locked) {
      toast.error('This kitchen order is locked until store or accountant returns it.')
      return
    }
    const trimmed = raw.trim()
    const purchaseUnit = unitOverride ?? purchaseUnitMap[item.id] ?? defaultUnitForStoreItem(item.unit)
    if (!trimmed || parseQuantityValue(trimmed) <= 0) {
      // Empty / zero qty removes the line so the shopping cart stays in sync.
      const res = removeFromBasket(item.id)
      if (res && typeof res === 'object' && 'error' in res) toast.error(String(res.error))
      else {
        setQtyMap((m) => {
          const next = { ...m }
          delete next[item.id]
          return next
        })
      }
      return
    }
    const qty = parseQuantityValue(trimmed)
    const storeQty = toStoreQty(item, qty, purchaseUnit)
    if (storeQty == null) {
      toast.error(
        `Set pack size for ${item.name} (${unitLabel(purchaseUnit)} per ${unitLabel(item.unit)})`,
      )
      return
    }
    const defaultPurchasePrice = purchaseUnitPriceFromStorePrice(
      item.lastPrice,
      purchaseUnit,
      item.unit,
      factorsFor(item),
    )
    const purchaseUnitPrice =
      Number(purchasePriceMap[item.id]) > 0
        ? Number(purchasePriceMap[item.id])
        : defaultPurchasePrice
    const err = setBasketLineQty(item, storeQty, item.lastPrice, actor, {
      purchaseUnit,
      purchaseQty: qty,
      purchaseUnitPrice,
      storeQty,
      storeUnitPrice: item.lastPrice,
    })
    if (err) toast.error(err)
  }

  const handleSendToStore = () => {
    const res = sendKitchenOrderToStore(actor)
    if ('error' in res) toast.error(res.error)
    else {
      playNotificationBeep()
      toast.success(`${res.po.poNumber} sent to store as a kitchen order`)
    }
  }

  return (
    <div className="grid lg:grid-cols-[1fr_320px] gap-4">
      <div className="space-y-3">
        <div className="rounded-lg border border-violet-200 bg-violet-50/50 dark:bg-violet-950/20 p-3 text-sm">
          <p className="font-medium text-violet-900 dark:text-violet-100">
            Raise kitchen purchase order
          </p>
          <p className="text-xs text-muted-foreground mt-1">
            Shopping cart of kitchen catalogue items. Send to Central Store — they can edit/add
            lines, then send to the accountant. Accountant rejection returns the list to store
            (you are notified too).
          </p>
        </div>

        {isRejected && po?.accountantComment ? (
          <PoCommentBanner
            label="Accountant rejected — edit and resend to store"
            comment={po.accountantComment}
            variant="reject"
          />
        ) : null}

        {awaitingStore ? (
          <p className="text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-md px-3 py-2">
            This kitchen order is with the store for review.
          </p>
        ) : null}

        {po && poOriginOf(po) === 'kitchen' && po.lines.length > 0 ? (
          <div className="rounded-lg border p-3 space-y-2">
            <div className="space-y-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-medium text-sm">{po.poNumber}</span>
                <Badge variant="outline" className="text-xs bg-violet-50 text-violet-800">
                  Kitchen order
                </Badge>
                <span className="text-xs text-muted-foreground">
                  {po.createdByName} ·{' '}
                  {new Date(po.createdAt).toLocaleString('en-GB', {
                    day: '2-digit',
                    month: 'short',
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </span>
              </div>
              {formatPoDecisionStamp(po) ? (
                <p className="text-xs font-medium text-red-700">{formatPoDecisionStamp(po)}</p>
              ) : null}
            </div>
            <PoReviewLinesPanel
              lines={po.lines}
              pageSize={10}
              showDept
              title={`Kitchen list (${po.lines.length} items)`}
            />
          </div>
        ) : null}

        {!locked ? (
          <PaginatedListShell
            items={kitchenItems}
            pageSize={40}
            searchPlaceholder="Search kitchen store items…"
            searchMatch={(item, q) =>
              `${item.name} ${item.unit}`.toLowerCase().includes(q.toLowerCase())
            }
            emptyMessage="No kitchen catalogue items. Ask store to add kitchen stock items."
          >
            {(pageItems) => (
              <div className="space-y-2">
                {pageItems.map((item) => {
                  const purchaseUnit =
                    purchaseUnitMap[item.id] ?? defaultUnitForStoreItem(item.unit)
                  const unitOpts = unitOptionsForStoreItem(item.unit, item.name)
                  return (
                    <div
                      key={item.id}
                      className="flex flex-col sm:flex-row sm:items-center gap-2 border rounded-lg p-2.5"
                    >
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-sm truncate">{item.name}</p>
                        <p className="text-xs text-muted-foreground">
                          Stock {item.quantityInStore} {unitLabel(item.unit)} ·{' '}
                          {formatNaira(item.lastPrice)}/{unitLabel(item.unit)}
                        </p>
                      </div>
                      <div className="flex flex-wrap items-center gap-1.5">
                        <UnitSelect
                          value={purchaseUnit}
                          units={unitOpts}
                          storeUnit={item.unit}
                          itemName={item.name}
                          onChange={(u) => {
                            setPurchaseUnitMap((m) => ({ ...m, [item.id]: u }))
                            if (qtyMap[item.id]) commitQty(item, qtyMap[item.id], u)
                          }}
                          className="w-[100px] h-8 text-xs"
                        />
                        <Input
                          inputMode="decimal"
                          placeholder="Qty"
                          className="w-20 h-8 text-xs"
                          value={qtyMap[item.id] ?? ''}
                          onChange={(e) => {
                            const cleaned = sanitizeQuantityInput(e.target.value)
                            setQtyMap((m) => ({ ...m, [item.id]: cleaned }))
                            if (isCompleteQuantityInput(cleaned)) {
                              commitQty(item, cleaned)
                            }
                          }}
                          onBlur={(e) => commitQty(item, e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              e.preventDefault()
                              commitQty(item, (e.target as HTMLInputElement).value)
                            }
                          }}
                        />
                        <Input
                          type="number"
                          min={0}
                          step="any"
                          placeholder="Price"
                          className="w-24 h-8 text-xs"
                          value={purchasePriceMap[item.id] ?? ''}
                          onChange={(e) =>
                            setPurchasePriceMap((m) => ({
                              ...m,
                              [item.id]: e.target.value,
                            }))
                          }
                        />
                        <Button
                          size="sm"
                          className="h-8 text-xs"
                          onClick={() => commitQty(item, qtyMap[item.id] || '1')}
                        >
                          Add
                        </Button>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </PaginatedListShell>
        ) : null}
      </div>

      <DraftBasketSidebar
        basket={basket}
        basketByDept={basketByDept}
        total={stats.basketTotal}
        readOnly={locked}
        onClear={() => {
          const res = clearBasket()
          if (res && typeof res === 'object' && 'error' in res) toast.error(String(res.error))
        }}
        onRemove={(id) => {
          const res = removeFromBasket(id)
          if (res && typeof res === 'object' && 'error' in res) toast.error(String(res.error))
        }}
        onQtyChange={(stockItemId, qty) => {
          if (qty <= 0) {
            const res = removeFromBasket(stockItemId)
            if (res && typeof res === 'object' && 'error' in res) {
              toast.error(String(res.error))
            }
            return
          }
          const item = kitchenItems.find((s) => s.id === stockItemId)
          if (!item) return
          const existing = basket.find((l) => l.stockItemId === stockItemId)
          const purchaseUnit = existing?.unit ?? item.unit
          commitQty(item, String(qty), purchaseUnit)
        }}
        sendLabel="Send to store"
        onSend={!locked && basket.length > 0 ? handleSendToStore : undefined}
      />
    </div>
  )
}
