import assert from 'node:assert/strict'
import test from 'node:test'

import { batchMaterialShortages } from '../lib/supply-chain/batch-material-shortages'
import {
  batchMaterialLineMatches,
  kitchenBatchLineInputKey,
  recipeIngredientInputKey,
} from '../lib/supply-chain/kitchen-batch-line-keys'
import type { BatchMaterialLine, Recipe } from '../lib/supply-chain/types'

test('prep stock shortages compare recipe quantities in the stock row unit', () => {
  const recipe: Recipe = {
    id: 'recipe-jollof',
    name: 'Jollof Rice',
    category: 'Food',
    yieldPortions: 10,
    yieldLabel: '10 portions',
    overheadCost: 0,
    sellingPricePerPortion: 0,
    ingredients: [
      {
        stockItemId: 'stock-chicken',
        name: 'Chicken Stock',
        quantity: 2,
        unit: 'l',
        cost: 0,
        source: 'kitchen_stock',
      },
    ],
  }

  const shortages = batchMaterialShortages(recipe, 10, () => ({
    quantityOnHand: 500,
    unit: 'ml',
  }))

  assert.deepEqual(shortages, [
    {
      name: 'Chicken Stock',
      need: 2000,
      onHand: 500,
      unit: 'ml',
    },
  ])
})

test('prep stock usage converts ml recipe lines to litre stock rows', () => {
  const recipe: Recipe = {
    id: 'recipe-sauce',
    name: 'Sauce',
    category: 'Food',
    yieldPortions: 1,
    yieldLabel: '1 portion',
    overheadCost: 0,
    sellingPricePerPortion: 0,
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
  }

  const shortages = batchMaterialShortages(recipe, 1, () => ({
    quantityOnHand: 0.25,
    unit: 'l',
  }))

  assert.deepEqual(shortages, [
    {
      name: 'Chicken Stock',
      need: 0.5,
      onHand: 0.25,
      unit: 'l',
    },
  ])
})

test('required and optional batch material input keys do not collide', () => {
  const required: BatchMaterialLine = {
    storeItemId: 'pepper',
    name: 'Pepper',
    quantity: 2,
    unit: 'kg',
    unitCost: 0,
    source: 'raw',
    optional: false,
  }
  const optional: BatchMaterialLine = {
    ...required,
    quantity: 0.1,
    optional: true,
  }

  assert.equal(kitchenBatchLineInputKey(required), 'req:raw:pepper')
  assert.equal(kitchenBatchLineInputKey(optional), 'opt:raw:pepper')
  assert.notEqual(kitchenBatchLineInputKey(required), kitchenBatchLineInputKey(optional))
  assert.equal(batchMaterialLineMatches(required, optional), false)
  assert.equal(batchMaterialLineMatches(optional, optional), true)
})

test('recipe edit quantity inputs preserve required and optional duplicates', () => {
  const required = {
    stockItemId: 'pepper',
    name: 'Pepper',
    quantity: 2,
    unit: 'kg',
    cost: 0,
    source: 'raw' as const,
    optional: false,
  }
  const optional = {
    ...required,
    quantity: 0.1,
    optional: true,
  }
  const inputMap = Object.fromEntries(
    [required, optional].map((ingredient) => [
      recipeIngredientInputKey(ingredient),
      String(ingredient.quantity),
    ]),
  )

  assert.deepEqual(inputMap, {
    'req:raw:pepper': '2',
    'opt:raw:pepper': '0.1',
  })
})
