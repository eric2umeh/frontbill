import { outletStockSlug } from '@/lib/outlets/outlet-stock-slug'
import type { KitchenStockItem, Recipe } from './types'

export function resolveKitchenBatchIdentity({
  batchName,
  requestedKitchenStockId,
  recipes,
  kitchenStock,
}: {
  batchName: string
  requestedKitchenStockId?: string
  recipes: Recipe[]
  kitchenStock: KitchenStockItem[]
}): { recipeId: string; kitchenStockId: string } {
  const slug = outletStockSlug(batchName)
  const slugRecipeId = `rcp-${slug}`
  const slugKitchenStockId = `ks-${slug}`
  const existingRecipe = recipes.find(
    (recipe) => recipe.id === slugRecipeId || recipe.name === batchName,
  )
  const recipeId = existingRecipe?.id ?? slugRecipeId
  const linkedKitchenRow = kitchenStock.find((item) => item.linkedRecipeId === recipeId)
  const namedKitchenRow = kitchenStock.find(
    (item) => item.id === slugKitchenStockId || item.name === batchName,
  )

  return {
    recipeId,
    kitchenStockId:
      linkedKitchenRow?.id ??
      requestedKitchenStockId?.trim() ??
      namedKitchenRow?.id ??
      slugKitchenStockId,
  }
}
