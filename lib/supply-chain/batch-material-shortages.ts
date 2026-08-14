import type { Recipe } from './types'
import type { StockShortageLine } from '../ui/stock-shortage-dialog'
import {
  convertToStoreUnitsWithFactors,
  type UnitFactorMap,
} from './unit-factor-storage'

export type BatchOnHandLookup = {
  quantity: number
  unit: string
  factors?: UnitFactorMap
}

export type BatchMaterialNeed = {
  storeItemId: string
  name: string
  source: 'raw' | 'kitchen_stock'
  recipeQuantity: number
  recipeUnit: string
  /** Qty in on-hand / catalogue units. Null when g/kg/ml/l (or pack factor) cannot convert. */
  stockQuantity: number | null
  stockUnit: string
  onHand: number
}

export function recipeQtyInStockUnits(
  qty: number,
  recipeUnit: string,
  stockUnit: string,
  factors?: UnitFactorMap,
): number | null {
  if (!Number.isFinite(qty)) return null
  const converted = convertToStoreUnitsWithFactors(
    qty,
    recipeUnit,
    stockUnit,
    factors,
  )
  if (converted == null) return null
  return Math.round(converted * 1000) / 1000
}

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

export function batchMaterialNeeds(
  recipe: Recipe | undefined,
  portions: number,
  getOnHand: (stockItemId: string, source: 'raw' | 'kitchen_stock') => BatchOnHandLookup,
): BatchMaterialNeed[] {
  return batchMaterialLines(recipe, portions).map((line) => {
    const lookup = getOnHand(line.storeItemId, line.source)
    const stockUnit = lookup.unit || line.unit
    return {
      storeItemId: line.storeItemId,
      name: line.name,
      source: line.source,
      recipeQuantity: line.quantity,
      recipeUnit: line.unit,
      stockQuantity: recipeQtyInStockUnits(
        line.quantity,
        line.unit,
        stockUnit,
        lookup.factors,
      ),
      stockUnit,
      onHand: lookup.quantity,
    }
  })
}

export function batchMaterialShortages(
  recipe: Recipe | undefined,
  portions: number,
  getOnHand: (stockItemId: string, source: 'raw' | 'kitchen_stock') => BatchOnHandLookup,
): StockShortageLine[] {
  const shortages: StockShortageLine[] = []
  for (const need of batchMaterialNeeds(recipe, portions, getOnHand)) {
    if (need.recipeQuantity <= 0) continue
    if (need.stockQuantity == null) {
      shortages.push({
        name: `${need.name} (convert ${need.recipeUnit} → ${need.stockUnit || 'stock unit'})`,
        need: need.recipeQuantity,
        onHand: need.onHand,
        unit: need.recipeUnit,
      })
      continue
    }
    if (need.onHand < need.stockQuantity) {
      shortages.push({
        name: need.name,
        need: need.stockQuantity,
        onHand: need.onHand,
        unit: need.stockUnit,
      })
    }
  }
  return shortages
}
