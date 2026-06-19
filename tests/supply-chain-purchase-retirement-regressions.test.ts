import test from 'node:test'
import assert from 'node:assert/strict'

import {
  retirementStockQuantity,
  validateRetirementStockCredits,
} from '../lib/supply-chain/po-retirement'
import { mergeUnitFactorUpdate } from '../lib/supply-chain/unit-factor-storage'
import type { PoLine, PurchaseOrder, RetirementLine } from '../lib/supply-chain/types'

const poLine: PoLine = {
  id: 'line-1',
  stockItemId: 'stock-1',
  name: 'Soft Drink',
  dept: 'main_bar',
  unit: 'crate',
  quantityOrdered: 2,
  unitPrice: 12000,
  storeUnit: 'bottle',
  stockQuantityOrdered: 48,
  stockUnitPrice: 500,
  lineTotal: 24000,
}

const po: PurchaseOrder = {
  id: 'po-1',
  poNumber: 'PO-001',
  weekLabel: 'Week 1',
  status: 'retirement_pending_accountant',
  createdBy: 'Store',
  createdByName: 'Store',
  createdAt: '2026-06-19T00:00:00.000Z',
  cashDisbursed: 24000,
  lines: [poLine],
  totalAmount: 24000,
}

const retirementLine: RetirementLine = {
  lineId: 'line-1',
  name: 'Soft Drink',
  unit: 'crate',
  storeUnit: 'bottle',
  quantityOrdered: 2,
  stockQuantityOrdered: 48,
  quantityBought: 1,
  poPrice: 12000,
  actualPrice: 15000,
  totalPaid: 15000,
  notBought: false,
}

test('retirement validation blocks acceptance when the catalogue item was deleted', () => {
  const result = validateRetirementStockCredits(po, [retirementLine], [])

  assert.equal('error' in result, true)
  assert.match((result as { error: string }).error, /no longer in the central store catalogue/)
})

test('retirement validation blocks ambiguous purchase-unit to store-unit credits', () => {
  const legacyPo = {
    ...po,
    lines: [{ ...poLine, stockQuantityOrdered: undefined }],
  }
  const legacyLine = {
    ...retirementLine,
    stockQuantityOrdered: undefined,
    stockQuantityBought: undefined,
  }

  const result = validateRetirementStockCredits(legacyPo, [legacyLine], [{ id: 'stock-1' }])

  assert.equal('error' in result, true)
  assert.match((result as { error: string }).error, /missing its store-unit conversion/)
})

test('retirement validation credits proportional store quantity and unit price', () => {
  const result = validateRetirementStockCredits(po, [retirementLine], [{ id: 'stock-1' }])

  assert.deepEqual(result, {
    ok: true,
    credits: [
      {
        stockItemId: 'stock-1',
        stockQty: 24,
        stockUnitPrice: 625,
      },
    ],
  })
  assert.equal(retirementStockQuantity(poLine, retirementLine), 24)
})

test('unit factor updates preserve existing conversion keys', () => {
  assert.deepEqual(
    mergeUnitFactorUpdate({ pack: 9 }, { __per_crate: 24 }),
    { pack: 9, __per_crate: 24 },
  )
})
