import {
  batchRecipeMaterialLines,
  type KitchenMaterialStockLine,
} from '@/lib/supply-chain/kitchen-material-units'
import type { Recipe, StoreItem } from '@/lib/supply-chain/types'
import type { StockShortageLine } from '@/lib/ui/stock-shortage-dialog'

export function batchMaterialLines(
  recipe: Recipe | undefined,
  portions: number,
  getStoreItem?: (storeItemId: string) => Pick<StoreItem, 'unit' | 'lastPrice' | 'unitFactors'> | undefined,
): KitchenMaterialStockLine[] {
  return batchRecipeMaterialLines(recipe, portions, getStoreItem)
}

export function batchMaterialShortages(
  recipe: Recipe | undefined,
  portions: number,
  getOnHand: (storeItemId: string) => number,
  getStoreItem?: (storeItemId: string) => Pick<StoreItem, 'unit' | 'lastPrice' | 'unitFactors'> | undefined,
): StockShortageLine[] {
  const shortages: StockShortageLine[] = []
  for (const line of batchMaterialLines(recipe, portions, getStoreItem)) {
    if (line.quantity <= 0) continue
    const onHand = getOnHand(line.storeItemId)
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
