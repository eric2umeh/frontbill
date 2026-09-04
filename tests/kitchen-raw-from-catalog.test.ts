import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { applyKitchenCatalogToRawStock } from '@/lib/supply-chain/kitchen-raw-from-catalog'
import type { KitchenRawStockItem } from '@/lib/supply-chain/types'

const rice: KitchenRawStockItem = {
  id: 'kraw-rice',
  storeItemId: 'rice',
  name: 'Rice',
  quantityOnHand: 5,
  reorderLevel: 2,
  unit: 'kg',
}

describe('applyKitchenCatalogToRawStock', () => {
  it('does not wipe on-hand when the kitchen catalogue is empty', () => {
    const prev = [rice]
    const result = applyKitchenCatalogToRawStock(prev, [])
    assert.equal(result.skipped, 'empty_catalog')
    assert.equal(result.changed, false)
    assert.equal(result.next, prev)
    assert.equal(result.next[0].quantityOnHand, 5)
  })

  it('adds placeholder rows for new kitchen catalogue items', () => {
    const result = applyKitchenCatalogToRawStock([], [
      { id: 'rice', name: 'Rice', unit: 'kg', reorderLevel: 2 },
    ])
    assert.equal(result.skipped, null)
    assert.equal(result.changed, true)
    assert.equal(result.next.length, 1)
    assert.equal(result.next[0].storeItemId, 'rice')
    assert.equal(result.next[0].quantityOnHand, 0)
  })

  it('drops raw rows whose catalogue item is no longer kitchen', () => {
    const result = applyKitchenCatalogToRawStock(
      [
        rice,
        {
          id: 'kraw-bleach',
          storeItemId: 'bleach',
          name: 'Bleach',
          quantityOnHand: 3,
          reorderLevel: 1,
          unit: 'l',
        },
      ],
      [{ id: 'rice', name: 'Rice', unit: 'kg', reorderLevel: 2 }],
    )
    assert.equal(result.skipped, null)
    assert.equal(result.changed, true)
    assert.deepEqual(
      result.next.map((r) => r.storeItemId),
      ['rice'],
    )
    assert.equal(result.next[0].quantityOnHand, 5)
  })
})
