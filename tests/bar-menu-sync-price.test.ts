import assert from 'node:assert/strict'
import { test } from 'node:test'
import { barMenuUnitPriceForSync } from '../lib/supply-chain/bar-menu-sync-price.ts'

test('Issue Out lastPrice (cost) does not overwrite an existing Main Bar price', () => {
  assert.equal(barMenuUnitPriceForSync(800, 2500), undefined)
  assert.equal(barMenuUnitPriceForSync(800.49, 2500.5), undefined)
})

test('unpriced F&B transfer keeps an existing Main Bar price', () => {
  assert.equal(barMenuUnitPriceForSync(0, 2500), undefined)
  assert.equal(barMenuUnitPriceForSync(0, 2500.5), undefined)
})

test('unpriced existing item can take a positive incoming selling price', () => {
  assert.equal(barMenuUnitPriceForSync(1800, 0), 1800)
  assert.equal(barMenuUnitPriceForSync(12.345, null), 12.35)
})

test('new menu item with no incoming price still creates at 0', () => {
  assert.equal(barMenuUnitPriceForSync(0, null), 0)
  assert.equal(barMenuUnitPriceForSync(0, 0), 0)
  assert.equal(barMenuUnitPriceForSync(0, undefined), 0)
})

test('invalid incoming price does not wipe a priced item', () => {
  assert.equal(barMenuUnitPriceForSync(Number.NaN, 900), undefined)
  assert.equal(barMenuUnitPriceForSync(-50, 900), undefined)
})
