import type {
  BatchMaterialLine,
  Recipe,
  RecipeIngredient,
  StoreItem,
} from './types'
import { convertToStoreUnitsWithFactors } from './unit-factor-storage'

type StoreMaterialUnit = Pick<StoreItem, 'unit' | 'lastPrice' | 'unitFactors'>

export type KitchenMaterialStockLine = {
  storeItemId: string
  name: string
  unit: string
  quantity: number
}

function roundStockQuantity(quantity: number): number {
  return Math.round(quantity * 1000) / 1000
}

export function normalizeKitchenMaterialStockLine<T extends KitchenMaterialStockLine>(
  line: T,
  storeItem: StoreMaterialUnit | undefined,
): T {
  if (!storeItem) return line

  const converted = convertToStoreUnitsWithFactors(
    line.quantity,
    line.unit,
    storeItem.unit,
    storeItem.unitFactors,
  )
  if (converted == null) return line

  return {
    ...line,
    quantity: roundStockQuantity(converted),
    unit: storeItem.unit,
  }
}

export function recipeIngredientMaterialLine(
  ingredient: RecipeIngredient,
): KitchenMaterialStockLine {
  return {
    storeItemId: ingredient.stockItemId,
    name: ingredient.name,
    unit: ingredient.unit,
    quantity: ingredient.quantity,
  }
}

export function batchRecipeMaterialLines(
  recipe: Recipe | undefined,
  portions: number,
  getStoreItem?: (storeItemId: string) => StoreMaterialUnit | undefined,
): KitchenMaterialStockLine[] {
  if (!recipe || !Number.isFinite(portions) || portions <= 0) return []

  const scale = recipe.yieldPortions > 0 ? portions / recipe.yieldPortions : 1
  return recipe.ingredients.map((ingredient) => {
    const scaled = {
      ...recipeIngredientMaterialLine(ingredient),
      quantity: roundStockQuantity(ingredient.quantity * scale),
    }
    return normalizeKitchenMaterialStockLine(
      scaled,
      getStoreItem?.(ingredient.stockItemId),
    )
  })
}

export function batchMaterialLineToRecipeIngredient(
  line: BatchMaterialLine,
  storeItem: StoreMaterialUnit | undefined,
): RecipeIngredient {
  const normalized = normalizeKitchenMaterialStockLine(line, storeItem)
  const unitPrice = storeItem?.lastPrice ?? line.unitCost

  return {
    stockItemId: line.storeItemId,
    name: line.name,
    quantity: normalized.quantity,
    unit: normalized.unit,
    cost: Math.round(normalized.quantity * unitPrice * 100) / 100,
  }
}

export function normalizeRecipeIngredient(
  ingredient: RecipeIngredient,
  storeItem: StoreMaterialUnit | undefined,
): RecipeIngredient {
  const normalized = normalizeKitchenMaterialStockLine(
    recipeIngredientMaterialLine(ingredient),
    storeItem,
  )
  const shouldReprice =
    storeItem &&
    (normalized.quantity !== ingredient.quantity || normalized.unit !== ingredient.unit)

  return {
    ...ingredient,
    quantity: normalized.quantity,
    unit: normalized.unit,
    cost: shouldReprice
      ? Math.round(normalized.quantity * storeItem.lastPrice * 100) / 100
      : ingredient.cost,
  }
}
