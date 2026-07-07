import assert from 'node:assert/strict'
import { test } from 'node:test'

import { eventOrganizationBelongsToHotel } from '../lib/events/resolve-event-client'
import { canSyncRestaurantBatchToOutlet } from '../lib/supply-chain/outlet-sync-permissions'
import { resolveProfileOrganizationScope } from '../lib/supply-chain/supply-org-scope'
import { writableSupplySnapshotKeysForRole } from '../lib/supply-chain/supply-snapshot-permissions'

test('event organization links must belong to the caller hotel', () => {
  const hotelOrgId = 'hotel-a'
  const counterparty = {
    id: 'counterparty-a',
    name: 'Acme Ltd',
    org_type: 'corporate',
    created_by: 'user-a',
  }

  assert.equal(eventOrganizationBelongsToHotel(counterparty, hotelOrgId, hotelOrgId), true)
  assert.equal(eventOrganizationBelongsToHotel(counterparty, 'hotel-b', hotelOrgId), false)
  assert.equal(
    eventOrganizationBelongsToHotel({ ...counterparty, id: hotelOrgId }, hotelOrgId, hotelOrgId),
    false,
  )
  assert.equal(
    eventOrganizationBelongsToHotel({ ...counterparty, created_by: null }, hotelOrgId, hotelOrgId),
    false,
  )
  assert.equal(
    eventOrganizationBelongsToHotel({ ...counterparty, org_type: null }, hotelOrgId, hotelOrgId),
    false,
  )
})

test('null-org supply profiles cannot be scoped from client-supplied organization ids', () => {
  assert.equal(resolveProfileOrganizationScope(null, 'victim-hotel'), null)
  assert.equal(resolveProfileOrganizationScope('', 'victim-hotel'), null)
  assert.equal(resolveProfileOrganizationScope('hotel-a', 'hotel-a'), 'hotel-a')
  assert.equal(resolveProfileOrganizationScope('hotel-a', null), 'hotel-a')
  assert.equal(resolveProfileOrganizationScope('hotel-a', 'hotel-b'), null)
})

test('recipe snapshots are writable only by batch-standard admins', () => {
  assert.equal(writableSupplySnapshotKeysForRole('chef').has('batches'), true)
  assert.equal(writableSupplySnapshotKeysForRole('chef').has('recipes'), false)
  assert.equal(writableSupplySnapshotKeysForRole('store').has('recipes'), false)
  assert.equal(writableSupplySnapshotKeysForRole('manager').has('recipes'), false)
  assert.equal(writableSupplySnapshotKeysForRole('admin').has('recipes'), true)
  assert.equal(writableSupplySnapshotKeysForRole('superadmin').has('recipes'), true)
})

test('live restaurant batch menu sync excludes kitchen-only and F&B staff roles', () => {
  assert.equal(canSyncRestaurantBatchToOutlet('chef'), false)
  assert.equal(canSyncRestaurantBatchToOutlet('food_beverage'), false)
  assert.equal(canSyncRestaurantBatchToOutlet('manager'), true)
  assert.equal(canSyncRestaurantBatchToOutlet('admin'), true)
  assert.equal(canSyncRestaurantBatchToOutlet('superadmin'), true)
})
