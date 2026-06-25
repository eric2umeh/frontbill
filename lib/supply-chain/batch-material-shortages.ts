import type { Recipe } from '@/lib/supply-chain/types'
import type { StockShortageLine } from '@/lib/ui/stock-shortage-dialog'

export function batchMaterialLines(
  recipe: Recipe | undefined,
  portions: number,
): Array<{ storeItemId: string; name: string; unit: string; quantity: number; source: 'raw' | 'kitchen_stock' }> {
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
  getOnHand: (stockItemId: string, source: 'raw' | 'kitchen_stock') => number,
): StockShortageLine[] {
  const shortages: StockShortageLine[] = []
  for (const line of batchMaterialLines(recipe, portions)) {
    if (line.quantity <= 0) continue
    const onHand = getOnHand(line.storeItemId, line.source)
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
