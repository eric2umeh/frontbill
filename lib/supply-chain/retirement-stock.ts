import type { PurchaseOrder, RetirementLine, StoreItem } from '@/lib/supply-chain/types'
import { applyStoreItemDeptFields, normalizeSupplyDept } from '@/lib/supply-chain/types'

function nameKey(name: string) {
  return name.trim().toLowerCase().replace(/\s+/g, ' ')
}

/** Add retired market qty onto the central-store catalogue (match id, then name, else create). */
export function applyRetirementLinesToCatalog(
  items: StoreItem[],
  po: PurchaseOrder,
  lines: RetirementLine[],
): { next: StoreItem[]; posted: number } {
  const next = items.map((s) => ({ ...s }))
  let posted = 0

  for (const rl of lines) {
    const notBought = rl.notBought === true || rl.removed === true
    if (notBought || rl.quantityBought <= 0) continue
    const pl = po.lines.find((l) => l.id === rl.lineId)
    const stockQty =
      rl.stockQuantityBought ??
      (pl?.stockQuantityOrdered && pl.quantityOrdered > 0
        ? (rl.quantityBought / pl.quantityOrdered) * pl.stockQuantityOrdered
        : rl.quantityBought)
    if (!Number.isFinite(stockQty) || stockQty <= 0) continue
    const stockUnitPrice =
      rl.actualStockUnitPrice ??
      (stockQty > 0 ? rl.totalPaid / stockQty : rl.actualPrice)

    const stockId = pl?.stockItemId?.trim() || ''
    let idx = stockId ? next.findIndex((s) => s.id === stockId) : -1
    if (idx < 0) {
      const key = nameKey(pl?.name || rl.name)
      if (key) idx = next.findIndex((s) => nameKey(s.name) === key)
    }

    if (idx >= 0) {
      next[idx] = {
        ...next[idx],
        quantityInStore: next[idx].quantityInStore + stockQty,
        lastPrice: Number.isFinite(stockUnitPrice) ? stockUnitPrice : next[idx].lastPrice,
      }
      posted += 1
      continue
    }

    const id =
      stockId ||
      `st-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
    const unit = pl?.storeUnit || pl?.unit || rl.storeUnit || rl.unit || 'pcs'
    const dept = pl?.dept ? normalizeSupplyDept(pl.dept) : 'restaurant'
    const price = Number.isFinite(stockUnitPrice) ? stockUnitPrice : 0
    next.push(
      applyStoreItemDeptFields({
        id,
        name: (pl?.name || rl.name).trim() || 'Stock item',
        unit,
        dept,
        quantityInStore: stockQty,
        reorderLevel: 0,
        lastPrice: price,
        benchmarkPrice: price,
      }),
    )
    posted += 1
  }

  return { next, posted }
}
