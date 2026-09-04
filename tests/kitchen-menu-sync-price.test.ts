import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  kitchenMenuUnitPriceForSync,
  shouldSyncOutletMenuForKitchenStockCount,
} from '@/lib/supply-chain/kitchen-menu-sync-price'

describe('kitchenMenuUnitPriceForSync', () => {
  it('omits unit_price when the POS row is already priced', () => {
    assert.equal(kitchenMenuUnitPriceForSync(3500, 2500), undefined)
    assert.equal(kitchenMenuUnitPriceForSync(3500, 4000), undefined)
  })

  it('seeds unpriced or missing rows from a positive incoming price', () => {
    assert.equal(kitchenMenuUnitPriceForSync(0, 2500), 2500)
    assert.equal(kitchenMenuUnitPriceForSync(null, 2500), 2500)
    assert.equal(kitchenMenuUnitPriceForSync(undefined, 2500), 2500)
  })

  it('does not write 0 onto an unpriced row during count/close sync', () => {
    assert.equal(kitchenMenuUnitPriceForSync(0, 0), undefined)
    assert.equal(kitchenMenuUnitPriceForSync(null, Number.NaN), undefined)
  })
})

describe('shouldSyncOutletMenuForKitchenStockCount', () => {
  it('never POSTs outlet menu from a physical Finished Menu count', () => {
    assert.equal(shouldSyncOutletMenuForKitchenStockCount(), false)
  })
})
