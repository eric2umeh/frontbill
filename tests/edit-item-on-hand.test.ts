import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  catalogPatchPreservingOnHand,
  explicitStoreOnHandQty,
  quantityInStoreFromEditForm,
} from '../lib/supply-chain/edit-item-on-hand.ts'
import { storeItemToCatalogUpdate } from '../lib/supply-chain/supply-db-mappers.ts'

describe('quantityInStoreFromEditForm', () => {
  it('does not zero stock when the field is cleared', () => {
    assert.equal(quantityInStoreFromEditForm('', 100), undefined)
    assert.equal(quantityInStoreFromEditForm('   ', 100), undefined)
  })

  it('leaves on-hand alone when the opened quantity is unchanged', () => {
    assert.equal(quantityInStoreFromEditForm('100', 100), undefined)
    assert.equal(quantityInStoreFromEditForm('10.5', 10.5), undefined)
    assert.equal(quantityInStoreFromEditForm('0', 0), undefined)
    assert.equal(quantityInStoreFromEditForm('40.00', 40), undefined)
  })

  it('keeps a zero balance when the field renders blank', () => {
    assert.equal(quantityInStoreFromEditForm('', 0), undefined)
  })

  it('applies an explicit count, including zero', () => {
    assert.equal(quantityInStoreFromEditForm('80', 100), 80)
    assert.equal(quantityInStoreFromEditForm('0', 100), 0)
    assert.equal(quantityInStoreFromEditForm('1/2', 4), 0.5)
  })

  it('does not turn an incomplete or invalid entry into zero', () => {
    assert.equal(quantityInStoreFromEditForm('1/', 40), undefined)
    assert.equal(quantityInStoreFromEditForm('abc', 40), undefined)
    assert.equal(quantityInStoreFromEditForm('-3', 40), undefined)
  })
})

describe('catalogue patch on-hand', () => {
  it('omits quantity when the edit did not set one', () => {
    const patch = catalogPatchPreservingOnHand(
      { name: 'Rice', quantityInStore: 100, lastPrice: 500 },
      explicitStoreOnHandQty(undefined),
    )
    assert.equal(patch.name, 'Rice')
    assert.equal(patch.lastPrice, 500)
    assert.equal('quantityInStore' in patch, false)
  })

  it('keeps an explicit override, including zero', () => {
    assert.equal(explicitStoreOnHandQty(0), 0)
    const patch = catalogPatchPreservingOnHand(
      { name: 'Rice', quantityInStore: 0 },
      explicitStoreOnHandQty(0),
    )
    assert.equal(patch.quantityInStore, 0)
  })

  it('does not treat a non-finite override as a count of zero', () => {
    assert.equal(explicitStoreOnHandQty(Number.NaN), null)
    const patch = catalogPatchPreservingOnHand(
      { quantityInStore: 12 },
      explicitStoreOnHandQty(Number.NaN),
    )
    assert.equal('quantityInStore' in patch, false)
  })

  it('does not send quantity_in_store when on-hand was not edited', () => {
    const patch = catalogPatchPreservingOnHand(
      { id: 'si-rice', name: 'Rice', quantityInStore: 60, lastPrice: 500 },
      explicitStoreOnHandQty(undefined),
    )
    const db = storeItemToCatalogUpdate(patch, 'user-1')
    assert.equal(db.name, 'Rice')
    assert.equal(db.last_price, 500)
    assert.equal('quantity_in_store' in db, false)
  })

  it('persists an explicit zero count', () => {
    const patch = catalogPatchPreservingOnHand(
      { id: 'si-rice', name: 'Rice', quantityInStore: 0 },
      explicitStoreOnHandQty(0),
    )
    const db = storeItemToCatalogUpdate(patch, 'user-1')
    assert.equal(db.quantity_in_store, 0)
  })
})
