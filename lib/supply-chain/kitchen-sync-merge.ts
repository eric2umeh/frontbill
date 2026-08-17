import type { ProductionBatch, Recipe } from '@/lib/supply-chain/types'
import { mergeSnapshotRowsById } from '@/lib/supply-chain/snapshot-merge'

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
      if (r && !isProductionBatchDeleted(r)) merged.push(r)
      continue
    }
    if (!r) {
      if (!isProductionBatchDeleted(l)) merged.push(l)
      continue
    }
    const picked = preferProductionBatch(l, r)
    if (!isProductionBatchDeleted(picked)) merged.push(picked)
  }

  return merged.sort((a, b) => (b.openedAt || '').localeCompare(a.openedAt || ''))
}

function recipeUpdatedAtMs(recipe: Recipe | undefined): number {
  if (!recipe?.updatedAt) return 0
  const ms = Date.parse(recipe.updatedAt)
  return Number.isFinite(ms) ? ms : 0
}

/**
 * Prefer the newer recipe (by updatedAt) for shared ids.
 * Remote-only / local-only rows are kept. When timestamps tie or are missing,
 * prefer local so in-progress edits are not wiped by a stale poll.
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
    const lt = recipeUpdatedAtMs(l)
    const rt = recipeUpdatedAtMs(r)
    if (rt > lt) merged.push(r)
    else merged.push(l)
  }

  return merged
}

/** @deprecated Prefer mergeRecipesFromRemote — kept for callers that only need id merge. */
export function mergeRecipesByIdPreferLocal(local: Recipe[], remote: Recipe[]): Recipe[] {
  return mergeSnapshotRowsById(remote, local)
}
