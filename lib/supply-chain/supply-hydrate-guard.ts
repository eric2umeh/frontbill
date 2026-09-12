import { type SupplySnapshotKey } from '@/lib/supply-chain/supply-db-mappers'

/** Snapshot keys where an empty PUT would wipe live hotel inventory / history. */
export const PROTECTED_SUPPLY_SNAPSHOT_KEYS = [
  'recipes',
  'batches',
  'kitchen_stock',
  'kitchen_raw_stock',
  'bar_stock',
  'fnb_raw_stock',
  'fnb_daily_sheets',
  'fnb_movements',
  'purchase_orders',
  'issue_out_log',
  'activity_log',
  'pending_items',
] as const satisfies readonly SupplySnapshotKey[]

const PROTECTED_KEY_SET = new Set<string>(PROTECTED_SUPPLY_SNAPSHOT_KEYS)

/** Basket empty must still win (clear cart / post-send). */
export function isProtectedSupplySnapshotKey(key: string): boolean {
  return PROTECTED_KEY_SET.has(key)
}

export function allowSupplySnapshotPersist(snapshotLoadOk: boolean): boolean {
  return snapshotLoadOk
}

export function allowSupplyCatalogSync(catalogLoadOk: boolean): boolean {
  return catalogLoadOk
}

/**
 * Catch-up upload after hydrate: local longer than remote only when GET succeeded.
 * A failed GET must not be treated as an empty cloud.
 */
export function shouldCatchupUploadAfterHydrate(input: {
  snapshotLoadOk: boolean
  localLen: number
  remoteLen: number
}): boolean {
  if (!input.snapshotLoadOk) return false
  return input.localLen > input.remoteLen
}

/** Recover local catalogue only when GET succeeded and cloud is empty. */
export function shouldRecoverLocalCatalogToCloud(input: {
  catalogLoadOk: boolean
  remoteCatalogLen: number
  localCatalogLen: number
}): boolean {
  return (
    input.catalogLoadOk &&
    input.remoteCatalogLen === 0 &&
    input.localCatalogLen > 0
  )
}

/**
 * Skip writing [] over an existing non-empty snapshot.
 * Empty incoming on a missing/empty row is allowed (new hotel).
 */
export function shouldSkipEmptySnapshotOverwrite(
  key: string,
  incoming: unknown,
  existing: unknown,
): boolean {
  if (!isProtectedSupplySnapshotKey(key)) return false
  if (!Array.isArray(incoming) || incoming.length > 0) return false
  return Array.isArray(existing) && existing.length > 0
}

