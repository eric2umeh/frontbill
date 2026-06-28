import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  batchMaterialLines,
  batchMaterialShortages,
  materialLineQuantityInStockUnit,
} from '../lib/supply-chain/batch-material-shortages'
import { resolveSupplySnapshot } from '../lib/supply-chain/snapshot-merge'
import type { Recipe } from '../lib/supply-chain/types'

test('prep-stock shortages compare recipe quantities in the stock row unit', () => {
  const recipe: Recipe = {
    id: 'recipe-main',
    name: 'Pepper Soup',
    category: 'Soups',
    yieldPortions: 10,
    yieldLabel: '10 portions',
    ingredients: [
      {
        stockItemId: 'stock-chicken',
        name: 'Chicken Stock',
        quantity: 500,
        unit: 'ml',
        cost: 0,
        source: 'kitchen_stock',
      },
    ],
    overheadCost: 0,
    sellingPricePerPortion: 0,
  }

  assert.deepEqual(
    batchMaterialShortages(recipe, 10, () => ({ quantity: 5, unit: 'l' })),
    [],
  )

  assert.deepEqual(
    batchMaterialShortages(recipe, 10, () => ({ quantity: 0.25, unit: 'l' })),
    [
      {
        name: 'Chicken Stock',
        need: 500,
        onHand: 250,
        unit: 'ml',
      },
    ],
  )
})

test('prep-stock deduction stores consumed quantity in the stock row unit', () => {
  const recipe: Recipe = {
    id: 'recipe-main',
    name: 'Pepper Soup',
    category: 'Soups',
    yieldPortions: 10,
    yieldLabel: '10 portions',
    ingredients: [
      {
        stockItemId: 'stock-chicken',
        name: 'Chicken Stock',
        quantity: 500,
        unit: 'ml',
        cost: 0,
        source: 'kitchen_stock',
      },
    ],
    overheadCost: 0,
    sellingPricePerPortion: 0,
  }

  const [line] = batchMaterialLines(recipe, 10)

  assert.equal(materialLineQuantityInStockUnit(line, 'l'), 0.5)
  assert.equal(5 - materialLineQuantityInStockUnit(line, 'l'), 4.5)
})

test('cloud snapshot rows win over stale local rows with the same id', () => {
  const merged = resolveSupplySnapshot(
    [
      { id: 'stock-chicken', availablePortions: 10 },
      { id: 'local-only', availablePortions: 3 },
    ],
    [{ id: 'stock-chicken', availablePortions: 50 }],
  )

  assert.deepEqual(merged, [
    { id: 'stock-chicken', availablePortions: 50 },
    { id: 'local-only', availablePortions: 3 },
  ])
})
