import assert from 'node:assert/strict'
import { describe, test } from 'node:test'
import {
  kitchenRawAfterProductionClose,
  kitchenStockAfterProductionClose,
  productionClosePersistIncludesYield,
} from '@/lib/supply-chain/close-batch-snapshots'
import type {
  KitchenRawStockItem,
  KitchenStockItem,
} from '@/lib/supply-chain/types'

function finished(partial: Partial<KitchenStockItem> & Pick<KitchenStockItem, 'id'>): KitchenStockItem {
  return {
    name: partial.name ?? 'Jollof',
    source: partial.source ?? 'produced',
    availablePortions: partial.availablePortions ?? 0,
    reorderLevel: partial.reorderLevel ?? 2,
    linkedRecipeId: partial.linkedRecipeId,
    ...partial,
  }
}

function raw(
  partial: Partial<KitchenRawStockItem> & Pick<KitchenRawStockItem, 'id' | 'storeItemId'>,
): KitchenRawStockItem {
  return {
    name: partial.name ?? 'Rice',
    quantityOnHand: partial.quantityOnHand ?? 0,
    reorderLevel: partial.reorderLevel ?? 0,
    unit: partial.unit ?? 'kg',
    ...partial,
  }
}

describe('kitchenStockAfterProductionClose', () => {
  test('adds sellable portions onto the existing finished-menu row', () => {
    const next = kitchenStockAfterProductionClose({
      kitchenStock: [finished({ id: 'ks-jollof', availablePortions: 5, linkedRecipeId: 'r1' })],
      deductLines: [],
      stockId: 'ks-jollof',
      sellable: 20,
      recipeName: 'Jollof',
      recipeId: 'r1',
    })
    assert.equal(next[0]?.availablePortions, 25)
  })

  test('creates a finished-menu row when the batch has never been counted', () => {
    const next = kitchenStockAfterProductionClose({
      kitchenStock: [],
      deductLines: [],
      stockId: 'ks-egusi',
      sellable: 12,
      recipeName: 'Egusi',
      recipeId: 'r2',
    })
    assert.equal(next.length, 1)
    assert.equal(next[0]?.id, 'ks-egusi')
    assert.equal(next[0]?.availablePortions, 12)
    assert.equal(next[0]?.source, 'produced')
    assert.equal(next[0]?.linkedRecipeId, 'r2')
  })

  test('deducts kitchen-stock-sourced materials before adding yield', () => {
    const next = kitchenStockAfterProductionClose({
      kitchenStock: [
        finished({ id: 'ks-stock', availablePortions: 8 }),
        finished({ id: 'ks-sauce', availablePortions: 3, name: 'Pepper sauce' }),
      ],
      deductLines: [{ storeItemId: 'ks-sauce', quantity: 2 }],
      stockId: 'ks-stock',
      sellable: 10,
      recipeName: 'Jollof',
    })
    assert.equal(next.find((k) => k.id === 'ks-sauce')?.availablePortions, 1)
    assert.equal(next.find((k) => k.id === 'ks-stock')?.availablePortions, 18)
  })
})

describe('kitchenRawAfterProductionClose', () => {
  test('deducts raw on-hand for matching store items', () => {
    const next = kitchenRawAfterProductionClose(
      [
        raw({ id: 'kraw-rice', storeItemId: 'store-rice', quantityOnHand: 5, name: 'Rice' }),
        raw({ id: 'kraw-oil', storeItemId: 'store-oil', quantityOnHand: 2, name: 'Oil' }),
      ],
      [{ storeItemId: 'store-rice', quantity: 1.5 }],
    )
    assert.equal(next.find((k) => k.storeItemId === 'store-rice')?.quantityOnHand, 3.5)
    assert.equal(next.find((k) => k.storeItemId === 'store-oil')?.quantityOnHand, 2)
  })
})

describe('production close persist payload', () => {
  test('stale refs (pre-setState) omit the new yield — the bug closeBatch used to persist', () => {
    const before = [finished({ id: 'ks-jollof', availablePortions: 5 })]
    assert.equal(
      productionClosePersistIncludesYield({
        persistedKitchenStock: before,
        stockId: 'ks-jollof',
        previousPortions: 5,
        sellable: 20,
      }),
      false,
    )
  })

  test('payload taken from kitchenStockAfterProductionClose includes the yield', () => {
    const before = [finished({ id: 'ks-jollof', availablePortions: 5 })]
    const persisted = kitchenStockAfterProductionClose({
      kitchenStock: before,
      deductLines: [],
      stockId: 'ks-jollof',
      sellable: 20,
      recipeName: 'Jollof',
    })
    assert.equal(
      productionClosePersistIncludesYield({
        persistedKitchenStock: persisted,
        stockId: 'ks-jollof',
        previousPortions: 5,
        sellable: 20,
      }),
      true,
    )
  })
})
