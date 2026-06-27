import type { BatchMaterialLine, RecipeIngredient } from '@/lib/supply-chain/types'

type BatchLineIdentity = {
  storeItemId: string
  source?: 'raw' | 'kitchen_stock'
  optional?: boolean
}

export function kitchenBatchLineInputKey(line: BatchLineIdentity): string {
  return `${line.optional ? 'opt' : 'req'}:${line.source ?? 'raw'}:${line.storeItemId}`
}

export function recipeIngredientInputKey(ingredient: RecipeIngredient): string {
  return kitchenBatchLineInputKey({
    storeItemId: ingredient.stockItemId,
    source: ingredient.source ?? 'raw',
    optional: ingredient.optional,
  })
}

export function batchMaterialLineMatches(
  line: BatchMaterialLine,
  target: BatchLineIdentity,
): boolean {
  return (
    line.storeItemId === target.storeItemId &&
    (line.source ?? 'raw') === (target.source ?? 'raw') &&
    Boolean(line.optional) === Boolean(target.optional)
  )
}
