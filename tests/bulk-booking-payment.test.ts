import assert from 'node:assert/strict'
import test from 'node:test'

import { resolveBulkBookingPayment } from '../lib/reservations/bulk-booking-payment'

test('fully paid bulk bookings record the room total as paid', () => {
  assert.deepEqual(
    resolveBulkBookingPayment({
      totalAmount: 50000,
      paymentStatus: 'paid',
      partialAmount: '',
      payAboveRoomTotal: false,
      pendingHold: false,
    }),
    {
      depositAmount: 50000,
      balanceAmount: 0,
      bookingPaymentStatus: 'paid',
      folioChargePaymentStatus: 'paid',
      transactionStatus: 'paid',
      prepayExcess: 0,
    },
  )
})

test('partial bulk payments preserve deposit and remaining balance', () => {
  assert.deepEqual(
    resolveBulkBookingPayment({
      totalAmount: 50000,
      paymentStatus: 'partial',
      partialAmount: 15000,
      payAboveRoomTotal: false,
      pendingHold: false,
    }),
    {
      depositAmount: 15000,
      balanceAmount: 35000,
      bookingPaymentStatus: 'partial',
      folioChargePaymentStatus: 'unpaid',
      transactionStatus: 'partial',
      prepayExcess: 0,
    },
  )
})

test('paid-above-total bulk bookings expose excess as ledger credit', () => {
  assert.deepEqual(
    resolveBulkBookingPayment({
      totalAmount: 50000,
      paymentStatus: 'paid',
      partialAmount: 65000,
      payAboveRoomTotal: true,
      pendingHold: false,
    }),
    {
      depositAmount: 65000,
      balanceAmount: 0,
      bookingPaymentStatus: 'paid',
      folioChargePaymentStatus: 'paid',
      transactionStatus: 'paid',
      prepayExcess: 15000,
    },
  )
})

test('pending holds stay unpaid even if stale payment state says paid', () => {
  assert.deepEqual(
    resolveBulkBookingPayment({
      totalAmount: 50000,
      paymentStatus: 'paid',
      partialAmount: 65000,
      payAboveRoomTotal: true,
      pendingHold: true,
    }),
    {
      depositAmount: 0,
      balanceAmount: 50000,
      bookingPaymentStatus: 'pending',
      folioChargePaymentStatus: 'unpaid',
      transactionStatus: 'pending',
      prepayExcess: 0,
    },
  )
})
