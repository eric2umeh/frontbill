import type {
  KitchenRawStockItem,
  KitchenStockItem,
} from '@/lib/supply-chain/types'

export type CloseBatchDeductLine = {
  storeItemId: string
  quantity: number
}

/**
 * Finished-menu + kitchen-stock rows that production close must persist.
 * Callers must write this onto `kitchenStockRef` *before* `persistSnapshotsNow()`,
 * otherwise the PUT ships pre-close counts and live merge can drop the yield.
 */
export function kitchenStockAfterProductionClose(input: {
  kitchenStock: KitchenStockItem[]
  deductLines: CloseBatchDeductLine[]
  stockId?: string
  sellable: number
  recipeName: string
  recipeId?: string
}): KitchenStockItem[] {
  let next = input.kitchenStock

  if (input.deductLines.length) {
    next = next.map((k) => {
      const line = input.deductLines.find((l) => l.storeItemId === k.id)
      if (!line) return k
      return {
        ...k,
        availablePortions: Math.max(0, k.availablePortions - line.quantity),
      }
    })
  }

  if (!input.stockId || input.sellable <= 0) return next

  const idx = next.findIndex((k) => k.id === input.stockId)
  if (idx >= 0) {
    return next.map((k, i) =>
      i === idx
        ? { ...k, availablePortions: k.availablePortions + input.sellable }
        : k,
    )
  }

  return [
    ...next,
    {
      id: input.stockId,
      name: input.recipeName,
      source: 'produced',
      availablePortions: input.sellable,
      reorderLevel: Math.max(2, Math.ceil(input.sellable * 0.15)),
      linkedRecipeId: input.recipeId,
    },
  ]
}

export function kitchenRawAfterProductionClose(
  kitchenRawStock: KitchenRawStockItem[],
  deductLines: CloseBatchDeductLine[],
): KitchenRawStockItem[] {
  if (!deductLines.length) return kitchenRawStock
  return kitchenRawStock.map((k) => {
    const line = deductLines.find((l) => l.storeItemId === k.storeItemId)
    if (!line) return k
    return {
      ...k,
      quantityOnHand: Math.max(0, k.quantityOnHand - line.quantity),
    }
  })
}

/** True when a snapshot PUT would include the new finished-menu yield. */
export function productionClosePersistIncludesYield(input: {
  persistedKitchenStock: KitchenStockItem[]
  stockId: string
  previousPortions: number
  sellable: number
}): boolean {
  const row = input.persistedKitchenStock.find((k) => k.id === input.stockId)
  return (row?.availablePortions ?? 0) === input.previousPortions + input.sellable
}
