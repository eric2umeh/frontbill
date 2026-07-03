import type { ProductionBatch, Recipe } from '@/lib/supply-chain/types'
import { mergeSnapshotRowsById } from '@/lib/supply-chain/snapshot-merge'

function batchTieBreaker(b: ProductionBatch): number {
  const closed = b.closedAt ? Date.parse(b.closedAt) : 0
  const opened = b.openedAt ? Date.parse(b.openedAt) : 0
  return Math.max(closed, opened)
}

function batchRank(b: ProductionBatch | undefined): number {
  if (!b) return -1
  return b.status === 'in_progress' ? 10 : 5
}

/** Merge org production runs with in-memory state — never drop an in-progress run. */
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

    const lr = batchRank(l)
    const rr = batchRank(r)
    if (lr > rr) merged.push(l)
    else if (rr > lr) merged.push(r)
    else merged.push(batchTieBreaker(l) >= batchTieBreaker(r) ? l : r)
  }

  return merged.sort((a, b) => (b.openedAt || '').localeCompare(a.openedAt || ''))
}

/** Admin-created batch standards visible to kitchen staff after poll/hydrate. */
export function mergeRecipesFromRemote(local: Recipe[], remote: Recipe[]): Recipe[] {
  if (local.length === 0) return remote
  if (remote.length === 0) return local
  return mergeSnapshotRowsById(local, remote)
}
