import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  bookingBalanceAfterReversingPendingOutletCharge,
  outletSettlementReversesBookingBalance,
} from '../lib/outlets/booking-folio'

/**
 * Settle-now cash/POS linked to a room inserts a paid folio line.
 * That line was never added to booking.balance — subtracting it undercharges
 * the stay. Only pending/unpaid open-bill lines (already in the balance)
 * should be reversed when they are paid or complimentary.
 */
describe('outlet settlement booking balance', () => {
  it('does not reverse a paid-on-spot folio insert', () => {
    assert.equal(outletSettlementReversesBookingBalance('paid'), false)
    assert.equal(outletSettlementReversesBookingBalance(null), false)
    assert.equal(outletSettlementReversesBookingBalance(undefined), false)
    assert.equal(outletSettlementReversesBookingBalance('city_ledger'), false)
  })

  it('reverses a pending open-bill folio line', () => {
    assert.equal(outletSettlementReversesBookingBalance('pending'), true)
    assert.equal(outletSettlementReversesBookingBalance('unpaid'), true)
    assert.equal(outletSettlementReversesBookingBalance('Pending'), true)
  })

  it('leaves room balance unchanged after a settle-now restaurant sale', () => {
    const roomBalance = 40_000
    const sale = 3_500
    // paid-on-spot: do not subtract
    assert.equal(outletSettlementReversesBookingBalance('paid'), false)
    assert.equal(roomBalance, 40_000)
    assert.notEqual(
      bookingBalanceAfterReversingPendingOutletCharge(roomBalance, sale),
      roomBalance,
    )
  })

  it('restores room balance when a pending open bill is paid or comped', () => {
    assert.equal(
      bookingBalanceAfterReversingPendingOutletCharge(43_500, 3_500),
      40_000,
    )
  })

  it('does not take room balance below zero', () => {
    assert.equal(bookingBalanceAfterReversingPendingOutletCharge(1_000, 3_500), 0)
  })
})
