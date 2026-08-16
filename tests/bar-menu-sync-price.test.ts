import assert from 'node:assert/strict'
import { test } from 'node:test'
import { barMenuUnitPriceForSync } from '../lib/supply-chain/bar-menu-sync-price.ts'

test('unpriced F&B transfer keeps an existing Main Bar price', () => {
  assert.equal(barMenuUnitPriceForSync(0, 2500), undefined)
  assert.equal(barMenuUnitPriceForSync(0, 2500.5), undefined)
})

test('priced F&B transfer updates the menu price', () => {
  assert.equal(barMenuUnitPriceForSync(1800, 2500), 1800)
  assert.equal(barMenuUnitPriceForSync(12.345, null), 12.35)
})

test('new menu item with no F&B price still creates at 0', () => {
  assert.equal(barMenuUnitPriceForSync(0, null), 0)
  assert.equal(barMenuUnitPriceForSync(0, 0), 0)
  assert.equal(barMenuUnitPriceForSync(0, undefined), 0)
})

test('invalid incoming price does not wipe a priced item', () => {
  assert.equal(barMenuUnitPriceForSync(Number.NaN, 900), undefined)
  assert.equal(barMenuUnitPriceForSync(-50, 900), undefined)
})
