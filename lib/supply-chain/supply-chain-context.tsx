'use client'

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import {
  MOCK_BATCHES,
  MOCK_BAR_STOCK,
  MOCK_FNB_MENU,
  MOCK_KITCHEN_STOCK,
  MOCK_POS,
  MOCK_RECIPES,
  MOCK_STORE_ITEMS,
} from './mock-data'
import {
  calcVat,
  recipeCostPerPortion,
  recipeGrossMarginPct,
  recipeTotalCost,
} from './calculations'
import type {
  ActivityAction,
  ActivityEntry,
  BasketLine,
  FnbOrder,
  KitchenStockItem,
  ProductionBatch,
  PurchaseOrder,
  RawKitchenIssueInput,
  Recipe,
  RetirementLine,
  StoreItem,
  BarStockItem,
} from './types'
import type { OutletDepartmentKey } from '@/lib/outlets/departments'
import { isStoreControlledFnbOutlet } from '@/lib/outlets/departments'
import type { OutletMenuItemRow } from '@/lib/outlets/types'
import { outletStockSlug } from '@/lib/outlets/outlet-stock-slug'
import {
  effectiveStockSource,
  maxSellableQty,
  resolveOutletItemStock,
} from '@/lib/outlets/outlet-supply-stock'

type Actor = { name: string; role: string }

function uid(p: string) {
  return `${p}-${Date.now().toString(36)}`
}

function log(entries: ActivityEntry[], action: ActivityAction, actor: Actor, summary: string, entityId?: string): ActivityEntry[] {
  return [
    {
      id: uid('act'),
      action,
      actorName: actor.name,
      actorRole: actor.role,
      timestamp: new Date().toISOString(),
      summary,
      entityId,
    },
    ...entries,
  ]
}

const KITCHEN_STOCK_STORAGE_KEY = 'frontbill_kitchen_stock'
const BAR_STOCK_STORAGE_KEY = 'frontbill_bar_stock'

function loadPersistedStock<T>(key: string, fallback: T[]): T[] {
  if (typeof window === 'undefined') return [...fallback]
  try {
    const raw = window.sessionStorage.getItem(key)
    if (!raw) return [...fallback]
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? (parsed as T[]) : [...fallback]
  } catch {
    return [...fallback]
  }
}

function upsertKitchenStockRow(
  prev: KitchenStockItem[],
  stockId: string,
  itemName: string,
  qty: number,
): KitchenStockItem[] {
  const idx = prev.findIndex((k) => k.id === stockId)
  if (idx >= 0) {
    return prev.map((k) => (k.id === stockId ? { ...k, availablePortions: qty } : k))
  }
  return [
    ...prev,
    {
      id: stockId,
      name: itemName,
      source: 'issued_raw',
      availablePortions: qty,
      reorderLevel: Math.max(2, Math.ceil(qty * 0.2)),
    },
  ]
}

function upsertBarStockRow(
  prev: BarStockItem[],
  stockId: string,
  row: BarStockItem,
  qty: number,
): BarStockItem[] {
  const idx = prev.findIndex((b) => b.id === stockId)
  if (idx >= 0) {
    return prev.map((b) => (b.id === stockId ? { ...b, quantityOnHand: qty } : b))
  }
  return [...prev, { ...row, quantityOnHand: qty }]
}

const SupplyChainContext = createContext<ReturnType<typeof useSupplyChainImpl> | null>(null)

export { SupplyChainContext }

function useSupplyChainImpl() {
  const [storeItems, setStoreItems] = useState<StoreItem[]>(() => [...MOCK_STORE_ITEMS])
  const [basket, setBasket] = useState<BasketLine[]>([])
  const [purchaseOrders, setPurchaseOrders] = useState<PurchaseOrder[]>(() => [...MOCK_POS])
  const [recipes, setRecipes] = useState<Recipe[]>(() => [...MOCK_RECIPES])
  const [kitchenStock, setKitchenStock] = useState<KitchenStockItem[]>(() =>
    loadPersistedStock(KITCHEN_STOCK_STORAGE_KEY, MOCK_KITCHEN_STOCK),
  )
  const [barStock, setBarStock] = useState<BarStockItem[]>(() =>
    loadPersistedStock(BAR_STOCK_STORAGE_KEY, MOCK_BAR_STOCK),
  )
  const [batches, setBatches] = useState<ProductionBatch[]>(() => [...MOCK_BATCHES])
  const [fnbOrders, setFnbOrders] = useState<FnbMenuItem[]>(() => [...MOCK_FNB_MENU])
  const [orders, setOrders] = useState<FnbOrder[]>([])
  const [activityLog, setActivityLog] = useState<ActivityEntry[]>([
    {
      id: 'act-seed',
      action: 'low_stock_alert',
      actorName: 'System',
      actorRole: 'system',
      timestamp: new Date().toISOString(),
      summary: 'Chapman — 86 OUT (bar stock depleted from sales)',
    },
  ])

  useEffect(() => {
    try {
      window.sessionStorage.setItem(KITCHEN_STOCK_STORAGE_KEY, JSON.stringify(kitchenStock))
    } catch {
      /* ignore quota / private mode */
    }
  }, [kitchenStock])

  useEffect(() => {
    try {
      window.sessionStorage.setItem(BAR_STOCK_STORAGE_KEY, JSON.stringify(barStock))
    } catch {
      /* ignore quota / private mode */
    }
  }, [barStock])

  const addToBasket = useCallback((item: StoreItem, qty: number, unitPrice: number) => {
    if (qty <= 0) return
    setBasket((prev) => {
      const ex = prev.find((b) => b.stockItemId === item.id)
      if (ex) {
        return prev.map((b) =>
          b.stockItemId === item.id ? { ...b, qtyToBuy: qty, unitPrice } : b,
        )
      }
      return [
        ...prev,
        {
          stockItemId: item.id,
          name: item.name,
          dept: item.dept,
          unit: item.unit,
          qtyToBuy: qty,
          unitPrice,
        },
      ]
    })
  }, [])

  const clearBasket = useCallback(() => setBasket([]), [])

  const submitBasketAsPo = useCallback((actor: Actor) => {
    setBasket((current) => {
      if (!current.length) return current
      const lines = current.map((b) => ({
        id: uid('pol'),
        stockItemId: b.stockItemId,
        name: b.name,
        dept: b.dept,
        unit: b.unit,
        quantityOrdered: b.qtyToBuy,
        unitPrice: b.unitPrice,
        lineTotal: b.qtyToBuy * b.unitPrice,
      }))
      const total = lines.reduce((s, l) => s + l.lineTotal, 0)
      const po: PurchaseOrder = {
        id: uid('po'),
        poNumber: `PO-${Date.now().toString(36).toUpperCase()}`,
        weekLabel: `Week of ${new Date().toISOString().slice(0, 10)}`,
        status: 'pending_accountant',
        createdBy: actor.name,
        createdByName: actor.name,
        createdAt: new Date().toISOString(),
        cashDisbursed: total,
        totalAmount: total,
        lines,
      }
      setPurchaseOrders((p) => [po, ...p])
      setActivityLog((a) => log(a, 'po_submitted', actor, `Submitted ${po.poNumber} — ₦${total.toLocaleString()} to accountant`, po.id))
      return []
    })
  }, [])

  const accountantDecision = useCallback(
    (poId: string, approved: boolean, comment: string, actor: Actor) => {
      setPurchaseOrders((prev) =>
        prev.map((po) =>
          po.id === poId
            ? {
                ...po,
                status: approved ? 'pending_manager' : 'accountant_rejected',
                accountantComment: comment,
              }
            : po,
        ),
      )
      setActivityLog((a) =>
        log(a, 'po_accountant_decision', actor, `Accountant ${approved ? 'approved' : 'rejected'} PO: ${comment}`, poId),
      )
    },
    [],
  )

  const managerDecision = useCallback(
    (poId: string, approved: boolean, comment: string, actor: Actor) => {
      setPurchaseOrders((prev) =>
        prev.map((po) =>
          po.id === poId
            ? {
                ...po,
                status: approved ? 'disbursed' : 'manager_rejected',
                managerComment: comment,
              }
            : po,
        ),
      )
      setActivityLog((a) =>
        log(a, 'po_manager_decision', actor, `Manager ${approved ? 'approved' : 'rejected'} PO: ${comment}`, poId),
      )
    },
    [],
  )

  /** Testing: admin approves or rejects a raised PO in one step (skips accountant → manager chain). */
  const adminTestPoDecision = useCallback(
    (poId: string, approved: boolean, comment: string, actor: Actor) => {
      setPurchaseOrders((prev) =>
        prev.map((po) => {
          if (po.id !== poId) return po
          if (po.status !== 'pending_accountant' && po.status !== 'pending_manager') return po
          if (approved) {
            return {
              ...po,
              status: 'disbursed' as const,
              accountantComment: `[Admin test] ${comment}`,
              managerComment: `[Admin test] ${comment}`,
            }
          }
          if (po.status === 'pending_manager') {
            return { ...po, status: 'manager_rejected' as const, managerComment: `[Admin test] ${comment}` }
          }
          return { ...po, status: 'accountant_rejected' as const, accountantComment: `[Admin test] ${comment}` }
        }),
      )
      setActivityLog((a) =>
        log(
          a,
          approved ? 'po_manager_decision' : 'po_accountant_decision',
          actor,
          `Admin test ${approved ? 'approved' : 'rejected'} PO: ${comment}`,
          poId,
        ),
      )
    },
    [],
  )

  const submitRetirement = useCallback(
    (poId: string, lines: RetirementLine[], actor: Actor) => {
      setPurchaseOrders((prev) => {
        const po = prev.find((p) => p.id === poId)
        if (!po) return prev
        const actualSpent = lines.filter((l) => !l.removed).reduce((s, l) => s + l.totalPaid, 0)
        const refund = po.cashDisbursed - actualSpent

        setStoreItems((items) => {
          const next = [...items]
          for (const rl of lines) {
            if (rl.removed || rl.quantityBought <= 0) continue
            const pl = po.lines.find((l) => l.id === rl.lineId)
            if (!pl) continue
            const idx = next.findIndex((s) => s.id === pl.stockItemId)
            if (idx >= 0) {
              next[idx] = {
                ...next[idx],
                quantityInStore: next[idx].quantityInStore + rl.quantityBought,
                lastPrice: rl.actualPrice,
              }
            }
          }
          return next
        })

        setActivityLog((a) =>
          log(a, 'retirement_submitted', actor, `Retirement complete — stock updated, refund ₦${refund.toLocaleString()}`, poId),
        )

        return prev.map((p) =>
          p.id === poId
            ? {
                ...p,
                status: 'retired' as const,
                retirement: {
                  actualSpent,
                  refundToCashier: refund,
                  priceChanges: lines.filter((l) => l.poPrice !== l.actualPrice).length,
                  lines,
                  submittedAt: new Date().toISOString(),
                  submittedBy: actor.name,
                },
              }
            : p,
        )
      })
    },
    [],
  )

  const openBatch = useCallback(
    (recipeId: string, plannedPortions: number, actor: Actor) => {
      const recipe = recipes.find((r) => r.id === recipeId)
      if (!recipe) return null

      for (const ing of recipe.ingredients) {
        const store = storeItems.find((s) => s.id === ing.stockItemId)
        if (!store || store.quantityInStore < ing.quantity) {
          return { error: `Insufficient ${ing.name} in central store` }
        }
      }

      setStoreItems((items) =>
        items.map((s) => {
          const ing = recipe.ingredients.find((i) => i.stockItemId === s.id)
          if (!ing) return s
          return { ...s, quantityInStore: s.quantityInStore - ing.quantity }
        }),
      )

      const batch: ProductionBatch = {
        id: uid('bat'),
        recipeId,
        recipeName: recipe.name,
        shift: 'Morning',
        status: 'in_progress',
        plannedPortions,
        actualPortions: 0,
        foodCostPct: 0,
        variancePct: 0,
        materialsUsed: recipe.ingredients.map((i) => `${i.quantity} ${i.unit} ${i.name}`),
        openedAt: new Date().toISOString(),
        openedBy: actor.name,
      }
      setBatches((b) => [batch, ...b])
      setActivityLog((a) =>
        log(
          a,
          'stock_issued_kitchen',
          actor,
          `Opened batch: ${recipe.name} — raw materials issued from store (cost ₦${recipeTotalCost(recipe).toLocaleString()})`,
          batch.id,
        ),
      )
      return { batch }
    },
    [recipes, storeItems],
  )

  const closeBatch = useCallback(
    (
      batchId: string,
      actualPortions: number,
      disposition: { sold: number; staff: number; waste: number; returned: number },
      actor: Actor,
    ) => {
      const batch = batches.find((b) => b.id === batchId)
      if (!batch) return
      const recipe = recipes.find((r) => r.id === batch.recipeId)
      if (!recipe) return

      const foodCost = recipeTotalCost(recipe)
      const foodCostPct = recipeGrossMarginPct(recipe)
      const variancePct =
        batch.plannedPortions > 0
          ? Math.round(((actualPortions - batch.plannedPortions) / batch.plannedPortions) * 1000) / 10
          : 0

      setBatches((prev) =>
        prev.map((b) =>
          b.id === batchId
            ? {
                ...b,
                status: 'completed',
                actualPortions,
                foodCostPct,
                variancePct,
                closedAt: new Date().toISOString(),
                disposition,
              }
            : b,
        ),
      )

      const stockId = kitchenStock.find((k) => k.linkedRecipeId === recipe.id)?.id
      if (stockId) {
        setKitchenStock((ks) =>
          ks.map((k) =>
            k.id === stockId
              ? { ...k, availablePortions: k.availablePortions + actualPortions - disposition.staff - disposition.waste - disposition.returned }
              : k,
          ),
        )
      }

      setActivityLog((a) =>
        log(
          a,
          'batch_closed',
          actor,
          `Closed ${recipe.name}: ${actualPortions} portions → F&B stock (+${actualPortions - disposition.staff - disposition.waste - disposition.returned} sellable). Cost ₦${foodCost.toLocaleString()}, margin ${foodCostPct}%`,
          batchId,
        ),
      )
    },
    [batches, recipes, kitchenStock],
  )

  const postFnbOrder = useCallback(
    (
      lines: { menuItemId: string; qty: number }[],
      tableLabel: string,
      settlement: string,
      actor: Actor,
    ) => {
      const orderLines: FnbOrder['lines'] = []
      let subtotal = 0

      for (const { menuItemId, qty } of lines) {
        const menu = fnbOrders.find((m) => m.id === menuItemId)
        if (!menu) continue
        if (menu.portionsPerSale > 0) {
          const ks = kitchenStock.find((k) => k.id === menu.kitchenStockId)
          if (!ks || ks.availablePortions < menu.portionsPerSale * qty) {
            return { error: `${menu.name} — 86 OUT (kitchen stock insufficient)` }
          }
        }
        orderLines.push({
          menuItemId,
          name: menu.name,
          qty,
          unitPrice: menu.sellingPrice,
        })
        subtotal += menu.sellingPrice * qty
      }

      for (const ol of orderLines) {
        const menu = fnbOrders.find((m) => m.id === ol.menuItemId)!
        if (menu.portionsPerSale <= 0) continue
        setKitchenStock((ks) =>
          ks.map((k) =>
            k.id === menu.kitchenStockId
              ? { ...k, availablePortions: Math.max(0, k.availablePortions - menu.portionsPerSale * ol.qty) }
              : k,
          ),
        )
      }

      const vat = calcVat(subtotal)
      const order: FnbOrder = {
        id: uid('ord'),
        tableLabel,
        lines: orderLines,
        subtotal,
        vat,
        total: subtotal + vat,
        settlement,
        status: 'ordered',
        createdAt: new Date().toISOString(),
      }
      setOrders((o) => [order, ...o])
      setActivityLog((a) =>
        log(a, 'fnb_order_posted', actor, `Posted order ₦${order.total.toLocaleString()} — kitchen stock auto-depleted`, order.id),
      )
      return { order }
    },
    [fnbOrders, kitchenStock],
  )

  const issueFromStoreToBar = useCallback(
    (storeItemId: string, qty: number, actor: Actor) => {
      if (qty <= 0) return { error: 'Enter a quantity to issue' }
      const store = storeItems.find((s) => s.id === storeItemId)
      if (!store || store.dept !== 'bar') {
        return { error: 'Only bar department store items can be issued to the bar' }
      }
      if (store.quantityInStore < qty) {
        return { error: `Insufficient ${store.name} in central store (${store.quantityInStore} ${store.unit})` }
      }

      setStoreItems((items) =>
        items.map((s) =>
          s.id === storeItemId ? { ...s, quantityInStore: s.quantityInStore - qty } : s,
        ),
      )

      setBarStock((prev) => {
        const idx = prev.findIndex((b) => b.storeItemId === storeItemId)
        if (idx >= 0) {
          return prev.map((b, i) =>
            i === idx ? { ...b, quantityOnHand: b.quantityOnHand + qty } : b,
          )
        }
        return [
          ...prev,
          {
            id: `bar-${storeItemId}`,
            storeItemId,
            name: store.name,
            quantityOnHand: qty,
            reorderLevel: store.reorderLevel,
            unitsPerSale: 1,
            unit: store.unit,
          },
        ]
      })

      setActivityLog((a) =>
        log(
          a,
          'stock_issued_bar',
          actor,
          `Issued ${qty} ${store.unit} ${store.name} from store → bar stock`,
          storeItemId,
        ),
      )
      return { ok: true as const }
    },
    [storeItems],
  )

  /** Admin kickstart: set absolute on-hand qty for a menu item (creates kitchen/bar link if missing). */
  const kickstartOutletMenuStock = useCallback(
    (
      department: OutletDepartmentKey,
      item: OutletMenuItemRow,
      newQty: number,
      actor: Actor,
    ): { ok: true; stockId: string; serviceCode: string; unit: string } | { error: string } => {
      if (!isStoreControlledFnbOutlet(department)) {
        return { error: 'Stock kickstart is only for Restaurant and Main Bar' }
      }
      if (!Number.isFinite(newQty) || newQty < 0) {
        return { error: 'Enter a valid quantity (0 or more)' }
      }

      const qty = Math.floor(newQty)
      const source = effectiveStockSource(department, item)
      const link = resolveOutletItemStock(item, department, kitchenStock, barStock)

      if (source === 'kitchen') {
        const stockId = link.stockId || `ks-${outletStockSlug(item.name)}`
        const serviceCode = `ks:${stockId}`
        setKitchenStock((prev) => upsertKitchenStockRow(prev, stockId, item.name, qty))
        setActivityLog((a) =>
          log(
            a,
            'stock_issued_kitchen',
            actor,
            `Kickstart ${item.name} → ${qty} portions (menu tab)`,
            stockId,
          ),
        )
        return { ok: true, stockId, serviceCode, unit: 'portion' }
      }

      if (source === 'bar') {
        const stockId = link.stockId || `bar-${outletStockSlug(item.name)}`
        const matchedStore = storeItems.find(
          (s) =>
            s.dept === 'bar' &&
            s.name.trim().toLowerCase() === item.name.trim().toLowerCase(),
        )
        const barUnit = barStock.find((b) => b.id === stockId)?.unit ?? matchedStore?.unit ?? 'bottle'
        const serviceCode = `bar:${stockId}`
        const barRow: BarStockItem = {
          id: stockId,
          storeItemId: matchedStore?.id ?? `manual-${stockId}`,
          name: item.name,
          quantityOnHand: qty,
          reorderLevel: Math.max(6, Math.ceil(qty * 0.2)),
          unitsPerSale: 1,
          unit: barUnit,
        }
        setBarStock((prev) => upsertBarStockRow(prev, stockId, barRow, qty))
        setActivityLog((a) =>
          log(
            a,
            'stock_issued_bar',
            actor,
            `Kickstart ${item.name} → ${qty} ${barUnit}(s) (menu tab)`,
            stockId,
          ),
        )
        return { ok: true, stockId, serviceCode, unit: barUnit }
      }

      return { error: 'This outlet is not stock-controlled' }
    },
    [kitchenStock, barStock, storeItems],
  )

  /**
   * Issue raw kitchen store stock → flexible portion yield.
   * e.g. 1 kg beef → 4 portions; 6 kg chicken → 16 portions; 5 kg goat → 15 portions.
   */
  const issueRawToKitchenPortions = useCallback(
    (input: RawKitchenIssueInput, actor: Actor): { ok: true } | { error: string } => {
      const rawQty = Number(input.rawQuantity)
      const portions = Math.floor(Number(input.portionsProduced))
      const finishedName = input.finishedItemName.trim()

      if (!input.storeItemId) return { error: 'Select a raw material from central store' }
      if (!finishedName) return { error: 'Enter the finished kitchen item name' }
      if (!Number.isFinite(rawQty) || rawQty <= 0) return { error: 'Enter raw quantity issued' }
      if (!Number.isFinite(portions) || portions <= 0) {
        return { error: 'Enter portions produced (flexible yield)' }
      }

      const store = storeItems.find((s) => s.id === input.storeItemId)
      if (!store || store.dept !== 'kitchen') {
        return { error: 'Only kitchen department store items can be issued this way' }
      }
      if (store.quantityInStore < rawQty) {
        return {
          error: `Insufficient ${store.name} in store (${store.quantityInStore} ${store.unit} on hand)`,
        }
      }

      setStoreItems((items) =>
        items.map((s) =>
          s.id === store.id ? { ...s, quantityInStore: s.quantityInStore - rawQty } : s,
        ),
      )

      let kitchenStockId = input.kitchenStockId?.trim()
      if (kitchenStockId) {
        setKitchenStock((prev) =>
          prev.map((k) =>
            k.id === kitchenStockId
              ? { ...k, availablePortions: k.availablePortions + portions }
              : k,
          ),
        )
      } else {
        kitchenStockId = `ks-${outletStockSlug(finishedName)}`
        setKitchenStock((prev) => {
          const idx = prev.findIndex((k) => k.id === kitchenStockId)
          if (idx >= 0) {
            return prev.map((k, i) =>
              i === idx ? { ...k, availablePortions: k.availablePortions + portions } : k,
            )
          }
          return [
            ...prev,
            {
              id: kitchenStockId!,
              name: finishedName,
              source: 'issued_raw' as const,
              availablePortions: portions,
              reorderLevel: Math.max(2, Math.ceil(portions * 0.15)),
            },
          ]
        })
      }

      const yieldNote = input.notes?.trim()
        ? input.notes.trim()
        : `${rawQty} ${store.unit} ${store.name} → ${portions} portions`

      setActivityLog((a) =>
        log(
          a,
          'stock_issued_kitchen',
          actor,
          `Raw issue: ${yieldNote}`,
          kitchenStockId,
        ),
      )

      return { ok: true }
    },
    [storeItems],
  )

  const getOutletItemStock = useCallback(
    (department: OutletDepartmentKey, item: OutletMenuItemRow) =>
      resolveOutletItemStock(item, department, kitchenStock, barStock),
    [kitchenStock, barStock],
  )

  const validateOutletCart = useCallback(
    (
      department: OutletDepartmentKey,
      lines: { item: OutletMenuItemRow; qty: number }[],
    ): { ok: true } | { error: string } => {
      for (const line of lines) {
        const link = resolveOutletItemStock(line.item, department, kitchenStock, barStock)
        if (!link.tracked) continue
        const need = link.portionsPerSale * line.qty
        const maxQty = maxSellableQty(link)
        if (line.qty > maxQty) {
          const src = link.source === 'kitchen' ? 'kitchen' : 'bar'
          return {
            error: `${line.item.name} — only ${maxQty} available (${src}: ${link.available} on hand)`,
          }
        }
        if (need > link.available) {
          return { error: `${line.item.name} — insufficient ${link.source} stock` }
        }
      }
      return { ok: true }
    },
    [kitchenStock, barStock],
  )

  const deductOutletCart = useCallback(
    (
      department: OutletDepartmentKey,
      lines: { item: OutletMenuItemRow; qty: number }[],
      actor: Actor,
    ) => {
      for (const line of lines) {
        const link = resolveOutletItemStock(line.item, department, kitchenStock, barStock)
        if (!link.tracked || !link.stockId) continue
        const deduct = link.portionsPerSale * line.qty
        if (link.source === 'kitchen') {
          setKitchenStock((ks) =>
            ks.map((k) =>
              k.id === link.stockId
                ? { ...k, availablePortions: Math.max(0, k.availablePortions - deduct) }
                : k,
            ),
          )
        } else {
          setBarStock((bs) =>
            bs.map((b) =>
              b.id === link.stockId
                ? { ...b, quantityOnHand: Math.max(0, b.quantityOnHand - deduct) }
                : b,
            ),
          )
        }
      }
      setActivityLog((a) =>
        log(
          a,
          'fnb_order_posted',
          actor,
          `Outlet ${department} sale — stock deducted (kitchen / bar pipeline)`,
        ),
      )
    },
    [kitchenStock, barStock],
  )

  const stats = useMemo(
    () => ({
      totalStoreItems: storeItems.length,
      stockAlerts: storeItems.filter((s) => s.quantityInStore <= s.reorderLevel).length,
      basketTotal: basket.reduce((s, b) => s + b.qtyToBuy * b.unitPrice, 0),
      basketCount: basket.length,
      activeBatches: batches.filter((b) => b.status === 'in_progress').length,
      recipeCount: recipes.length,
      fnbAlerts: kitchenStock.filter((k) => k.availablePortions <= k.reorderLevel).length,
      barAlerts: barStock.filter((b) => b.quantityOnHand <= b.reorderLevel).length,
      todayRevenue: orders
        .filter((o) => o.createdAt.slice(0, 10) === new Date().toISOString().slice(0, 10))
        .reduce((s, o) => s + o.total, 0),
    }),
    [storeItems, basket, batches, recipes, kitchenStock, barStock, orders],
  )

  return {
    storeItems,
    basket,
    addToBasket,
    clearBasket,
    submitBasketAsPo,
    purchaseOrders,
    accountantDecision,
    managerDecision,
    adminTestPoDecision,
    submitRetirement,
    recipes,
    kitchenStock,
    barStock,
    issueFromStoreToBar,
    kickstartOutletMenuStock,
    issueRawToKitchenPortions,
    getOutletItemStock,
    validateOutletCart,
    deductOutletCart,
    batches,
    fnbMenu: fnbOrders,
    orders,
    openBatch,
    closeBatch,
    postFnbOrder,
    activityLog,
    stats,
    getRecipeEconomics: (recipe: Recipe) => ({
      totalCost: recipeTotalCost(recipe),
      costPerPortion: recipeCostPerPortion(recipe),
      revenue: recipe.sellingPricePerPortion * recipe.yieldPortions,
      profit: recipe.sellingPricePerPortion * recipe.yieldPortions - recipeTotalCost(recipe),
      marginPct: recipeGrossMarginPct(recipe),
    }),
  }
}

export function SupplyChainProvider({ children }: { children: ReactNode }) {
  return <SupplyChainContext.Provider value={useSupplyChainImpl()}>{children}</SupplyChainContext.Provider>
}

export function useSupplyChain() {
  const ctx = useContext(SupplyChainContext)
  if (!ctx) throw new Error('useSupplyChain requires SupplyChainProvider')
  return ctx
}
