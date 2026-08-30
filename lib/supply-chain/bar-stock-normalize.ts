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
      name: existing.name || row.name,
      unit: existing.unit || row.unit,
      reorderLevel: Math.max(existing.reorderLevel, row.reorderLevel),
      unitsPerSale: Math.max(1, existing.unitsPerSale || row.unitsPerSale || 1),
      quantityOnHand: Math.max(existing.quantityOnHand, qty),
    })
  }

  return Array.from(byStore.values())
}

/** Merge cloud + local bar stock — use the higher on-hand count when both exist (multi-user POS). */
export function mergeBarStockFromRemote(
  local: BarStockItem[],
  remote: BarStockItem[],
  opts?: { preferLocalWhenLower?: boolean },
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
        ? localQty === 0 && remoteQty > 0 && !opts?.preferLocalWhenLower
          ? remoteQty
          : opts?.preferLocalWhenLower && localQty < remoteQty
            ? localQty
            : Math.max(localQty, remoteQty)
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
