import type { Recipe } from '@/lib/supply-chain/types'
import {
  resolveBatchMaterialStockUsage,
  type BatchMaterialSource,
  type BatchMaterialStockSnapshot,
} from '@/lib/supply-chain/batch-material-usage'
import type { StockShortageLine } from '@/lib/ui/stock-shortage-dialog'

export function batchMaterialLines(
  recipe: Recipe | undefined,
  portions: number,
): Array<{ storeItemId: string; name: string; unit: string; quantity: number; source: BatchMaterialSource }> {
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

export function batchMaterialShortages(
  recipe: Recipe | undefined,
  portions: number,
  getStock: (stockItemId: string, source: BatchMaterialSource) => number | BatchMaterialStockSnapshot | undefined,
): StockShortageLine[] {
  const shortages: StockShortageLine[] = []
  for (const line of batchMaterialLines(recipe, portions)) {
    if (line.quantity <= 0) continue
    const stockValue = getStock(line.storeItemId, line.source)
    const stock =
      typeof stockValue === 'number'
        ? { quantityOnHand: stockValue, unit: line.unit }
        : stockValue
    const usage = resolveBatchMaterialStockUsage(line, stock)
    if (!usage || usage.onHand < usage.quantity) {
      shortages.push({
        name: line.name,
        need: usage?.quantity ?? line.quantity,
        onHand: usage?.onHand ?? stock?.quantityOnHand ?? 0,
        unit: usage?.unit ?? line.unit,
      })
    }
  }
  return shortages
}
