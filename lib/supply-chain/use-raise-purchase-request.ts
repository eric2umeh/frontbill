'use client'

import { useEffect, useMemo, useState } from 'react'
import { useAuth } from '@/lib/auth-context'
import { useSupplyChain } from '@/lib/supply-chain/supply-chain-context'
import {
  DEPT_LABELS,
  STORE_DEPT_PICKER_OPTIONS,
  storeItemDepartments,
  storeItemMatchesDept,
  type SupplyDept,
} from '@/lib/supply-chain/types'
import { canonicalRoleKey } from '@/lib/permissions'
import { canEditStorePurchaseOrder, poOriginOf } from '@/lib/supply-chain/po-active'
import { toast } from 'sonner'
import { playNotificationBeep } from '@/lib/utils/play-notification-beep'
import {
  defaultUnitForStoreItem,
  formatUnitLabel,
  isCompleteQuantityInput,
  parseQuantityValue,
  sanitizeQuantityInput,
} from '@/lib/supply-chain/measurement-units'
import {
  convertToStoreUnitsWithFactors,
  mergeUnitFactors,
  needsUnitFactor,
} from '@/lib/supply-chain/unit-factor-storage'
import { purchaseUnitPriceFromStorePrice } from '@/lib/supply-chain/purchase-unit-pricing'
import type { StoreItem } from '@/lib/supply-chain/types'

const DEPTS: SupplyDept[] = ['all', ...STORE_DEPT_PICKER_OPTIONS]

export function useRaisePurchaseRequest(activeTab: string) {
  const { name, role } = useAuth()
  const {
    storeItems,
    basket,
    setBasketLineQty,
    removeFromBasket,
    clearBasket,
    sendBasketForApproval,
    activePurchaseOrder,
    stats,
    updateStoreItemDirect,
  } = useSupplyChain()

  const [dept, setDept] = useState<SupplyDept>('all')
  const [qtyMap, setQtyMap] = useState<Record<string, string>>({})
  const [purchaseUnitMap, setPurchaseUnitMap] = useState<Record<string, string>>({})
  const [purchasePriceMap, setPurchasePriceMap] = useState<Record<string, string>>({})
  const [factorMap, setFactorMap] = useState<Record<string, Record<string, number>>>({})
  const [raiseSeedSearch, setRaiseSeedSearch] = useState('')
  const [focusRaiseItemId, setFocusRaiseItemId] = useState<string | null>(null)

  const purchaseLocked = Boolean(
    activePurchaseOrder && !canEditStorePurchaseOrder(activePurchaseOrder),
  )
  const kitchenAwaitingStore =
    activePurchaseOrder?.status === 'pending_store' &&
    poOriginOf(activePurchaseOrder) === 'kitchen'

  const actor = { name: name ?? 'Store', role: canonicalRoleKey(role) ?? 'store' }
  const unitLabel = (unit: string) => formatUnitLabel(unit)

  const factorsFor = (item: StoreItem) =>
    factorMap[item.id] ?? mergeUnitFactors(item.id, item.unit, item.unitFactors)

  const toStoreQty = (item: StoreItem, qty: number, unit: string): number | null =>
    convertToStoreUnitsWithFactors(qty, unit, item.unit, factorsFor(item))

  const filtered = useMemo(() => {
    const list =
      dept === 'all' ? storeItems : storeItems.filter((s) => storeItemMatchesDept(s, dept))
    return [...list].sort((a, b) =>
      a.name.localeCompare(b.name, undefined, { sensitivity: 'base', numeric: true }),
    )
  }, [storeItems, dept])

  const deptCatalogCounts = useMemo(() => {
    const c: Partial<Record<SupplyDept, number>> = {}
    for (const item of storeItems) {
      for (const d of storeItemDepartments(item)) {
        c[d] = (c[d] ?? 0) + 1
      }
    }
    return c
  }, [storeItems])

  useEffect(() => {
    const onFocus = (e: Event) => {
      const detail = (e as CustomEvent<{ stockItemId: string; name: string }>).detail
      if (!detail?.stockItemId) return
      setRaiseSeedSearch(detail.name)
      setFocusRaiseItemId(detail.stockItemId)
    }
    window.addEventListener('frontbill:focus-raise-po-item', onFocus)
    return () => window.removeEventListener('frontbill:focus-raise-po-item', onFocus)
  }, [])

  useEffect(() => {
    if (!focusRaiseItemId || activeTab !== 'purchase') return
    const id = focusRaiseItemId
    const timer = window.setTimeout(() => {
      const candidates = Array.from(
        document.querySelectorAll<HTMLElement>(`[data-raise-po-item="${id}"]`),
      )
      const row =
        candidates.find((el) => el.getClientRects().length > 0) ?? candidates[0]
      if (!row) return
      row.scrollIntoView({ behavior: 'smooth', block: 'center' })
      row.classList.add(
        'ring-2',
        'ring-sky-500',
        'ring-offset-2',
        'ring-offset-background',
      )
      window.setTimeout(() => {
        row.classList.remove(
          'ring-2',
          'ring-sky-500',
          'ring-offset-2',
          'ring-offset-background',
        )
      }, 2200)
      row.querySelector<HTMLInputElement>('input[data-raise-po-price="1"]')?.focus()
      setFocusRaiseItemId(null)
    }, 120)
    return () => window.clearTimeout(timer)
  }, [focusRaiseItemId, raiseSeedSearch, activeTab])

  const poLinesSyncKey =
    activePurchaseOrder?.lines
      ?.map((l) => `${l.stockItemId}:${l.quantityOrdered}:${l.unitPrice}`)
      .join('|') ?? ''

  useEffect(() => {
    const lines = activePurchaseOrder?.lines
    if (!lines?.length) return
    setQtyMap((prev) => {
      const next = { ...prev }
      let changed = false
      for (const l of lines) {
        const str = String(l.quantityOrdered)
        if (next[l.stockItemId] !== str) {
          next[l.stockItemId] = str
          changed = true
        }
      }
      return changed ? next : prev
    })
    setPurchaseUnitMap((prev) => {
      const next = { ...prev }
      let changed = false
      for (const l of lines) {
        if (l.unit && next[l.stockItemId] !== l.unit) {
          next[l.stockItemId] = l.unit
          changed = true
        }
      }
      return changed ? next : prev
    })
    setPurchasePriceMap((prev) => {
      const next = { ...prev }
      let changed = false
      for (const l of lines) {
        if (Number.isFinite(l.unitPrice) && l.unitPrice > 0) {
          const str = String(l.unitPrice)
          if (next[l.stockItemId] !== str) {
            next[l.stockItemId] = str
            changed = true
          }
        }
      }
      return changed ? next : prev
    })
  }, [activePurchaseOrder?.id, poLinesSyncKey])

  useEffect(() => {
    setQtyMap((prev) => {
      const next = { ...prev }
      let changed = false
      for (const b of basket) {
        if (!(b.stockItemId in next)) {
          next[b.stockItemId] = String(b.qtyToBuy)
          changed = true
        }
      }
      return changed ? next : prev
    })
    setPurchaseUnitMap((prev) => {
      const next = { ...prev }
      let changed = false
      for (const b of basket) {
        if (b.unit && !(b.stockItemId in next)) {
          next[b.stockItemId] = b.unit
          changed = true
        }
      }
      return changed ? next : prev
    })
    setPurchasePriceMap((prev) => {
      const next = { ...prev }
      let changed = false
      for (const b of basket) {
        if (
          Number.isFinite(b.unitPrice) &&
          b.unitPrice > 0 &&
          !(b.stockItemId in next)
        ) {
          next[b.stockItemId] = String(b.unitPrice)
          changed = true
        }
      }
      return changed ? next : prev
    })
  }, [basket])

  const handleRemoveFromBasket = (stockItemId: string) => {
    const res = removeFromBasket(stockItemId, actor)
    if (res && 'error' in res) {
      toast.error(res.error)
      return
    }
    setQtyMap((m) => {
      const next = { ...m }
      delete next[stockItemId]
      return next
    })
    setPurchaseUnitMap((m) => {
      const next = { ...m }
      delete next[stockItemId]
      return next
    })
    setPurchasePriceMap((m) => {
      const next = { ...m }
      delete next[stockItemId]
      return next
    })
  }

  const commitPurchaseQty = (
    item: StoreItem,
    raw: string,
    unitOverride?: string,
    priceOverride?: string,
  ) => {
    const trimmed = raw.trim()
    const purchaseUnit = unitOverride ?? purchaseUnitMap[item.id] ?? defaultUnitForStoreItem(item.unit)
    if (!trimmed) {
      if (basket.some((b) => b.stockItemId === item.id)) {
        handleRemoveFromBasket(item.id)
      } else {
        setQtyMap((m) => {
          const next = { ...m }
          delete next[item.id]
          return next
        })
      }
      return
    }
    const qty = parseQuantityValue(trimmed)
    if (qty <= 0) {
      if (basket.some((b) => b.stockItemId === item.id)) {
        handleRemoveFromBasket(item.id)
      }
      return
    }
    const storeQty = toStoreQty(item, qty, purchaseUnit)
    if (storeQty == null) {
      toast.error(`Set pack size for ${item.name} (${unitLabel(purchaseUnit)} per ${unitLabel(item.unit)})`)
      return
    }
    const factors = factorsFor(item)
    const defaultPurchasePrice = purchaseUnitPriceFromStorePrice(
      item.lastPrice,
      purchaseUnit,
      item.unit,
      factors,
    )
    const priceRaw =
      priceOverride !== undefined ? priceOverride : (purchasePriceMap[item.id] ?? '')
    const typedPrice = Number(priceRaw)
    const purchaseUnitPrice =
      Number.isFinite(typedPrice) && typedPrice > 0 ? typedPrice : defaultPurchasePrice
    const storeUnitPrice = item.lastPrice
    const err = setBasketLineQty(item, storeQty, storeUnitPrice, actor, {
      purchaseUnit,
      purchaseQty: qty,
      purchaseUnitPrice,
      storeQty,
      storeUnitPrice,
    })
    if (err) toast.error(err)
  }

  const handlePurchaseQtyChange = (item: StoreItem, raw: string) => {
    const cleaned = sanitizeQuantityInput(raw)
    setQtyMap((m) => ({ ...m, [item.id]: cleaned }))
    if (!purchaseUnitMap[item.id]) {
      setPurchaseUnitMap((m) => ({
        ...m,
        [item.id]: defaultUnitForStoreItem(item.unit),
      }))
    }
    if (!cleaned.trim()) return
    if (isCompleteQuantityInput(cleaned)) {
      commitPurchaseQty(item, cleaned)
    }
  }

  const handleClearBasket = () => {
    void (async () => {
      const res = await clearBasket(actor)
      if (res && 'error' in res) {
        toast.error(res.error)
        return
      }
      setQtyMap({})
      setPurchaseUnitMap({})
      setPurchasePriceMap({})
      toast.success('Draft basket cleared')
    })()
  }

  const handleBasketQtyChange = (stockItemId: string, qty: number) => {
    const item = storeItems.find((s) => s.id === stockItemId)
    if (!item) return
    if (qty <= 0) {
      handleRemoveFromBasket(stockItemId)
      return
    }
    setQtyMap((m) => ({ ...m, [stockItemId]: String(qty) }))
    const existing = basket.find((b) => b.stockItemId === stockItemId)
    const mappedPrice = Number(purchasePriceMap[stockItemId])
    const storeQty =
      existing?.storeQtyToBuy && existing.qtyToBuy > 0
        ? (qty / existing.qtyToBuy) * existing.storeQtyToBuy
        : qty
    const purchaseUnitPrice =
      (existing?.unitPrice && existing.unitPrice > 0
        ? existing.unitPrice
        : undefined) ??
      (mappedPrice > 0 ? mappedPrice : undefined) ??
      (item.lastPrice > 0 ? item.lastPrice : 0)
    const storeUnitPrice =
      (existing?.storeUnitPrice && existing.storeUnitPrice > 0
        ? existing.storeUnitPrice
        : undefined) ??
      (storeQty > 0 && purchaseUnitPrice > 0
        ? (qty * purchaseUnitPrice) / storeQty
        : item.lastPrice)
    const err = setBasketLineQty(item, storeQty, storeUnitPrice, actor, {
      purchaseUnit: existing?.unit ?? item.unit,
      purchaseQty: qty,
      purchaseUnitPrice,
      storeQty,
      storeUnitPrice,
    })
    if (err) toast.error(err)
  }

  const handleBasketPriceChange = (stockItemId: string, price: number) => {
    const item = storeItems.find((s) => s.id === stockItemId)
    const existing = basket.find((b) => b.stockItemId === stockItemId)
    if (!item || !existing) return
    setPurchasePriceMap((m) => ({ ...m, [stockItemId]: String(price) }))
    const storeQty = existing.storeQtyToBuy ?? existing.qtyToBuy
    const storeUnitPrice =
      storeQty > 0 && price > 0
        ? (existing.qtyToBuy * price) / storeQty
        : item.lastPrice
    const err = setBasketLineQty(item, storeQty, storeUnitPrice, actor, {
      purchaseUnit: existing.unit,
      purchaseQty: existing.qtyToBuy,
      purchaseUnitPrice: price,
      storeQty,
      storeUnitPrice,
    })
    if (err) toast.error(err)
  }

  const handleSendToAccountant = () => {
    const res = sendBasketForApproval(actor)
    if (res && typeof res === 'object' && 'error' in res) {
      toast.error(String(res.error))
      return
    }
    if (res && 'po' in res) {
      playNotificationBeep()
      toast.success(
        `${res.po.poNumber} sent — kitchen + store draft lines are combined for accountant review`,
      )
    }
  }

  return {
    DEPTS,
    DEPT_LABELS,
    dept,
    setDept,
    filtered,
    deptCatalogCounts,
    storeItems,
    qtyMap,
    purchaseUnitMap,
    purchasePriceMap,
    basket,
    stats,
    purchaseLocked,
    kitchenAwaitingStore,
    raiseSeedSearch,
    factorsFor,
    toStoreQty,
    unitLabel,
    needsUnitFactor,
    commitPurchaseQty,
    handlePurchaseQtyChange,
    handleClearBasket,
    handleRemoveFromBasket,
    handleBasketQtyChange,
    handleBasketPriceChange,
    handleSendToAccountant,
    updateStoreItemDirect,
    setFactorMap,
    setPurchaseUnitMap,
    setPurchasePriceMap,
    actor,
  }
}
