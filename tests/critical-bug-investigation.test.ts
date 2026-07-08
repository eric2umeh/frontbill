import assert from 'node:assert/strict'
import test from 'node:test'

import { overlappingBookedRoomIds } from '../lib/bookings/active-room-holds'
import { mergeProductionBatchesFromRemote } from '../lib/supply-chain/kitchen-sync-merge'
import { validateRetirementSubmission } from '../lib/supply-chain/retirement-validation'
import type { ProductionBatch, PurchaseOrder } from '../lib/supply-chain/types'

function batch(
  overrides: Partial<ProductionBatch> & Pick<ProductionBatch, 'id' | 'status'>,
): ProductionBatch {
  const { id, status, ...rest } = overrides
  return {
    id,
    recipeName: 'Jollof Rice',
    shift: 'Morning',
    status,
    plannedPortions: 20,
    actualPortions: 0,
    foodCostPct: 0,
    variancePct: 0,
    materialsUsed: [],
    openedAt: '2026-07-08T08:00:00.000Z',
    openedBy: 'Chef',
    ...rest,
  }
}

function purchaseOrder(overrides: Partial<PurchaseOrder> = {}): PurchaseOrder {
  return {
    id: 'po-1',
    poNumber: 'PO-001',
    weekLabel: '2026-W28',
    status: 'disbursed',
    createdBy: 'store-user',
    createdByName: 'Store User',
    createdAt: '2026-07-08T08:00:00.000Z',
    cashDisbursed: 15000,
    totalAmount: 15000,
    lines: [
      {
        id: 'line-rice',
        stockItemId: 'rice',
        name: 'Rice',
        dept: 'kitchen',
        unit: 'bag',
        quantityOrdered: 1,
        unitPrice: 15000,
        lineTotal: 15000,
      },
    ],
    ...overrides,
  }
}

test('production batch merge keeps a remote completed run over stale local in-progress state', () => {
  const merged = mergeProductionBatchesFromRemote(
    [
      batch({
        id: 'batch-1',
        status: 'in_progress',
        openedAt: '2026-07-08T08:00:00.000Z',
      }),
    ],
    [
      batch({
        id: 'batch-1',
        status: 'completed',
        actualPortions: 18,
        openedAt: '2026-07-08T08:00:00.000Z',
        closedAt: '2026-07-08T09:30:00.000Z',
      }),
    ],
  )

  assert.equal(merged.length, 1)
  assert.equal(merged[0].status, 'completed')
  assert.equal(merged[0].actualPortions, 18)
  assert.equal(merged[0].closedAt, '2026-07-08T09:30:00.000Z')
})

test('production batch merge keeps a local completed run over stale remote in-progress state', () => {
  const merged = mergeProductionBatchesFromRemote(
    [
      batch({
        id: 'batch-1',
        status: 'completed',
        actualPortions: 22,
        openedAt: '2026-07-08T08:00:00.000Z',
        closedAt: '2026-07-08T10:00:00.000Z',
      }),
    ],
    [
      batch({
        id: 'batch-1',
        status: 'in_progress',
        openedAt: '2026-07-08T08:00:00.000Z',
      }),
    ],
  )

  assert.equal(merged.length, 1)
  assert.equal(merged[0].status, 'completed')
  assert.equal(merged[0].actualPortions, 22)
})

test('overlappingBookedRoomIds includes newly fetched conflicting holds only', () => {
  const booked = overlappingBookedRoomIds(
    [
      { room_id: 'room-overlap-starts-before', check_in: '2026-07-07', check_out: '2026-07-09' },
      { room_id: 'room-overlap-ends-after', check_in: '2026-07-10', check_out: '2026-07-12' },
      { room_id: 'room-before', check_in: '2026-07-01', check_out: '2026-07-08' },
      { room_id: 'room-after', check_in: '2026-07-12', check_out: '2026-07-14' },
      { room_id: null, check_in: '2026-07-08', check_out: '2026-07-11' },
    ],
    '2026-07-08',
    '2026-07-11',
  )

  assert.deepEqual([...booked].sort(), ['room-overlap-ends-after', 'room-overlap-starts-before'])
})

test('retirement validation rejects empty submissions that would retire a PO without lines', () => {
  assert.equal(
    validateRetirementSubmission(purchaseOrder(), []),
    'Retirement must include every purchase-order line',
  )
})

test('retirement validation requires every purchase-order line exactly once', () => {
  const po = purchaseOrder({
    lines: [
      ...purchaseOrder().lines,
      {
        id: 'line-oil',
        stockItemId: 'oil',
        name: 'Oil',
        dept: 'kitchen',
        unit: 'litre',
        quantityOrdered: 5,
        unitPrice: 1000,
        lineTotal: 5000,
      },
    ],
  })

  assert.equal(
    validateRetirementSubmission(po, [
      {
        lineId: 'line-rice',
        name: 'Rice',
        unit: 'bag',
        quantityOrdered: 1,
        quantityBought: 1,
        poPrice: 15000,
        actualPrice: 15000,
        totalPaid: 15000,
      },
    ]),
    'Retirement is missing Oil',
  )
})
