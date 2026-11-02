import assert from 'node:assert/strict'
import test from 'node:test'
import { summarizeDayLedgerCollections } from '@/lib/payments/day-ledger-collections'
import { drawerCollectionAmount } from '@/lib/payments/drawer-collection'

const at = '2026-11-02T18:00:00.000Z'

test('drawer collection is the cash received, never a zero or credit', () => {
  assert.equal(drawerCollectionAmount(30000), 30000)
  assert.equal(drawerCollectionAmount(0), 0)
  assert.equal(drawerCollectionAmount(-10), 0)
  assert.equal(drawerCollectionAmount(Number.NaN), 0)
  assert.equal(drawerCollectionAmount(10.005), 10.01)
})

test('partial reservation cash is not counted as the full stay plus the deposit', () => {
  const stayTotal = 100_000
  const deposit = 30_000
  const recorded = drawerCollectionAmount(deposit)

  const corrected = summarizeDayLedgerCollections(
    [
      {
        amount: recorded,
        payment_method: 'pos',
        status: 'partial',
        booking_id: 'booking-1',
        created_at: at,
        transaction_id: 'TXN-1',
        description: 'Reservation — FOL-1',
      },
    ],
    [
      {
        amount: recorded,
        payment_method: 'pos',
        booking_id: 'booking-1',
        payment_date: at,
        notes: 'Reservation payment — Folio FOL-1',
      },
    ],
  )
  assert.equal(corrected.totalRevenue, 30_000)
  assert.equal(corrected.revenues.pos, 30_000)

  const inflated = summarizeDayLedgerCollections(
    [
      {
        amount: stayTotal,
        payment_method: 'pos',
        status: 'partial',
        booking_id: 'booking-1',
        created_at: at,
        transaction_id: 'TXN-1',
        description: 'Reservation — FOL-1',
      },
    ],
    [
      {
        amount: deposit,
        payment_method: 'pos',
        booking_id: 'booking-1',
        payment_date: at,
        notes: 'Reservation payment — Folio FOL-1',
      },
    ],
  )
  assert.equal(inflated.totalRevenue, 130_000)
})

test('a stay covered only by cashback does not create a drawer collection', () => {
  assert.equal(drawerCollectionAmount(0), 0)
  const summary = summarizeDayLedgerCollections([], [])
  assert.equal(summary.totalRevenue, 0)
})
