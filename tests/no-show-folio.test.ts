import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  folioLinesAfterNoShowFee,
  noShowBookingTotals,
  stayChargesReplacedByNoShow,
  voidedNoShowStayDescription,
} from '@/lib/reservations/no-show-folio'

describe('no-show folio replacement', () => {
  it('charges an unpaid reservation the fee only, not the stay plus the fee', () => {
    const lines = [
      {
        id: 'stay',
        description: 'Reservation charge - 2 nights',
        amount: 40000,
        charge_type: 'reservation',
        payment_status: 'unpaid',
      },
    ]
    const projected = folioLinesAfterNoShowFee(lines, 40000)
    const totals = noShowBookingTotals(projected)
    assert.equal(totals.total_amount, 40000)
    assert.equal(totals.balance, 40000)
    assert.equal(totals.payment_status, 'pending')
    assert.deepEqual(stayChargesReplacedByNoShow(lines).map((l) => l.id), ['stay'])
  })

  it('drops the unused stay when the policy fee is half the room', () => {
    const lines = [
      {
        id: 'stay',
        amount: 40000,
        charge_type: 'room_charge',
        payment_status: 'unpaid',
      },
    ]
    const totals = noShowBookingTotals(folioLinesAfterNoShowFee(lines, 20000))
    assert.equal(totals.total_amount, 20000)
    assert.equal(totals.balance, 20000)
    assert.equal(totals.payment_status, 'pending')
  })

  it('keeps a deposit already taken and bills only the remainder of the fee', () => {
    const lines = [
      {
        id: 'stay',
        amount: 40000,
        charge_type: 'reservation',
        payment_status: 'unpaid',
      },
      {
        id: 'pay',
        amount: -10000,
        charge_type: 'payment',
        payment_status: 'paid',
      },
    ]
    const totals = noShowBookingTotals(folioLinesAfterNoShowFee(lines, 40000))
    assert.equal(totals.total_amount, 40000)
    assert.equal(totals.balance, 30000)
    assert.equal(totals.payment_status, 'partial')
  })

  it('turns cash above the fee into guest credit', () => {
    const lines = [
      {
        id: 'stay',
        amount: 40000,
        charge_type: 'room_charge',
        payment_status: 'paid',
      },
      {
        id: 'pay',
        amount: -40000,
        charge_type: 'payment',
        payment_status: 'paid',
      },
    ]
    const totals = noShowBookingTotals(folioLinesAfterNoShowFee(lines, 20000))
    assert.equal(totals.total_amount, 20000)
    assert.equal(totals.balance, -20000)
    assert.equal(totals.payment_status, 'paid')
  })

  it('waives the stay when the fee is zero', () => {
    const unpaid = noShowBookingTotals(
      folioLinesAfterNoShowFee(
        [
          {
            id: 'stay',
            amount: 40000,
            charge_type: 'reservation',
            payment_status: 'unpaid',
          },
        ],
        0,
      ),
    )
    assert.equal(unpaid.total_amount, 0)
    assert.equal(unpaid.balance, 0)
    assert.equal(unpaid.payment_status, 'paid')

    const prepaid = noShowBookingTotals(
      folioLinesAfterNoShowFee(
        [
          {
            id: 'stay',
            amount: 40000,
            charge_type: 'reservation',
            payment_status: 'paid',
          },
          {
            id: 'pay',
            amount: -40000,
            charge_type: 'payment',
            payment_status: 'paid',
          },
        ],
        0,
      ),
    )
    assert.equal(prepaid.total_amount, 0)
    assert.equal(prepaid.balance, -40000)
    assert.equal(prepaid.payment_status, 'paid')
  })

  it('keeps outlet extras and clears an extended stay line', () => {
    const lines = [
      {
        id: 'stay',
        amount: 40000,
        charge_type: 'reservation',
        payment_status: 'unpaid',
      },
      {
        id: 'ext',
        amount: 20000,
        charge_type: 'extended_stay',
        payment_status: 'pending',
      },
      {
        id: 'food',
        amount: 5000,
        charge_type: 'additional_charge',
        payment_status: 'pending',
      },
    ]
    const totals = noShowBookingTotals(folioLinesAfterNoShowFee(lines, 20000))
    assert.equal(totals.total_amount, 25000)
    assert.equal(totals.balance, 25000)
    assert.deepEqual(
      stayChargesReplacedByNoShow(lines).map((l) => l.id),
      ['stay', 'ext'],
    )
  })

  it('preserves the old stay amount in the voided line description', () => {
    assert.equal(
      voidedNoShowStayDescription({
        description: 'Reservation charge - 2 nights',
        amount: 40000,
      }),
      'Voided on no-show (was 40000.00) — Reservation charge - 2 nights',
    )
  })

  it('keeps a company-account bill on city ledger when the fee is still owed', () => {
    const totals = noShowBookingTotals(
      folioLinesAfterNoShowFee(
        [
          {
            id: 'stay',
            amount: 40000,
            charge_type: 'room_charge',
            payment_status: 'unpaid',
            payment_method: 'city_ledger',
          },
        ],
        40000,
      ),
      'city_ledger',
    )
    assert.equal(totals.balance, 40000)
    assert.equal(totals.payment_status, 'city_ledger')
  })
})