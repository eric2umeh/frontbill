import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  eventPaymentCollectedDelta,
  parseEventPaymentFromBody,
} from '@/lib/events/record-event-payment'

describe('eventPaymentCollectedDelta', () => {
  it('posts the full collection when an unpaid hold is marked paid', () => {
    assert.equal(eventPaymentCollectedDelta(0, 150_000), 150_000)
    assert.equal(eventPaymentCollectedDelta(null, 150_000), 150_000)
  })

  it('does not re-post when an already-paid event is saved again', () => {
    assert.equal(eventPaymentCollectedDelta(150_000, 150_000), 0)
  })

  it('posts only the newly collected amount on a partial-to-paid edit', () => {
    assert.equal(eventPaymentCollectedDelta(40_000, 100_000), 60_000)
  })

  it('posts the overpay increment without reversing a decrease', () => {
    assert.equal(eventPaymentCollectedDelta(100_000, 150_000), 50_000)
    assert.equal(eventPaymentCollectedDelta(100_000, 80_000), 0)
  })
})

describe('event edit payment parse + ledger delta', () => {
  it('create-as-pending then edit-to-paid collects the event total', () => {
    const payment = parseEventPaymentFromBody(
      { payment_method: 'cash', payment_status: 'paid' },
      250_000,
    )
    assert.equal(payment.amount_paid, 250_000)
    assert.equal(payment.payment_status, 'paid')
    assert.equal(eventPaymentCollectedDelta(0, payment.amount_paid), 250_000)
  })

  it('saving a paid event with unchanged totals does not collect again', () => {
    const payment = parseEventPaymentFromBody(
      {
        payment_method: 'pos',
        payment_status: 'paid',
        partial_amount: 250_000,
      },
      250_000,
    )
    assert.equal(payment.amount_paid, 250_000)
    assert.equal(eventPaymentCollectedDelta(250_000, payment.amount_paid), 0)
  })

  it('pending hold parse stays at zero so a title-only save does not mint cash', () => {
    const payment = parseEventPaymentFromBody(
      { payment_method: 'pending', payment_status: 'unpaid' },
      250_000,
    )
    assert.equal(payment.amount_paid, 0)
    assert.equal(payment.payment_status, 'pending')
    assert.equal(eventPaymentCollectedDelta(0, payment.amount_paid), 0)
  })

  it('partial then remainder paid posts only the remainder', () => {
    const payment = parseEventPaymentFromBody(
      { payment_method: 'transfer', payment_status: 'paid' },
      100_000,
    )
    assert.equal(eventPaymentCollectedDelta(40_000, payment.amount_paid), 60_000)
  })

  it('pay-above-total on first collection includes the excess in the delta', () => {
    const payment = parseEventPaymentFromBody(
      {
        payment_method: 'cash',
        payment_status: 'paid',
        partial_amount: 180_000,
        pay_above_total: true,
      },
      100_000,
    )
    assert.equal(payment.amount_paid, 180_000)
    assert.equal(eventPaymentCollectedDelta(0, payment.amount_paid), 180_000)
  })
})
