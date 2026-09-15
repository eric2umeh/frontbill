import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  buildExtendStayDiscountCollectionRow,
  relatedRecordString,
  shouldPostExtendStayDiscountCollection,
} from '@/lib/booking/extend-stay-discount-collection'
import { summarizeDayLedgerCollections } from '@/lib/payments/day-ledger-collections'

describe('shouldPostExtendStayDiscountCollection', () => {
  it('posts cash, POS, and transfer collections', () => {
    assert.equal(shouldPostExtendStayDiscountCollection('cash', 30_000), true)
    assert.equal(shouldPostExtendStayDiscountCollection('pos', 30_000), true)
    assert.equal(shouldPostExtendStayDiscountCollection('transfer', 30_000), true)
  })

  it('does not post city-ledger, complimentary, pending, or zero amounts', () => {
    assert.equal(shouldPostExtendStayDiscountCollection('city_ledger', 30_000), false)
    assert.equal(shouldPostExtendStayDiscountCollection('complimentary', 30_000), false)
    assert.equal(shouldPostExtendStayDiscountCollection('pending', 30_000), false)
    assert.equal(shouldPostExtendStayDiscountCollection('cash', 0), false)
    assert.equal(shouldPostExtendStayDiscountCollection('cash', -1), false)
  })
})

describe('buildExtendStayDiscountCollectionRow', () => {
  const base = {
    organizationId: 'org-1',
    bookingId: 'bk-9',
    guestName: 'Ada Okafor',
    roomNumber: '101',
    amount: 30_000,
    paymentMethod: 'cash',
    nights: 2,
    userId: 'staff-1',
    nowMs: 1_700_000_000_000,
  }

  it('builds a paid EXT-* transaction matching standard extend-stay collections', () => {
    const row = buildExtendStayDiscountCollectionRow(base)
    assert.ok(row)
    assert.equal(row.organization_id, 'org-1')
    assert.equal(row.booking_id, 'bk-9')
    assert.equal(row.transaction_id, 'EXT-bk-9-1700000000000')
    assert.equal(row.guest_name, 'Ada Okafor')
    assert.equal(row.room, '101')
    assert.equal(row.amount, 30_000)
    assert.equal(row.payment_method, 'cash')
    assert.equal(row.status, 'paid')
    assert.equal(row.description, 'Extended Stay — 2 nights (discounted)')
    assert.equal(row.received_by, 'staff-1')
  })

  it('returns null when Night Audit approval would otherwise mint a city-ledger cash row', () => {
    assert.equal(
      buildExtendStayDiscountCollectionRow({ ...base, paymentMethod: 'city_ledger' }),
      null,
    )
  })

  it('falls back to Guest when the booking has no guest name', () => {
    const row = buildExtendStayDiscountCollectionRow({ ...base, guestName: null, nights: 1 })
    assert.ok(row)
    assert.equal(row.guest_name, 'Guest')
    assert.equal(row.description, 'Extended Stay — 1 night (discounted)')
  })

  it('counts the collection in Night Audit / Daily book cash totals', () => {
    const row = buildExtendStayDiscountCollectionRow(base)
    assert.ok(row)
    const summary = summarizeDayLedgerCollections(
      [
        {
          amount: row.amount,
          payment_method: String(row.payment_method),
          status: String(row.status),
          booking_id: String(row.booking_id),
          transaction_id: String(row.transaction_id),
          guest_name: String(row.guest_name),
          description: String(row.description),
        },
      ],
      [],
    )
    assert.equal(summary.totalRevenue, 30_000)
    assert.equal(summary.revenues.cash, 30_000)
    assert.equal(summary.count, 1)
  })
})

describe('relatedRecordString', () => {
  it('reads nested and array-shaped supabase relations', () => {
    assert.equal(relatedRecordString({ name: 'Ada' }, 'name'), 'Ada')
    assert.equal(relatedRecordString([{ room_number: '12' }], 'room_number'), '12')
    assert.equal(relatedRecordString(null, 'name'), '')
  })
})
