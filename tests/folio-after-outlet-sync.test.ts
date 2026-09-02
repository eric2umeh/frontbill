import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  folioChargesForPaidHeal,
  shouldReconcileBookingPaymentPaid,
  folioPositiveOutstandingSum,
} from '../lib/utils/booking-bill-balance'

const settledRoom = [
  { amount: 40_000, charge_type: 'room_charge', payment_status: 'paid', payment_method: 'cash' },
]

const unpaidOutlet = {
  amount: 15_000,
  charge_type: 'additional_charge',
  payment_status: 'pending',
  payment_method: 'city_ledger',
}

describe('folioChargesForPaidHeal', () => {
  it('uses the first-paint list when outlet sync did not run', () => {
    const result = folioChargesForPaidHeal(settledRoom, null, false)
    assert.equal(result.allowPaidHeal, true)
    assert.equal(result.charges, settledRoom)
  })

  it('blocks paid-status heal when sync ran but charge reload failed', () => {
    const result = folioChargesForPaidHeal(settledRoom, null, true)
    assert.equal(result.allowPaidHeal, false)
    assert.equal(folioPositiveOutstandingSum(result.charges), 0)
    assert.equal(
      result.allowPaidHeal &&
        shouldReconcileBookingPaymentPaid({ payment_status: 'pending' }, result.charges),
      false,
    )
  })

  it('does not mark paid after backfill adds an unpaid restaurant line', () => {
    const refreshed = [...settledRoom, unpaidOutlet]
    const result = folioChargesForPaidHeal(settledRoom, refreshed, true)
    assert.equal(result.allowPaidHeal, true)
    assert.equal(folioPositiveOutstandingSum(result.charges), 15_000)
    assert.equal(
      shouldReconcileBookingPaymentPaid({ payment_status: 'pending' }, result.charges),
      false,
    )
  })

  it('still heals paid when post-sync folio is fully settled', () => {
    const result = folioChargesForPaidHeal(settledRoom, settledRoom, true)
    assert.equal(result.allowPaidHeal, true)
    assert.equal(
      shouldReconcileBookingPaymentPaid({ payment_status: 'pending' }, result.charges),
      true,
    )
  })
})
