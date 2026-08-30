import { outletStockSlug } from '@/lib/outlets/outlet-stock-slug'
import type { OutletMenuItemRow } from '@/lib/outlets/types'
import { isKitchenSyncedMenuItem, kitchenStockIdFromServiceCode } from '@/lib/supply-chain/kitchen-menu-link'
import { visibleKitchenStock, visibleRecipes } from '@/lib/supply-chain/kitchen-sync-merge'
import type { KitchenStockItem, Recipe } from '@/lib/supply-chain/types'

/** Resolve batch standard id from a finished-stock / menu service_code id. */
export function recipeIdForKitchenStockId(
  recipes: Recipe[],
  kitchenStockId: string,
  stock: KitchenStockItem[] = [],
): string | undefined {
  const linked = stock.find((k) => k.id === kitchenStockId)?.linkedRecipeId
  if (linked) return linked
  const bySlug = recipes.find((r) => kitchenStockIdForRecipe(r) === kitchenStockId)
  return bySlug?.id
}

/** Default finished-stock row id for a batch standard name. */
export function kitchenStockIdForBatchName(batchName: string): string {
  return `ks-${outletStockSlug(batchName)}`
}

export function kitchenStockIdForRecipe(recipe: Recipe): string {
  return kitchenStockIdForBatchName(recipe.name)
}

/** Restaurant / Main Bar POS — hide kitchen-synced dishes whose batch standard was removed. */
export function filterOutletMenuForActiveKitchenBatches(
  items: OutletMenuItemRow[],
  department: string,
  recipes: Recipe[],
  stock: KitchenStockItem[] = [],
): OutletMenuItemRow[] {
  if (department !== 'restaurant' && department !== 'main_bar') return items
  return items.filter((it) => {
    if (!isKitchenSyncedMenuItem(it.service_code)) return true
    return isKitchenMenuItemForActiveBatch(it.service_code, recipes, stock)
  })
}

/** Finished stock row belongs to an active batch standard in All Batches. */
export function kitchenStockMatchesActiveRecipe(
  stock: KitchenStockItem,
  activeRecipes: Recipe[],
): boolean {
  const nameNorm = stock.name.trim().toLowerCase()
  for (const recipe of activeRecipes) {
    if (stock.linkedRecipeId === recipe.id) return true
    if (stock.id === kitchenStockIdForRecipe(recipe)) return true
    if (nameNorm === recipe.name.trim().toLowerCase()) return true
  }
  return false
}

/** Kitchen stock ids that may appear on Finished Menu / Restaurant for active batches. */
export function kitchenStockIdsForActiveRecipes(
  recipes: Recipe[],
  stock: KitchenStockItem[] = [],
): Set<string> {
  const active = visibleRecipes(recipes)
  const ids = new Set<string>()
  for (const recipe of active) {
    ids.add(kitchenStockIdForRecipe(recipe))
  }
  for (const row of visibleKitchenStock(stock)) {
    if (kitchenStockMatchesActiveRecipe(row, active)) {
      ids.add(row.id)
    }
  }
  return ids
}

/** Finished Menu rows — only those tied to a batch standard in All Batches. */
export function kitchenStockForActiveBatchStandards(
  recipes: Recipe[],
  stock: KitchenStockItem[],
): KitchenStockItem[] {
  const active = visibleRecipes(recipes)
  return visibleKitchenStock(stock).filter((k) =>
    kitchenStockMatchesActiveRecipe(k, active),
  )
}

/** Restaurant menu row synced from kitchen — only when batch still exists in All Batches. */
export function isKitchenMenuItemForActiveBatch(
  serviceCode: string | null | undefined,
  recipes: Recipe[],
  stock: KitchenStockItem[] = [],
): boolean {
  const ksId = kitchenStockIdFromServiceCode(serviceCode)
  if (!ksId) return true
  return kitchenStockIdsForActiveRecipes(recipes, stock).has(ksId)
}

/** Tombstone finished-stock rows with no matching batch standard (persisted for cloud merge). */
export function reconcileKitchenStockWithRecipes(
  recipes: Recipe[],
  stock: KitchenStockItem[],
): { stock: KitchenStockItem[]; changed: boolean } {
  const active = visibleRecipes(recipes)
  const now = new Date().toISOString()
  let changed = false
  const next = stock.map((k) => {
    if (k.deletedAt) return k
    if (kitchenStockMatchesActiveRecipe(k, active)) return k
    changed = true
    return { ...k, deletedAt: now }
  })
  return { stock: next, changed }
}
