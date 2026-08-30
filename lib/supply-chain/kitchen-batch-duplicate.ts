import { normalizeBatchOutletMenuSync } from '@/lib/supply-chain/batch-outlet-sync'
import {
  EMPTY_KITCHEN_BATCH_DRAFT,
  KITCHEN_BATCH_DRAFT_VERSION,
} from '@/lib/supply-chain/kitchen-batch-draft'
import { dedupeBatchMaterials } from '@/lib/supply-chain/parse-csv-row'
import type { BatchMaterialLine, KitchenBatchDraft, Recipe } from '@/lib/supply-chain/types'

function ingredientsToCart(
  ingredients: Recipe['ingredients'],
  optional: boolean,
): BatchMaterialLine[] {
  return dedupeBatchMaterials(
    ingredients
      .filter((ing) => Boolean(ing.optional) === optional)
      .map((ing) => ({
        storeItemId: ing.stockItemId,
        name: ing.name,
        unit: ing.unit,
        quantity: ing.quantity,
        unitCost: ing.quantity > 0 ? ing.cost / ing.quantity : 0,
        source: ing.source ?? 'raw',
        optional,
      })),
  )
}

/** Build a new-batch draft from an existing batch standard (ingredients, overhead, yield, etc.). */
export function kitchenBatchDraftFromRecipe(
  recipe: Recipe,
  opts?: { batchName?: string },
): KitchenBatchDraft {
  const required = ingredientsToCart(recipe.ingredients, false)
  const optional = ingredientsToCart(recipe.ingredients, true)
  const overheadOther =
    recipe.overheadOther ?? (recipe.overheadCost > 0 ? recipe.overheadCost : undefined)

  return {
    ...EMPTY_KITCHEN_BATCH_DRAFT,
    draftVersion: KITCHEN_BATCH_DRAFT_VERSION,
    menuCategory: recipe.category,
    batchName: opts?.batchName?.trim() || `Copy of ${recipe.name}`,
    menuItemId: null,
    linkedKitchenStockId: null,
    plannedPortions: recipe.yieldPortions > 0 ? String(recipe.yieldPortions) : '',
    yieldUnit: recipe.yieldUnit ?? 'portion',
    sellingPrice:
      recipe.sellingPricePerPortion > 0 ? String(recipe.sellingPricePerPortion) : '',
    overheadLabour: recipe.overheadLabour ? String(recipe.overheadLabour) : '',
    overheadGas: recipe.overheadGas ? String(recipe.overheadGas) : '',
    overheadOther: overheadOther ? String(overheadOther) : '',
    outletMenuSync: normalizeBatchOutletMenuSync(recipe.outletMenuSync ?? recipe.fnbEligible),
    notes: recipe.description ?? '',
    cart: [...required, ...optional],
  }
}

export function defaultDuplicateBatchName(sourceName: string): string {
  const base = sourceName.trim()
  if (!base) return 'Copy of batch'
  return `Copy of ${base}`
}
