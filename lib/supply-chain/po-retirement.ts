import { normalizeMeasurementUnit } from './measurement-unit-core'
import type { PoLine, PurchaseOrder, RetirementLine, StoreItem } from './types'

export type RetirementStockCredit = {
  stockItemId: string
  stockQty: number
  stockUnitPrice: number
}

function isBoughtRetirementLine(line: RetirementLine): boolean {
  return line.notBought !== true && line.removed !== true && line.quantityBought > 0
}

function isPositiveFinite(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0
}

function sameUnit(a: string | undefined, b: string | undefined): boolean {
  if (!a || !b) return a === b
  return normalizeMeasurementUnit(a) === normalizeMeasurementUnit(b)
}

export function retirementStockQuantity(
  poLine: PoLine,
  line: RetirementLine,
): number | null {
  if (isPositiveFinite(line.stockQuantityBought)) return line.stockQuantityBought

  if (
    isPositiveFinite(poLine.stockQuantityOrdered) &&
    isPositiveFinite(poLine.quantityOrdered)
  ) {
    return (line.quantityBought / poLine.quantityOrdered) * poLine.stockQuantityOrdered
  }

  const purchaseUnit = line.unit ?? poLine.unit
  const storeUnit = line.storeUnit ?? poLine.storeUnit ?? poLine.unit
  if (sameUnit(purchaseUnit, storeUnit)) return line.quantityBought

  return null
}

export function validateRetirementStockCredits(
  po: PurchaseOrder,
  lines: RetirementLine[],
  storeItems: Pick<StoreItem, 'id'>[],
): { ok: true; credits: RetirementStockCredit[] } | { error: string } {
  const storeItemIds = new Set(storeItems.map((item) => item.id))
  const credits: RetirementStockCredit[] = []

  for (const line of lines) {
    if (!isBoughtRetirementLine(line)) continue

    const poLine = po.lines.find((candidate) => candidate.id === line.lineId)
    if (!poLine) {
      return {
        error: `Cannot accept retirement — purchase line "${line.name}" is missing from ${po.poNumber}.`,
      }
    }

    if (!storeItemIds.has(poLine.stockItemId)) {
      return {
        error: `Cannot accept retirement — "${poLine.name}" is no longer in the central store catalogue. Restore the item before accepting retirement.`,
      }
    }

    const stockQty = retirementStockQuantity(poLine, line)
    if (!isPositiveFinite(stockQty)) {
      return {
        error: `Cannot accept retirement — "${poLine.name}" is missing its store-unit conversion. Restore the PO quantity or pack size before accepting retirement.`,
      }
    }

    credits.push({
      stockItemId: poLine.stockItemId,
      stockQty,
      stockUnitPrice: line.totalPaid > 0 ? line.totalPaid / stockQty : line.actualPrice,
    })
  }

  return { ok: true, credits }
}
