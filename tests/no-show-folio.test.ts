import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  expectedNoShowOutstanding,
  isNoShowSupersededStayCharge,
  stayChargeIdsToSupersedeOnNoShow,
} from '../lib/reservations/no-show-folio.ts'
import {
  folioPositiveOutstandingSum,
  isFolioChargeInactive,
} from '../lib/utils/booking-bill-balance.ts'

test('identifies reservation and room_charge stay lines for supersede', () => {
  assert.equal(
    isNoShowSupersededStayCharge({
      id: 'a',
      charge_type: 'reservation',
      amount: 50000,
      payment_status: 'unpaid',
    }),
    true,
  )
  assert.equal(
    isNoShowSupersededStayCharge({
      id: 'b',
      charge_type: 'room_charge',
      amount: 50000,
      payment_status: 'paid',
    }),
    true,
  )
  assert.equal(
    isNoShowSupersededStayCharge({
      id: 'c',
      charge_type: 'payment',
      amount: -20000,
      payment_status: 'paid',
    }),
    false,
  )
  assert.equal(
    isNoShowSupersededStayCharge({
      id: 'd',
      charge_type: 'reservation',
      amount: 50000,
      payment_status: 'voided',
    }),
    false,
  )
})

test('collects only supersede-eligible stay charge ids', () => {
  const ids = stayChargeIdsToSupersedeOnNoShow([
    { id: 'stay', charge_type: 'reservation', amount: 50000, payment_status: 'unpaid' },
    { id: 'pay', charge_type: 'payment', amount: -10000, payment_status: 'paid' },
    { id: 'fee', charge_type: 'no_show_fee', amount: 50000, payment_status: 'pending' },
    { id: null, charge_type: 'room_charge', amount: 1000, payment_status: 'unpaid' },
  ])
  assert.deepEqual(ids, ['stay'])
})

test('100% no-show fee does not stack on top of unpaid reservation charge', () => {
  const charges = [
    {
      charge_type: 'reservation',
      amount: 50000,
      payment_status: 'unpaid',
    },
  ]
  // Pre-fix (stacked): unpaid reservation + fee ≈ 100000
  assert.equal(
    folioPositiveOutstandingSum([
      ...charges,
      { charge_type: 'no_show_fee', amount: 50000, payment_status: 'pending' },
    ]),
    100000,
  )
  // Post-fix: supersede stay, keep only fee
  assert.equal(expectedNoShowOutstanding({ charges, feeAmount: 50000 }), 50000)
})

test('prepaid reservation applies payments against the no-show fee', () => {
  const charges = [
    {
      charge_type: 'reservation',
      amount: 50000,
      payment_status: 'paid',
    },
    {
      charge_type: 'payment',
      amount: -50000,
      payment_status: 'paid',
    },
  ]
  assert.equal(expectedNoShowOutstanding({ charges, feeAmount: 50000 }), 0)
  assert.equal(expectedNoShowOutstanding({ charges, feeAmount: 25000 }), 0)
})

test('partial policy fee replaces full stay outstanding', () => {
  const charges = [
    {
      charge_type: 'reservation',
      amount: 80000,
      payment_status: 'unpaid',
    },
  ]
  assert.equal(expectedNoShowOutstanding({ charges, feeAmount: 40000 }), 40000)
})

test('voided folio lines are inactive for bill balance', () => {
  assert.equal(isFolioChargeInactive('voided'), true)
  assert.equal(
    folioPositiveOutstandingSum([
      {
        charge_type: 'reservation',
        amount: 50000,
        payment_status: 'voided',
      },
      {
        charge_type: 'no_show_fee',
        amount: 50000,
        payment_status: 'pending',
      },
    ]),
    50000,
  )
})
