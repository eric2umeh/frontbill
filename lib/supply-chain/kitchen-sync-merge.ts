import type { KitchenStockItem, ProductionBatch, Recipe } from '@/lib/supply-chain/types'
import { mergeSnapshotRowsById } from '@/lib/supply-chain/snapshot-merge'

function tombstoneMs(iso: string | undefined): number {
  if (!iso) return 0
  const ms = Date.parse(iso)
  return Number.isFinite(ms) ? ms : 0
}

function batchTieBreaker(b: ProductionBatch): number {
  const deleted = b.deletedAt ? Date.parse(b.deletedAt) : 0
  const closed = b.closedAt ? Date.parse(b.closedAt) : 0
  const opened = b.openedAt ? Date.parse(b.openedAt) : 0
  return Math.max(deleted, closed, opened)
}

function batchRank(b: ProductionBatch | undefined): number {
  if (!b) return -1
  if (b.deletedAt) return 20
  return b.status === 'in_progress' ? 10 : 5
}

/** Prefer tombstone / newer clock so deleted in-progress runs stay deleted after sync. */
export function preferProductionBatch(a: ProductionBatch, b: ProductionBatch): ProductionBatch {
  const aDel = a.deletedAt ? Date.parse(a.deletedAt) : 0
  const bDel = b.deletedAt ? Date.parse(b.deletedAt) : 0
  const aDelMs = Number.isFinite(aDel) ? aDel : 0
  const bDelMs = Number.isFinite(bDel) ? bDel : 0
  if (aDelMs || bDelMs) {
    if (aDelMs !== bDelMs) return aDelMs > bDelMs ? a : b
    if (a.deletedAt && !b.deletedAt) return a
    if (b.deletedAt && !a.deletedAt) return b
  }

  const ar = batchRank(a)
  const br = batchRank(b)
  if (ar > br) return a
  if (br > ar) return b
  return batchTieBreaker(a) >= batchTieBreaker(b) ? a : b
}

export function isProductionBatchDeleted(batch: ProductionBatch | undefined): boolean {
  return Boolean(batch?.deletedAt)
}

export function visibleProductionBatches(batches: ProductionBatch[]): ProductionBatch[] {
  return batches.filter((b) => !isProductionBatchDeleted(b))
}

/** Merge org production runs with in-memory state — never drop an in-progress run unless tombstoned. */
export function mergeProductionBatchesFromRemote(
  local: ProductionBatch[],
  remote: ProductionBatch[],
): ProductionBatch[] {
  const localById = new Map(local.map((b) => [b.id, b]))
  const remoteById = new Map(remote.map((b) => [b.id, b]))
  const ids = new Set([...localById.keys(), ...remoteById.keys()])

  const merged: ProductionBatch[] = []
  for (const id of ids) {
    const l = localById.get(id)
    const r = remoteById.get(id)
    if (!l) {
      if (r) merged.push(r)
      continue
    }
    if (!r) {
      merged.push(l)
      continue
    }
    merged.push(preferProductionBatch(l, r))
  }

  return merged.sort((a, b) => (b.openedAt || '').localeCompare(a.openedAt || ''))
}

export function isRecipeDeleted(recipe: Recipe | undefined): boolean {
  return Boolean(recipe?.deletedAt)
}

export function visibleRecipes(recipes: Recipe[]): Recipe[] {
  return recipes.filter((r) => !isRecipeDeleted(r))
}

function recipeUpdatedAtMs(recipe: Recipe | undefined): number {
  if (!recipe?.updatedAt) return 0
  const ms = Date.parse(recipe.updatedAt)
  return Number.isFinite(ms) ? ms : 0
}

/** Prefer tombstone / newer updatedAt so deleted batch standards stay deleted after sync. */
export function preferRecipe(a: Recipe, b: Recipe): Recipe {
  const aDel = tombstoneMs(a.deletedAt)
  const bDel = tombstoneMs(b.deletedAt)
  if (aDel || bDel) {
    if (aDel !== bDel) return aDel > bDel ? a : b
    if (a.deletedAt && !b.deletedAt) return a
    if (b.deletedAt && !a.deletedAt) return b
  }
  const lt = recipeUpdatedAtMs(a)
  const rt = recipeUpdatedAtMs(b)
  if (rt > lt) return b
  if (lt > rt) return a
  return a
}

/**
 * Merge org batch standards with in-memory state — tombstones win over stale remote rows.
 */
export function mergeRecipesFromRemote(local: Recipe[], remote: Recipe[]): Recipe[] {
  if (local.length === 0) return remote
  if (remote.length === 0) return local

  const localById = new Map(local.map((r) => [r.id, r]))
  const remoteById = new Map(remote.map((r) => [r.id, r]))
  const ids = new Set([...localById.keys(), ...remoteById.keys()])
  const merged: Recipe[] = []

  for (const id of ids) {
    const l = localById.get(id)
    const r = remoteById.get(id)
    if (!l) {
      if (r) merged.push(r)
      continue
    }
    if (!r) {
      merged.push(l)
      continue
    }
    merged.push(preferRecipe(l, r))
  }

  return merged
}

export function isKitchenStockDeleted(item: KitchenStockItem | undefined): boolean {
  return Boolean(item?.deletedAt)
}

export function visibleKitchenStock(items: KitchenStockItem[]): KitchenStockItem[] {
  return items.filter((k) => !isKitchenStockDeleted(k))
}

export function preferKitchenStock(a: KitchenStockItem, b: KitchenStockItem): KitchenStockItem {
  const aDel = tombstoneMs(a.deletedAt)
  const bDel = tombstoneMs(b.deletedAt)
  if (aDel || bDel) {
    if (aDel !== bDel) return aDel > bDel ? a : b
    if (a.deletedAt && !b.deletedAt) return a
    if (b.deletedAt && !a.deletedAt) return b
  }
  return a
}

function kitchenStockQty(item: KitchenStockItem): number {
  return Math.max(0, Number(item.availablePortions) || 0)
}

/** Merge one finished-stock row — cloud counts from Kitchen reach outlet POS readers. */
export function mergeKitchenStockPair(
  local: KitchenStockItem,
  remote: KitchenStockItem,
  opts?: { preferLocalRecent?: boolean },
): KitchenStockItem {
  const aDel = tombstoneMs(local.deletedAt)
  const bDel = tombstoneMs(remote.deletedAt)
  if (aDel || bDel) {
    return preferKitchenStock(local, remote)
  }

  const lQty = kitchenStockQty(local)
  const rQty = kitchenStockQty(remote)
  if (lQty === rQty) return local

  if (opts?.preferLocalRecent) return local
  if (lQty === 0 && rQty > 0) return remote
  if (rQty === 0 && lQty > 0) return local
  return remote
}

/** Merge finished / prep stock — tombstones stay local; qty follows cloud unless this device just edited. */
export function mergeKitchenStockFromRemote(
  local: KitchenStockItem[],
  remote: KitchenStockItem[],
  opts?: { preferLocalRecent?: boolean },
): KitchenStockItem[] {
  if (local.length === 0) return remote
  if (remote.length === 0) return local

  const localById = new Map(local.map((k) => [k.id, k]))
  const remoteById = new Map(remote.map((k) => [k.id, k]))
  const ids = new Set([...localById.keys(), ...remoteById.keys()])
  const merged: KitchenStockItem[] = []

  for (const id of ids) {
    const l = localById.get(id)
    const r = remoteById.get(id)
    if (!l) {
      if (r) merged.push(r)
      continue
    }
    if (!r) {
      merged.push(l)
      continue
    }
    merged.push(mergeKitchenStockPair(l, r, opts))
  }

  return merged
}

/** @deprecated Prefer mergeRecipesFromRemote — kept for callers that only need id merge. */
export function mergeRecipesByIdPreferLocal(local: Recipe[], remote: Recipe[]): Recipe[] {
  return mergeSnapshotRowsById(remote, local)
}
