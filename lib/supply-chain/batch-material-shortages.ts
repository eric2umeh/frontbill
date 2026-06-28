import type { Recipe } from '@/lib/supply-chain/types'
import { normalizeMeasurementUnit } from '@/lib/supply-chain/measurement-unit-core'
import { convertQtyBetweenUnits } from '@/lib/supply-chain/recipe-units'
import type { StockShortageLine } from '@/lib/ui/stock-shortage-dialog'

type MaterialSource = 'raw' | 'kitchen_stock'
type MaterialStockOnHand = number | { quantity: number; unit?: string | null }

export function batchMaterialLines(
  recipe: Recipe | undefined,
  portions: number,
): Array<{ storeItemId: string; name: string; unit: string; quantity: number; source: MaterialSource }> {
  if (!recipe || !Number.isFinite(portions) || portions <= 0) return []
  const scale = recipe.yieldPortions > 0 ? portions / recipe.yieldPortions : 1
  return recipe.ingredients
    .filter((ing) => !ing.optional)
    .map((ing) => ({
      storeItemId: ing.stockItemId,
      name: ing.name,
      unit: ing.unit,
      quantity: Math.round(ing.quantity * scale * 1000) / 1000,
      source: ing.source ?? 'raw',
    }))
}

export function convertMaterialQuantity(
  quantity: number,
  fromUnit: string | undefined | null,
  toUnit: string | undefined | null,
): number {
  if (!Number.isFinite(quantity) || quantity <= 0) return 0
  const from = normalizeMeasurementUnit(fromUnit ?? '')
  const to = normalizeMeasurementUnit(toUnit ?? '')
  if (from === to) return quantity
  return convertQtyBetweenUnits(quantity, from, to) ?? quantity
}

export function materialLineQuantityInStockUnit(
  line: { unit: string; quantity: number },
  stockUnit: string | undefined | null,
): number {
  return Math.round(convertMaterialQuantity(line.quantity, line.unit, stockUnit ?? line.unit) * 1000) / 1000
}

function normalizeOnHand(onHand: MaterialStockOnHand, fallbackUnit: string) {
  if (typeof onHand === 'number') {
    return { quantity: onHand, unit: fallbackUnit }
  }
  return {
    quantity: Number.isFinite(onHand.quantity) ? onHand.quantity : 0,
    unit: onHand.unit ?? fallbackUnit,
  }
}

export function batchMaterialShortages(
  recipe: Recipe | undefined,
  portions: number,
  getOnHand: (stockItemId: string, source: MaterialSource) => MaterialStockOnHand,
): StockShortageLine[] {
  const shortages: StockShortageLine[] = []
  for (const line of batchMaterialLines(recipe, portions)) {
    if (line.quantity <= 0) continue
    const stock = normalizeOnHand(getOnHand(line.storeItemId, line.source), line.unit)
    const onHand = convertMaterialQuantity(stock.quantity, stock.unit, line.unit)
    if (onHand < line.quantity) {
      shortages.push({
        name: line.name,
        need: line.quantity,
        onHand,
        unit: line.unit,
      })
    }
  }
  return shortages
}
