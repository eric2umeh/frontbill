import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  mergePurchaseOrdersFromRemote,
  mergeRetirementRecords,
} from '@/lib/supply-chain/po-sync-merge'
import { stockedQtyForPoLine } from '@/lib/supply-chain/add-to-stock'
import type {
  PurchaseOrder,
  RetirementLine,
  RetirementRecord,
} from '@/lib/supply-chain/types'

const STOCKED_AT = '2026-08-22T10:00:00.000Z'

function line(partial: Partial<RetirementLine> & Pick<RetirementLine, 'quantityBought' | 'actualPrice'>): RetirementLine {
  const qty = partial.quantityBought
  const price = partial.actualPrice
  return {
    lineId: 'rice-1',
    name: 'Rice',
    unit: 'bag',
    quantityOrdered: 10,
    quantityBought: qty,
    actualPrice: price,
    poPrice: 500,
    totalPaid: qty * price,
    stockQuantityBought: qty,
    stockedAt: STOCKED_AT,
    batchId: 'ats-1',
    reviewStatus: 'pending_review',
    ...partial,
    totalPaid: (partial.totalPaid ?? qty * price),
  }
}

function retirement(lines: RetirementLine[], extra?: Partial<RetirementRecord>): RetirementRecord {
  const actualSpent = lines
    .filter((l) => !(l.notBought || l.removed))
    .reduce((s, l) => s + l.totalPaid, 0)
  return {
    actualSpent,
    refundToCashier: 5000 - actualSpent,
    priceChanges: 0,
    lines,
    batches: [
      {
        id: 'ats-1',
        submittedAt: STOCKED_AT,
        submittedBy: 'Store',
        lineIds: lines.map((l) => l.lineId),
        actualSpent,
        status: 'pending_review',
      },
    ],
    submittedAt: STOCKED_AT,
    submittedBy: 'Store',
    ...extra,
  }
}

function po(id: string, rec: RetirementRecord, workflowUpdatedAt: string): PurchaseOrder {
  return {
    id,
    poNumber: 'PO-W2026-34-TEST',
    weekLabel: 'Week of 17 Aug 2026 – 23 Aug 2026',
    status: 'retirement_pending_accountant',
    createdBy: 'store-1',
    createdByName: 'Store',
    createdAt: '2026-08-22T09:00:00.000Z',
    workflowUpdatedAt,
    cashDisbursed: 5000,
    totalAmount: 5000,
    lines: [
      {
        id: 'rice-1',
        stockItemId: 'st-rice',
        name: 'Rice',
        dept: 'kitchen',
        unit: 'bag',
        quantityOrdered: 10,
        unitPrice: 500,
        lineTotal: 5000,
      },
    ],
    retirement: rec,
  }
}

describe('retirement correction merge', () => {
  it('does not duplicate a line when review corrects qty against the stored snapshot', () => {
    const original = line({ quantityBought: 10, actualPrice: 500 })
    const corrected = line({
      quantityBought: 8,
      actualPrice: 500,
      corrections: [
        {
          at: '2026-08-22T11:00:00.000Z',
          by: 'Ada',
          role: 'accountant',
          field: 'qty',
          from: 10,
          to: 8,
        },
      ],
    })

    const merged = mergeRetirementRecords(
      retirement([corrected]),
      retirement([original]),
    )

    assert.ok(merged)
    assert.equal(merged.lines.length, 1)
    assert.equal(merged.lines[0].quantityBought, 8)
    assert.equal(merged.actualSpent, 4000)
    assert.equal(merged.lines[0].corrections?.length, 1)
  })

  it('does not duplicate a line when review corrects price', () => {
    const original = line({ quantityBought: 10, actualPrice: 500 })
    const corrected = line({
      quantityBought: 10,
      actualPrice: 400,
      corrections: [
        {
          at: '2026-08-22T11:05:00.000Z',
          by: 'Ada',
          role: 'accountant',
          field: 'price',
          from: 500,
          to: 400,
        },
      ],
    })

    const merged = mergeRetirementRecords(
      retirement([original]),
      retirement([corrected]),
    )

    assert.ok(merged)
    assert.equal(merged.lines.length, 1)
    assert.equal(merged.lines[0].actualPrice, 400)
    assert.equal(merged.actualSpent, 4000)
  })

  it('keeps two legitimate submits of the same PO line with different stockedAt', () => {
    const first = line({
      quantityBought: 5,
      actualPrice: 500,
      stockedAt: '2026-08-20T10:00:00.000Z',
      batchId: 'ats-a',
    })
    const second = line({
      quantityBought: 5,
      actualPrice: 500,
      stockedAt: '2026-08-21T10:00:00.000Z',
      batchId: 'ats-b',
    })

    const merged = mergeRetirementRecords(retirement([first]), retirement([second]))
    assert.ok(merged)
    assert.equal(merged.lines.length, 2)
    assert.equal(merged.actualSpent, 5000)
  })

  it('server PUT merge of corrected PO vs stored original does not inflate spend', () => {
    const original = po(
      'po-1',
      retirement([line({ quantityBought: 10, actualPrice: 500 })]),
      '2026-08-22T10:00:00.000Z',
    )
    const corrected = po(
      'po-1',
      retirement([
        line({
          quantityBought: 8,
          actualPrice: 500,
          corrections: [
            {
              at: '2026-08-22T11:00:00.000Z',
              by: 'Ada',
              role: 'accountant',
              field: 'qty',
              from: 10,
              to: 8,
            },
          ],
        }),
      ]),
      '2026-08-22T11:00:00.000Z',
    )

    // PUT path: incoming client payload first, existing DB snapshot second.
    const merged = mergePurchaseOrdersFromRemote([corrected], [original])
    assert.equal(merged.length, 1)
    assert.equal(merged[0].retirement?.lines.length, 1)
    assert.equal(merged[0].retirement?.lines[0].quantityBought, 8)
    assert.equal(merged[0].retirement?.actualSpent, 4000)
    assert.equal(merged[0].retirement?.refundToCashier, 1000)
  })

  it('heals a snapshot that already stored both original and corrected rows', () => {
    const corrupted = po(
      'po-1',
      retirement([
        line({ quantityBought: 10, actualPrice: 500 }),
        line({
          quantityBought: 8,
          actualPrice: 500,
          corrections: [
            {
              at: '2026-08-22T11:00:00.000Z',
              by: 'Ada',
              role: 'accountant',
              field: 'qty',
              from: 10,
              to: 8,
            },
          ],
        }),
      ]),
      '2026-08-22T11:00:00.000Z',
    )

    const merged = mergePurchaseOrdersFromRemote([], [corrupted])
    assert.equal(merged[0].retirement?.lines.length, 1)
    assert.equal(merged[0].retirement?.lines[0].quantityBought, 8)
    assert.equal(merged[0].retirement?.actualSpent, 4000)
    assert.equal(merged[0].retirement?.refundToCashier, 1000)
    assert.equal(stockedQtyForPoLine(merged[0], 'rice-1'), 8)
  })

  it('stockedQtyForPoLine does not double-count original + corrected copies', () => {
    const corrupted = po(
      'po-1',
      retirement([
        line({ quantityBought: 10, actualPrice: 500 }),
        line({
          quantityBought: 8,
          actualPrice: 500,
          corrections: [
            {
              at: '2026-08-22T11:00:00.000Z',
              by: 'Ada',
              role: 'accountant',
              field: 'qty',
              from: 10,
              to: 8,
            },
          ],
        }),
      ]),
      '2026-08-22T11:00:00.000Z',
    )
    assert.equal(stockedQtyForPoLine(corrupted, 'rice-1'), 8)
  })
})
