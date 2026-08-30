import type { BarStockItem } from '@/lib/supply-chain/types'

export function canonicalBarStockId(storeItemId: string): string {
  return `bar-${storeItemId.trim()}`
}

function storeItemIdFromBarRow(row: BarStockItem): string | null {
  const fromField = String(row.storeItemId ?? '').trim()
  if (fromField) return fromField
  const id = String(row.id ?? '').trim()
  if (id.startsWith('bar-')) return id.slice(4).trim() || null
  return null
}

/** One bar row per central-store item; canonical id `bar:{storeItemId}`. */
export function normalizeBarStockRows(rows: BarStockItem[]): BarStockItem[] {
  const byStore = new Map<string, BarStockItem>()

  for (const row of rows) {
    const storeItemId = storeItemIdFromBarRow(row)
    if (!storeItemId) continue

    const existing = byStore.get(storeItemId)
    const qty = Math.max(0, Number(row.quantityOnHand) || 0)

    if (!existing) {
      byStore.set(storeItemId, {
        ...row,
        id: canonicalBarStockId(storeItemId),
        storeItemId,
        quantityOnHand: qty,
        unitsPerSale: Math.max(1, row.unitsPerSale || 1),
      })
      continue
    }

    byStore.set(storeItemId, {
      ...existing,
      name: row.name || existing.name,
      unit: row.unit || existing.unit,
      reorderLevel: Math.max(existing.reorderLevel, row.reorderLevel),
      unitsPerSale: Math.max(1, existing.unitsPerSale || row.unitsPerSale || 1),
      // Last row wins — avoid Math.max undoing a fresh physical count in the same batch.
      quantityOnHand: qty,
    })
  }

  return Array.from(byStore.values())
}

function resolveBarStockQty(
  localQty: number,
  remoteQty: number,
  opts?: {
    preferLocalWhenLower?: boolean
    preferLocalRecent?: boolean
    trustLocalBackup?: boolean
  },
): number {
  if (localQty === remoteQty) return localQty
  if (opts?.preferLocalRecent) return localQty
  if (opts?.trustLocalBackup && localQty > 0) return localQty
  if (localQty === 0 && remoteQty > 0) return remoteQty
  if (remoteQty === 0 && localQty > 0) return localQty
  if (opts?.preferLocalWhenLower && localQty < remoteQty) return localQty
  return remoteQty
}

/** Merge cloud + local bar stock — cloud is source of truth on refresh; local wins briefly after edits. */
export function mergeBarStockFromRemote(
  local: BarStockItem[],
  remote: BarStockItem[],
  opts?: {
    preferLocalWhenLower?: boolean
    preferLocalRecent?: boolean
    trustLocalBackup?: boolean
  },
): BarStockItem[] {
  const storeIds = new Set<string>()
  for (const row of [...local, ...remote]) {
    const id = storeItemIdFromBarRow(row)
    if (id) storeIds.add(id)
  }

  const merged: BarStockItem[] = []
  for (const storeItemId of storeIds) {
    const localMatches = local.filter(
      (b) => storeItemIdFromBarRow(b) === storeItemId,
    )
    const remoteMatches = remote.filter(
      (b) => storeItemIdFromBarRow(b) === storeItemId,
    )
    const pick = localMatches[0] ?? remoteMatches[0]
    if (!pick) continue

    const localQty = localMatches.reduce(
      (max, b) => Math.max(max, Math.max(0, Number(b.quantityOnHand) || 0)),
      0,
    )
    const remoteQty = remoteMatches.reduce(
      (max, b) => Math.max(max, Math.max(0, Number(b.quantityOnHand) || 0)),
      0,
    )
    const quantityOnHand =
      localMatches.length > 0 && remoteMatches.length > 0
        ? resolveBarStockQty(localQty, remoteQty, opts)
        : localMatches.length > 0
          ? localQty
          : remoteQty

    merged.push({
      ...pick,
      id: canonicalBarStockId(storeItemId),
      storeItemId,
      quantityOnHand,
      unitsPerSale: Math.max(
        1,
        ...localMatches.map((b) => b.unitsPerSale || 1),
        ...remoteMatches.map((b) => b.unitsPerSale || 1),
        1,
      ),
    })
  }

  return normalizeBarStockRows(merged)
}
