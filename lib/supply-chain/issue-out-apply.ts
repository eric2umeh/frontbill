import {
  canonicalBarStockId,
  normalizeBarStockRows,
} from './bar-stock-normalize'
import type { BarStockItem, KitchenRawStockItem } from './types'

/** Fields issue-out needs from a central-store row. */
export type IssueStoreStock = {
  id: string
  name: string
  unit: string
  reorderLevel: number
  quantityInStore: number
}

/**
 * Run cloud snapshot writes one at a time.
 * A multi-line issue used to fire a full-array PUT per line; a slower first
 * line could land last and wipe the later lines' quantities.
 */
export function createSnapshotWriteQueue() {
  let chain: Promise<unknown> = Promise.resolve()
  return function enqueue<T>(job: () => Promise<T>): Promise<T> {
    const run = chain.then(job, job)
    chain = run.then(
      () => undefined,
      () => undefined,
    )
    return run
  }
}

export function decrementStoreOnHand<T extends { id: string; quantityInStore: number }>(
  items: T[],
  storeItemId: string,
  qty: number,
): T[] {
  return items.map((item) =>
    item.id === storeItemId
      ? { ...item, quantityInStore: item.quantityInStore - qty }
      : item,
  )
}

/** Add issued qty onto the main-bar snapshot row for this store item. */
export function creditBarStockOnIssue(
  rows: BarStockItem[],
  store: Pick<IssueStoreStock, 'id' | 'name' | 'unit' | 'reorderLevel'>,
  qty: number,
): BarStockItem[] {
  const next = normalizeBarStockRows(rows)
  const canonicalId = canonicalBarStockId(store.id)
  const idx = next.findIndex(
    (row) => row.storeItemId === store.id || row.id === canonicalId,
  )
  if (idx >= 0) {
    return normalizeBarStockRows(
      next.map((row, index) =>
        index === idx
          ? {
              ...row,
              id: canonicalId,
              storeItemId: store.id,
              name: store.name,
              unit: store.unit,
              quantityOnHand: row.quantityOnHand + qty,
              unitsPerSale: Math.max(1, row.unitsPerSale || 1),
            }
          : row,
      ),
    )
  }
  return normalizeBarStockRows([
    ...next,
    {
      id: canonicalId,
      storeItemId: store.id,
      name: store.name,
      quantityOnHand: qty,
      reorderLevel: store.reorderLevel,
      unitsPerSale: 1,
      unit: store.unit,
    },
  ])
}

/** Add issued qty onto the kitchen raw snapshot row for this store item. */
export function creditKitchenRawOnIssue(
  rows: KitchenRawStockItem[],
  store: Pick<IssueStoreStock, 'id' | 'name' | 'unit' | 'reorderLevel'>,
  qty: number,
): KitchenRawStockItem[] {
  const idx = rows.findIndex((row) => row.storeItemId === store.id)
  if (idx >= 0) {
    return rows.map((row, index) =>
      index === idx ? { ...row, quantityOnHand: row.quantityOnHand + qty } : row,
    )
  }
  return [
    ...rows,
    {
      id: `kraw-${store.id}`,
      storeItemId: store.id,
      name: store.name,
      quantityOnHand: qty,
      reorderLevel: store.reorderLevel,
      unit: store.unit,
    },
  ]
}
