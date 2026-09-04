import type { KitchenRawStockItem } from '@/lib/supply-chain/types'

export type KitchenCatalogSeed = {
  id: string
  name: string
  unit: string
  reorderLevel?: number
}

/**
 * Align kitchen raw rows with the kitchen catalogue.
 * Empty catalogue is fail-closed: never drop existing on-hand (catalog GET can
 * fail independently of snapshot GET and would otherwise persist zeros).
 */
export function applyKitchenCatalogToRawStock(
  prev: KitchenRawStockItem[],
  kitchenItems: KitchenCatalogSeed[],
): {
  next: KitchenRawStockItem[]
  changed: boolean
  skipped: 'empty_catalog' | null
} {
  if (!kitchenItems.length) {
    return { next: prev, changed: false, skipped: 'empty_catalog' }
  }

  const kitchenIds = new Set(kitchenItems.map((s) => s.id))
  const next = prev.filter((k) => kitchenIds.has(k.storeItemId))
  let changed = next.length !== prev.length
  const existingIds = new Set(next.map((row) => row.storeItemId))

  for (const store of kitchenItems) {
    if (existingIds.has(store.id)) continue
    next.push({
      id: `kraw-${store.id}`,
      storeItemId: store.id,
      name: store.name,
      quantityOnHand: 0,
      reorderLevel: Math.max(0, store.reorderLevel ?? 0),
      unit: store.unit,
    })
    changed = true
  }

  return { next: changed ? next : prev, changed, skipped: null }
}
