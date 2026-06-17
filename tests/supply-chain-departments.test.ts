import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import {
  storeItemDepartments,
  storeItemHasBarDept,
  storeItemHasDept,
  type StoreItem,
} from '../lib/supply-chain/types'

const baseItem: Omit<StoreItem, 'dept' | 'depts'> = {
  id: 'store-1',
  name: 'Shared Stock Item',
  unit: 'crate',
  quantityInStore: 24,
  reorderLevel: 4,
  lastPrice: 1_000,
  benchmarkPrice: 1_000,
}

describe('store item department helpers', () => {
  it('treats a secondary bar department as bar-routable stock', () => {
    const item: StoreItem = {
      ...baseItem,
      dept: 'kitchen',
      depts: ['kitchen', 'main_bar'],
    }

    assert.equal(storeItemHasBarDept(item), true)
    assert.equal(storeItemHasDept(item, 'main_bar'), true)
  })

  it('preserves primary department membership when depts is present', () => {
    const item: StoreItem = {
      ...baseItem,
      dept: 'main_bar',
      depts: ['kitchen'],
    }

    assert.deepEqual(storeItemDepartments(item), ['kitchen', 'main_bar'])
    assert.equal(storeItemHasDept(item, 'kitchen'), true)
    assert.equal(storeItemHasBarDept(item), true)
  })
})
