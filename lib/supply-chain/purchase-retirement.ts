import { convertToStoreUnitsWithFactors, mergeUnitFactors } from './unit-factor-storage'
import type { PurchaseOrder, RetirementLine, StoreItem } from './types'

export type RetirementStockReceipt = {
  lineId: string
  storeItemId: string
  stockQty: number
  stockUnitPrice: number
}

function lineNotBought(line: RetirementLine): boolean {
  return line.notBought === true || line.removed === true
}

function positiveFinite(value: number | undefined): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0
}

export function resolveRetirementStockReceipts(
  po: PurchaseOrder,
  lines: RetirementLine[],
  storeItems: StoreItem[],
): { ok: true; receipts: RetirementStockReceipt[] } | { error: string } {
  const itemsById = new Map(storeItems.map((item) => [item.id, item]))
  const receipts: RetirementStockReceipt[] = []

  for (const retirementLine of lines) {
    if (lineNotBought(retirementLine)) continue
    if (!positiveFinite(retirementLine.quantityBought)) {
      return { error: `Enter a bought quantity for ${retirementLine.name}` }
    }

    const poLine = po.lines.find((line) => line.id === retirementLine.lineId)
    if (!poLine) {
      return { error: `Cannot retire ${retirementLine.name} — PO line was not found` }
    }

    const storeItem = itemsById.get(poLine.stockItemId)
    if (!storeItem) {
      return { error: `Cannot retire ${retirementLine.name} — store item was not found` }
    }

    const storeUnit = poLine.storeUnit ?? storeItem.unit
    const stockQty = positiveFinite(retirementLine.stockQuantityBought)
      ? retirementLine.stockQuantityBought
      : positiveFinite(poLine.stockQuantityOrdered) && positiveFinite(poLine.quantityOrdered)
        ? (retirementLine.quantityBought / poLine.quantityOrdered) * poLine.stockQuantityOrdered
        : convertToStoreUnitsWithFactors(
            retirementLine.quantityBought,
            retirementLine.unit ?? poLine.unit,
            storeUnit,
            mergeUnitFactors(storeItem.id, storeItem.unit, storeItem.unitFactors),
          )

    if (!positiveFinite(stockQty)) {
      return {
        error: `Set pack size for ${retirementLine.name} (${retirementLine.unit ?? poLine.unit} → ${storeUnit}) before approving retirement`,
      }
    }

    const stockUnitPrice = positiveFinite(retirementLine.actualStockUnitPrice)
      ? retirementLine.actualStockUnitPrice
      : stockQty > 0
        ? retirementLine.totalPaid / stockQty
        : retirementLine.actualPrice

    if (!Number.isFinite(stockUnitPrice) || stockUnitPrice < 0) {
      return { error: `Enter a valid price for ${retirementLine.name}` }
    }

    receipts.push({
      lineId: retirementLine.lineId,
      storeItemId: poLine.stockItemId,
      stockQty,
      stockUnitPrice,
    })
  }

  return { ok: true, receipts }
}
