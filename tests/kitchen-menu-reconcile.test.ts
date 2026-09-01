import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { orphanKitchenSyncedMenuItemIds } from '../lib/supply-chain/kitchen-batch-link'

const jollof = {
  id: 'menu-jollof',
  service_code: 'ks:ks-jollof-rice',
  is_active: true,
}
const egusi = {
  id: 'menu-egusi',
  service_code: 'ks:ks-egusi',
  is_active: true,
}
const inactive = {
  id: 'menu-old',
  service_code: 'ks:ks-gone',
  is_active: false,
}
const unlinked = {
  id: 'menu-drink',
  service_code: 'bar:bar-stout',
  is_active: true,
}

describe('orphanKitchenSyncedMenuItemIds', () => {
  it('does not deactivate every kitchen dish when valid ids are empty', () => {
    assert.deepEqual(
      orphanKitchenSyncedMenuItemIds([jollof, egusi], []),
      [],
    )
  })

  it('does not deactivate when the client omitted the valid-id payload', () => {
    assert.deepEqual(orphanKitchenSyncedMenuItemIds([jollof], []), [])
  })

  it('deactivates only dishes whose kitchen stock id is missing', () => {
    assert.deepEqual(
      orphanKitchenSyncedMenuItemIds([jollof, egusi, inactive, unlinked], [
        'ks-jollof-rice',
      ]),
      ['menu-egusi'],
    )
  })

  it('keeps active dishes that still have a batch', () => {
    assert.deepEqual(
      orphanKitchenSyncedMenuItemIds([jollof, egusi], [
        'ks-jollof-rice',
        'ks-egusi',
      ]),
      [],
    )
  })
})
