import type { OutletDepartmentKey } from '@/lib/outlets/departments'
import { isStoreControlledFnbOutlet } from '@/lib/outlets/departments'
import type { OutletMenuItemRow } from '@/lib/outlets/types'
import type { BarStockItem, KitchenStockItem } from '@/lib/supply-chain/types'

export type OutletStockSource = 'kitchen' | 'bar' | 'none'

export type ResolvedOutletStockLink = {
  source: Exclude<OutletStockSource, 'none'>
  /** kitchen stock row id or bar stock row id */
  stockId: string
  portionsPerSale: number
  available: number
  tracked: boolean
  /** Display unit: portion, bottle, can, litre, etc. */
  unit: string
}

function normalizeName(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, ' ')
}

function pluralUnit(unit: string, qty: number): string {
  if (qty === 1) return unit
  if (unit.endsWith('s')) return unit
  return `${unit}s`
}

/** Which inventory pipeline feeds this outlet POS. */
export function outletStockSource(department: OutletDepartmentKey): OutletStockSource {
  if (department === 'main_bar' || department === 'pool_bar') return 'bar'
  if (department === 'restaurant' || department === 'banquets') return 'kitchen'
  return 'none'
}

function itemLooksLikeDrink(item: OutletMenuItemRow): boolean {
  const tags = (item.tags ?? []).map((t) => String(t).toLowerCase())
  return tags.some((t) =>
    ['alcohol', 'beverage', 'bar', 'drink', 'wine', 'beer', 'cocktail'].some((k) => t.includes(k)),
  )
}

/** Banquets may serve both kitchen food and bar drinks. */
export function effectiveStockSource(
  department: OutletDepartmentKey,
  item: OutletMenuItemRow,
): OutletStockSource {
  if (department === 'banquets') {
    return itemLooksLikeDrink(item) ? 'bar' : 'kitchen'
  }
  return outletStockSource(department)
}

/**
 * Optional menu link via service_code:
 *   ks:ks-pepper        → kitchen stock (1 portion)
 *   ks:ks-pepper:2      → kitchen stock (2 portions per sale)
 *   bar:bar-stout       → bar stock issued from store (1 unit)
 *   bar:bar-stout:6     → 6 units per sale (e.g. beer bucket)
 */
export function parseMenuStockLink(serviceCode: string | null | undefined): {
  source: 'kitchen' | 'bar'
  stockId: string
  portionsPerSale: number
} | null {
  const raw = String(serviceCode ?? '').trim()
  if (!raw) return null
  const parts = raw.split(':')
  if (parts.length < 2) return null
  const prefix = parts[0].toLowerCase()
  if (prefix !== 'ks' && prefix !== 'bar') return null
  const stockId = parts[1]?.trim()
  if (!stockId) return null
  const portionsPerSale = parts[2] ? Math.max(1, Number(parts[2]) || 1) : 1
  return {
    source: prefix === 'ks' ? 'kitchen' : 'bar',
    stockId,
    portionsPerSale,
  }
}

function matchKitchenByName(
  itemName: string,
  kitchenStock: KitchenStockItem[],
): KitchenStockItem | undefined {
  const target = normalizeName(itemName)
  return kitchenStock.find((k) => {
    const kn = normalizeName(k.name)
    return kn === target || kn.includes(target) || target.includes(kn)
  })
}

function matchBarByName(itemName: string, barStock: BarStockItem[]): BarStockItem | undefined {
  const target = normalizeName(itemName)
  return barStock.find((b) => {
    const bn = normalizeName(b.name)
    return bn === target || bn.includes(target) || target.includes(bn)
  })
}

function kitchenLink(
  stockId: string,
  portionsPerSale: number,
  kitchenStock: KitchenStockItem[],
): ResolvedOutletStockLink {
  const row = kitchenStock.find((k) => k.id === stockId)
  return {
    source: 'kitchen',
    stockId,
    portionsPerSale,
    available: row?.availablePortions ?? 0,
    tracked: true,
    unit: 'portion',
  }
}

function barLink(
  stockId: string,
  portionsPerSale: number,
  barStock: BarStockItem[],
): ResolvedOutletStockLink {
  const row = barStock.find((b) => b.id === stockId)
  return {
    source: 'bar',
    stockId,
    portionsPerSale,
    available: row?.quantityOnHand ?? 0,
    tracked: true,
    unit: row?.unit ?? 'bottle',
  }
}

function unlinkedStockControlledLink(source: 'kitchen' | 'bar'): ResolvedOutletStockLink {
  return {
    source,
    stockId: '',
    portionsPerSale: 1,
    available: 0,
    tracked: true,
    unit: source === 'kitchen' ? 'portion' : 'bottle',
  }
}

export function resolveOutletItemStock(
  item: OutletMenuItemRow,
  department: OutletDepartmentKey,
  kitchenStock: KitchenStockItem[],
  barStock: BarStockItem[],
): ResolvedOutletStockLink {
  const source = effectiveStockSource(department, item)
  const storeControlled = isStoreControlledFnbOutlet(department)

  if (source === 'none') {
    return {
      source: 'kitchen',
      stockId: '',
      portionsPerSale: 0,
      available: Infinity,
      tracked: false,
      unit: 'portion',
    }
  }

  const parsed = parseMenuStockLink(item.service_code)
  if (parsed?.source === 'kitchen') {
    return kitchenLink(parsed.stockId, parsed.portionsPerSale, kitchenStock)
  }
  if (parsed && parsed.source === source) {
    return parsed.source === 'kitchen'
      ? kitchenLink(parsed.stockId, parsed.portionsPerSale, kitchenStock)
      : barLink(parsed.stockId, parsed.portionsPerSale, barStock)
  }

  if (source === 'kitchen') {
    const row = matchKitchenByName(item.name, kitchenStock)
    if (!row) {
      if (storeControlled) return unlinkedStockControlledLink('kitchen')
      return {
        source: 'kitchen',
        stockId: '',
        portionsPerSale: 1,
        available: Infinity,
        tracked: false,
        unit: 'portion',
      }
    }
    return {
      source: 'kitchen',
      stockId: row.id,
      portionsPerSale: 1,
      available: row.availablePortions,
      tracked: true,
      unit: 'portion',
    }
  }

  const row = matchBarByName(item.name, barStock)
  if (!row) {
    if (storeControlled) return unlinkedStockControlledLink('bar')
    return {
      source: 'bar',
      stockId: '',
      portionsPerSale: 1,
      available: Infinity,
      tracked: false,
      unit: 'bottle',
    }
  }
  return {
    source: 'bar',
    stockId: row.id,
    portionsPerSale: row.unitsPerSale,
    available: row.quantityOnHand,
    tracked: true,
    unit: row.unit,
  }
}

export function maxSellableQty(link: ResolvedOutletStockLink): number {
  if (!link.tracked || link.portionsPerSale <= 0) return Infinity
  return Math.floor(link.available / link.portionsPerSale)
}

/** Human-readable qty with unit for POS cards (e.g. "12 bottles", "0 portions"). */
export function formatOutletStockQtyDisplay(link: ResolvedOutletStockLink): string {
  const unit = pluralUnit(link.unit, link.available)
  if (!link.tracked) return `— ${unit}`
  return `${link.available} ${unit}`
}

export function isOutletItemOrderable(
  department: OutletDepartmentKey,
  link: ResolvedOutletStockLink,
): boolean {
  if (isStoreControlledFnbOutlet(department)) {
    if (!link.tracked || !link.stockId) return false
    return maxSellableQty(link) > 0
  }
  if (!link.tracked) return true
  return maxSellableQty(link) > 0
}

export function formatStockAvailabilityLabel(link: ResolvedOutletStockLink): string | null {
  if (!link.tracked) return null
  if (link.available <= 0) return `0 ${pluralUnit(link.unit, 0)}`
  return formatOutletStockQtyDisplay(link)
}
