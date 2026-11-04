import assert from 'node:assert/strict'
import test from 'node:test'
import { summarizeSalesCollection } from '../lib/reports/sales-collection-inflows.ts'

const at = '2026-11-04T10:00:00.000Z'
const later = '2026-11-04T10:10:00.000Z'

test('check-in dual-write is counted once as accommodation', () => {
  const bookingId = 'booking-1'
  const result = summarizeSalesCollection({
    payments: [
      {
        booking_id: bookingId,
        amount: 50000,
        payment_method: 'pos',
        payment_date: at,
        notes: 'Check-in payment — Folio FOL-1',
      },
    ],
    transactions: [
      {
        booking_id: bookingId,
        amount: 50000,
        payment_method: 'pos',
        created_at: at,
        status: 'completed',
        transaction_id: 'TXN-CHECKIN',
        description: 'Check-in — Folio FOL-1',
      },
    ],
  })

  assert.equal(result.gross, 50000)
  assert.equal(result.paymentsTotal, 50000)
  assert.equal(result.transactionsTotal, 0)

  const accommodation = summarizeSalesCollection({
    payments: [
      {
        booking_id: bookingId,
        amount: 50000,
        payment_method: 'pos',
        payment_date: at,
        notes: 'Check-in payment — Folio FOL-1',
      },
    ],
    transactions: [
      {
        booking_id: bookingId,
        amount: 50000,
        payment_method: 'pos',
        created_at: at,
        status: 'completed',
        transaction_id: 'TXN-CHECKIN',
        description: 'Check-in — Folio FOL-1',
      },
    ],
    department: 'accommodation',
  })
  assert.equal(accommodation.gross, 50000)

  const other = summarizeSalesCollection({
    payments: [
      {
        booking_id: bookingId,
        amount: 50000,
        payment_method: 'pos',
        payment_date: at,
        notes: 'Check-in payment — Folio FOL-1',
      },
    ],
    transactions: [
      {
        booking_id: bookingId,
        amount: 50000,
        payment_method: 'pos',
        created_at: at,
        status: 'completed',
        transaction_id: 'TXN-CHECKIN',
        description: 'Check-in — Folio FOL-1',
      },
    ],
    department: 'other',
  })
  assert.equal(other.gross, 0)
})

test('a receipt that exists only as a transaction is still collected', () => {
  const result = summarizeSalesCollection({
    payments: [],
    transactions: [
      {
        booking_id: 'booking-1',
        amount: 20000,
        payment_method: 'cash',
        created_at: at,
        status: 'completed',
        transaction_id: 'TXN-ONLY',
        description: 'Check-in — Folio FOL-2',
      },
    ],
  })
  assert.equal(result.gross, 20000)
  assert.equal(result.transactionsTotal, 20000)
})

test('outlet cash payment is not added again as an OUT transaction', () => {
  const result = summarizeSalesCollection({
    payments: [
      {
        booking_id: null,
        amount: 8000,
        payment_method: 'cash',
        payment_date: at,
        notes: 'Restaurant — RES-20261104-AB12 — Fried rice',
      },
    ],
    transactions: [
      {
        booking_id: null,
        amount: 8000,
        payment_method: 'cash',
        created_at: at,
        status: 'paid',
        transaction_id: 'OUT-RES-20261104-AB12',
        description: 'Restaurant — RES-20261104-AB12 — Fried rice',
      },
    ],
  })
  assert.equal(result.gross, 8000)
  assert.equal(result.paymentsTotal, 8000)
  assert.equal(result.transactionsTotal, 0)
})

test('city-ledger outlet charge with no cash payment is not sales collection', () => {
  const result = summarizeSalesCollection({
    payments: [],
    transactions: [
      {
        booking_id: 'booking-1',
        amount: 4500,
        payment_method: 'city_ledger',
        created_at: at,
        status: 'pending',
        transaction_id: 'OUT-RES-20261104-CD34',
        description: 'Restaurant — RES-20261104-CD34',
      },
    ],
  })
  assert.equal(result.gross, 0)
})

test('partial deposit and a larger stay transaction stay separate', () => {
  const result = summarizeSalesCollection({
    payments: [
      {
        booking_id: 'booking-1',
        amount: 30000,
        payment_method: 'pos',
        payment_date: at,
        notes: 'Reservation deposit',
      },
    ],
    transactions: [
      {
        booking_id: 'booking-1',
        amount: 100000,
        payment_method: 'pos',
        created_at: at,
        status: 'pending',
        transaction_id: 'TXN-RSV',
        description: 'Reservation — Folio FOL-3',
      },
    ],
  })
  assert.equal(result.gross, 130000)
})

test('a voided transaction does not hide the cash payment', () => {
  const result = summarizeSalesCollection({
    payments: [
      {
        booking_id: 'booking-1',
        amount: 15000,
        payment_method: 'transfer',
        payment_date: at,
        notes: 'Transfer receipt',
      },
    ],
    transactions: [
      {
        booking_id: 'booking-1',
        amount: 15000,
        payment_method: 'transfer',
        created_at: at,
        status: 'void',
        transaction_id: 'TXN-VOID',
        description: 'Check-in — Folio FOL-4',
      },
    ],
  })
  assert.equal(result.gross, 15000)
  assert.equal(result.paymentsTotal, 15000)
})

test('two equal payments are not collapsed onto one transaction', () => {
  const result = summarizeSalesCollection({
    payments: [
      {
        booking_id: 'booking-1',
        amount: 10000,
        payment_method: 'cash',
        payment_date: at,
        notes: 'First',
      },
      {
        booking_id: 'booking-1',
        amount: 10000,
        payment_method: 'cash',
        payment_date: '2026-11-04T10:01:00.000Z',
        notes: 'Second',
      },
    ],
    transactions: [
      {
        booking_id: 'booking-1',
        amount: 10000,
        payment_method: 'cash',
        created_at: at,
        status: 'completed',
        transaction_id: 'TXN-ONE',
        description: 'Check-in — Folio FOL-5',
      },
    ],
  })
  assert.equal(result.gross, 20000)
  assert.equal(result.paymentsTotal, 20000)
  assert.equal(result.transactionsTotal, 0)
})

test('same amount outside the dual-write window is not treated as a duplicate', () => {
  const result = summarizeSalesCollection({
    payments: [
      {
        booking_id: 'booking-1',
        amount: 50000,
        payment_method: 'pos',
        payment_date: later,
        notes: 'Later payment',
      },
    ],
    transactions: [
      {
        booking_id: 'booking-1',
        amount: 50000,
        payment_method: 'pos',
        created_at: at,
        status: 'completed',
        transaction_id: 'TXN-EARLY',
        description: 'Check-in — Folio FOL-6',
      },
    ],
  })
  assert.equal(result.gross, 100000)
})

test('voided outlet payment is excluded', () => {
  const result = summarizeSalesCollection({
    payments: [
      {
        amount: 6000,
        payment_method: 'cash',
        payment_date: at,
        notes: 'Bar — RES-20261104-ZZ99 — Stout',
      },
    ],
    transactions: [],
    voidedOutletOrderNumbers: new Set(['RES-20261104-ZZ99']),
  })
  assert.equal(result.gross, 0)
})
