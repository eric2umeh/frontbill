import assert from 'node:assert/strict'
import test from 'node:test'

import { batchMaterialShortages } from '../lib/supply-chain/batch-material-shortages'
import { parseKitchenBatchCsvText } from '../lib/supply-chain/parse-csv-row'
import type { Recipe } from '../lib/supply-chain/types'

const recipeListSample = `batch / menu name,store items,main category,Planned portions,Selling price / portion (_)
Jollof Rice 1kg,Rice = 1kg,Rice,6,2500
,Vegetable oil = 300ml,,,
,Tomato paste = 200g,,,
,Onion = 2 pcs,,,
,Salt to taste,,,
Fried Rice 1kg,Rice = 1kg,Rice,6,3000
,Chicken stock = 1 litre,,,
,Mixed vegetables = 500g,,,
,Curry powder = 1 tbsp,,,`

test('recipe-list CSV keeps first-row store item as an ingredient', () => {
  const parsed = parseKitchenBatchCsvText(recipeListSample)

  assert.equal(parsed.ok, true)
  if (!parsed.ok) return

  assert.deepEqual(
    parsed.rows.map((row) => row.name),
    ['Jollof Rice 1kg', 'Fried Rice 1kg'],
  )
  assert.deepEqual(parsed.rows[0].ingredientLines, [
    'Rice = 1kg',
    'Vegetable oil = 300ml',
    'Tomato paste = 200g',
    'Onion = 2 pcs',
    'Salt to taste',
  ])
  assert.deepEqual(parsed.rows[1].ingredientLines, [
    'Rice = 1kg',
    'Chicken stock = 1 litre',
    'Mixed vegetables = 500g',
    'Curry powder = 1 tbsp',
  ])
})

test('prep-stock shortages compare recipe quantity in produced stock unit', () => {
  const recipe: Recipe = {
    id: 'rcp-fried-rice',
    name: 'Fried Rice',
    category: 'Rice',
    yieldPortions: 1,
    yieldUnit: 'portion',
    yieldLabel: '1 portion',
    ingredients: [
      {
        stockItemId: 'ks-chicken-stock',
        name: 'Chicken stock',
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
    batchMaterialShortages(recipe, 1, () => ({ onHand: 0.5, unit: 'l' })),
    [],
  )
  assert.deepEqual(batchMaterialShortages(recipe, 1, () => ({ onHand: 0.4, unit: 'l' })), [
    {
      name: 'Chicken stock',
      need: 0.5,
      onHand: 0.4,
      unit: 'l',
    },
  ])
})
