import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  filterSnapshotPayload,
  snapshotsPayloadForRole,
  writableSnapshotKeysForStatePut,
} from '../lib/supply-chain/supply-snapshot-payload'
import {
  KITCHEN_WRITE_SNAPSHOT_KEYS,
  OUTLET_STOCK_WRITE_SNAPSHOT_KEYS,
  SUPPLY_SNAPSHOT_KEYS,
  type SupplySnapshotKey,
} from '../lib/supply-chain/supply-db-mappers'

const ALL: Partial<Record<SupplySnapshotKey, unknown>> = {
  recipes: [{ id: 'r1' }],
  batches: [{ id: 'b1' }],
  kitchen_stock: [{ id: 'ks1', availablePortions: 8 }],
  kitchen_raw_stock: [{ id: 'kr1' }],
  bar_stock: [{ id: 'bar-heineken', quantityOnHand: 12 }],
  fnb_raw_stock: [{ id: 'fnb1' }],
  fnb_daily_sheets: [{ id: 'd1' }],
  fnb_movements: [{ id: 'm1' }],
  purchase_orders: [{ id: 'po1' }],
  issue_out_log: [{ id: 'io1' }],
  activity_log: [{ id: 'a1' }],
  pending_items: [{ id: 'p1' }],
  basket: [{ id: 'bk1' }],
}

test('F&B bar count payload includes outlet stock and omits POs/recipes', () => {
  const payload = snapshotsPayloadForRole(ALL, 'food_beverage')
  assert.deepEqual(Object.keys(payload).sort(), ['bar_stock', 'kitchen_stock'])
  assert.equal(
    (payload.bar_stock as { quantityOnHand: number }[])[0].quantityOnHand,
    12,
  )
  assert.equal(payload.purchase_orders, undefined)
  assert.equal(payload.recipes, undefined)
  assert.equal(payload.basket, undefined)
  assert.equal(payload.issue_out_log, undefined)
})

test('F&B bar count PUT is allowed only for bar_stock and kitchen_stock', () => {
  const keys = writableSnapshotKeysForStatePut('food_beverage')
  assert.ok(keys)
  assert.deepEqual([...keys].sort(), [...OUTLET_STOCK_WRITE_SNAPSHOT_KEYS].sort())
  assert.ok(!keys.includes('purchase_orders'))
  assert.ok(!keys.includes('recipes'))
  assert.ok(!keys.includes('issue_out_log'))
})

test('cashier (POS) can persist outlet stock counts the same way as F&B', () => {
  const payload = snapshotsPayloadForRole(ALL, 'cashier')
  assert.deepEqual(Object.keys(payload).sort(), ['bar_stock', 'kitchen_stock'])
  const keys = writableSnapshotKeysForStatePut('cashier')
  assert.deepEqual(keys && [...keys].sort(), [...OUTLET_STOCK_WRITE_SNAPSHOT_KEYS].sort())
})

test('front desk cannot persist supply snapshots', () => {
  assert.deepEqual(snapshotsPayloadForRole(ALL, 'front_desk'), {})
  assert.equal(writableSnapshotKeysForStatePut('front_desk'), null)
})

test('chef persist stays kitchen-gated and does not write bar_stock', () => {
  const payload = snapshotsPayloadForRole(ALL, 'chef')
  assert.deepEqual(Object.keys(payload).sort(), [...KITCHEN_WRITE_SNAPSHOT_KEYS].sort())
  assert.equal(payload.bar_stock, undefined)
  const keys = writableSnapshotKeysForStatePut('chef')
  assert.deepEqual(keys && [...keys].sort(), [...KITCHEN_WRITE_SNAPSHOT_KEYS].sort())
})

test('store persist still writes the full snapshot set', () => {
  const payload = snapshotsPayloadForRole(ALL, 'store')
  assert.equal(payload, ALL)
  const keys = writableSnapshotKeysForStatePut('store')
  assert.deepEqual(keys && [...keys], [...SUPPLY_SNAPSHOT_KEYS])
})

test('filterSnapshotPayload drops kitchen_stock from an F&B bar-only count', () => {
  const fnb = snapshotsPayloadForRole(ALL, 'food_beverage')
  const barOnly = filterSnapshotPayload(fnb, ['bar_stock'])
  assert.deepEqual(Object.keys(barOnly), ['bar_stock'])
  assert.equal(barOnly.kitchen_stock, undefined)
})

test('pre-fix F&B persist was a silent no-op (empty payload without the outlet branch)', () => {
  // Guard: if someone removes the outlet branch, F&B counts would toast success and never save.
  const payload = snapshotsPayloadForRole(ALL, 'food_beverage')
  assert.ok(
    Object.keys(payload).length > 0,
    'F&B physical counts must produce a non-empty snapshot PUT',
  )
})
