import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import {
  convertToStoreUnitsWithFactors,
  unitFactorDefinition,
} from '../lib/supply-chain/unit-factor-storage'
import { resolveRetirementStockReceipts } from '../lib/supply-chain/purchase-retirement'
import type { PurchaseOrder, RetirementLine, StoreItem } from '../lib/supply-chain/types'

const storeItem: StoreItem = {
  id: 'item-1',
  name: 'Serviette',
  unit: 'pcs',
  dept: 'housekeeping',
  quantityInStore: 0,
  reorderLevel: 0,
  lastPrice: 0,
  benchmarkPrice: 0,
  unitFactors: { __per_carton: 24 },
}

const po: PurchaseOrder = {
  id: 'po-1',
  poNumber: 'PO-1',
  weekLabel: 'Week',
  status: 'retirement_pending_accountant',
  createdBy: 'Store',
  createdByName: 'Store',
  createdAt: '2026-06-20T00:00:00.000Z',
  cashDisbursed: 2400,
  totalAmount: 2400,
  lines: [
    {
      id: 'line-1',
      stockItemId: storeItem.id,
      name: storeItem.name,
      dept: storeItem.dept,
      unit: 'carton',
      quantityOrdered: 2,
      unitPrice: 1200,
      lineTotal: 2400,
    },
  ],
}

const retirementLine: RetirementLine = {
  lineId: 'line-1',
  name: storeItem.name,
  unit: 'carton',
  quantityOrdered: 2,
  quantityBought: 2,
  poPrice: 1200,
  actualPrice: 1200,
  totalPaid: 2400,
  notBought: false,
}

describe('purchase unit conversion regressions', () => {
  it('treats cartons as containers when converting to store pieces', () => {
    const def = unitFactorDefinition('pcs', 'carton')

    assert.equal(def?.storageKey, '__per_carton')
    assert.equal(convertToStoreUnitsWithFactors(2, 'carton', 'pcs', { __per_carton: 24 }), 48)
  })

  it('resolves legacy retirement lines from purchase units into store units', () => {
    const result = resolveRetirementStockReceipts(po, [retirementLine], [storeItem])

    assert.deepEqual(result, {
      ok: true,
      receipts: [
        {
          lineId: 'line-1',
          storeItemId: 'item-1',
          stockQty: 48,
          stockUnitPrice: 50,
        },
      ],
    })
  })

  it('fails retirement approval when a converted line has no pack factor', () => {
    const result = resolveRetirementStockReceipts(
      po,
      [retirementLine],
      [{ ...storeItem, unitFactors: undefined }],
    )

    assert.equal('error' in result, true)
  })
})
