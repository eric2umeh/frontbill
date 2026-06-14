import assert from 'node:assert/strict'
import test from 'node:test'

import { batchMaterialLineToRecipeIngredient, batchRecipeMaterialLines } from '../lib/supply-chain/kitchen-material-units'
import { batchMaterialShortages } from '../lib/supply-chain/batch-material-shortages'
import type { BatchMaterialLine, Recipe, StoreItem } from '../lib/supply-chain/types'

const tomatoes: Pick<StoreItem, 'unit' | 'lastPrice' | 'unitFactors'> = {
  unit: 'kg',
  lastPrice: 4000,
}

test('normalizes kitchen recipe materials to store units', () => {
  const material: BatchMaterialLine = {
    storeItemId: 'tomatoes',
    name: 'Tomatoes',
    unit: 'g',
    quantity: 500,
    unitCost: tomatoes.lastPrice,
  }

  const ingredient = batchMaterialLineToRecipeIngredient(material, tomatoes)

  assert.equal(ingredient.quantity, 0.5)
  assert.equal(ingredient.unit, 'kg')
  assert.equal(ingredient.cost, 2000)
})

test('checks kitchen raw stock shortages in store units', () => {
  const recipe: Recipe = {
    id: 'rcp-stew',
    name: 'Stew',
    category: 'Soup',
    yieldPortions: 10,
    yieldLabel: '10 portions',
    ingredients: [
      {
        stockItemId: 'tomatoes',
        name: 'Tomatoes',
        quantity: 500,
        unit: 'g',
        cost: 2000,
      },
    ],
    overheadCost: 0,
    sellingPricePerPortion: 1000,
  }

  const lines = batchRecipeMaterialLines(recipe, 10, () => tomatoes)
  assert.deepEqual(lines, [
    {
      storeItemId: 'tomatoes',
      name: 'Tomatoes',
      quantity: 0.5,
      unit: 'kg',
    },
  ])

  const shortages = batchMaterialShortages(recipe, 10, () => 2, () => tomatoes)
  assert.deepEqual(shortages, [])
})
