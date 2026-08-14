import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { Recipe } from '../lib/supply-chain/types.ts'
import {
  batchMaterialNeeds,
  batchMaterialShortages,
  recipeQtyInStockUnits,
} from '../lib/supply-chain/batch-material-shortages.ts'

function riceRecipe(qty: number, unit: string): Recipe {
  return {
    id: 'rcp-jollof',
    name: 'Jollof Rice',
    category: 'Rice',
    yieldPortions: 10,
    yieldUnit: 'portion',
    yieldLabel: '10 portion',
    ingredients: [
      {
        stockItemId: 'rice',
        name: 'Rice',
        quantity: qty,
        unit,
        cost: 1200,
        source: 'raw',
      },
    ],
    overheadCost: 0,
    sellingPricePerPortion: 1500,
  }
}

test('recipeQtyInStockUnits converts grams to kilograms', () => {
  assert.equal(recipeQtyInStockUnits(300, 'g', 'kg'), 0.3)
  assert.equal(recipeQtyInStockUnits(2, 'kg', 'g'), 2000)
})

test('recipeQtyInStockUnits converts ml to litres', () => {
  assert.equal(recipeQtyInStockUnits(500, 'ml', 'l'), 0.5)
  assert.equal(recipeQtyInStockUnits(1.5, 'l', 'ml'), 1500)
})

test('recipeQtyInStockUnits is identity for matching units', () => {
  assert.equal(recipeQtyInStockUnits(2, 'kg', 'kg'), 2)
})

test('recipeQtyInStockUnits returns null when no SI or pack factor exists', () => {
  assert.equal(recipeQtyInStockUnits(3, 'cup', 'kg'), null)
})

test('closing a 300g recipe deducts 0.3kg from kg kitchen raw, not 300kg', () => {
  const needs = batchMaterialNeeds(riceRecipe(300, 'g'), 10, () => ({
    quantity: 5,
    unit: 'kg',
  }))
  assert.equal(needs.length, 1)
  assert.equal(needs[0].stockQuantity, 0.3)
  assert.equal(needs[0].stockUnit, 'kg')
  assert.equal(needs[0].onHand, 5)
  assert.equal(needs[0].onHand >= (needs[0].stockQuantity ?? Infinity), true)
})

test('300g against 0.2kg on hand is a shortage in kg', () => {
  const shortages = batchMaterialShortages(riceRecipe(300, 'g'), 10, () => ({
    quantity: 0.2,
    unit: 'kg',
  }))
  assert.equal(shortages.length, 1)
  assert.equal(shortages[0].need, 0.3)
  assert.equal(shortages[0].onHand, 0.2)
  assert.equal(shortages[0].unit, 'kg')
})

test('5kg on hand is enough for a 300g line (does not false-shortage)', () => {
  const shortages = batchMaterialShortages(riceRecipe(300, 'g'), 10, () => ({
    quantity: 5,
    unit: 'kg',
  }))
  assert.equal(shortages.length, 0)
})

test('500kg on hand with 300g recipe is not treated as 300kg need', () => {
  const shortages = batchMaterialShortages(riceRecipe(300, 'g'), 10, () => ({
    quantity: 500,
    unit: 'kg',
  }))
  assert.equal(shortages.length, 0)
  const needs = batchMaterialNeeds(riceRecipe(300, 'g'), 10, () => ({
    quantity: 500,
    unit: 'kg',
  }))
  assert.equal(needs[0].stockQuantity, 0.3)
})

test('doubling portions scales converted kg qty', () => {
  const needs = batchMaterialNeeds(riceRecipe(300, 'g'), 20, () => ({
    quantity: 5,
    unit: 'kg',
  }))
  assert.equal(needs[0].stockQuantity, 0.6)
})

test('unconvertible recipe unit is reported as a shortage, not deducted as raw qty', () => {
  const shortages = batchMaterialShortages(riceRecipe(3, 'cup'), 10, () => ({
    quantity: 5,
    unit: 'kg',
  }))
  assert.equal(shortages.length, 1)
  assert.match(shortages[0].name, /convert cup → kg/)
  assert.equal(shortages[0].need, 3)
})
