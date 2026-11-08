import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  bookingCollectionFromFolio,
  planStayFolioAfterTotalEdit,
} from '../lib/booking/edit-stay-folio'
import { bookingDisplayBillBalance } from '../lib/utils/booking-bill-balance'

describe('planStayFolioAfterTotalEdit', () => {
  it('lowers the room charge and keeps an unpaid extra on the bill', () => {
    const plan = planStayFolioAfterTotalEdit({
      nextTotal: 30_000,
      charges: [
        {
          id: 'room',
          amount: 40_000,
          charge_type: 'room_charge',
          payment_status: 'unpaid',
        },
        {
          id: 'bar',
          amount: 8_000,
          charge_type: 'minibar',
          payment_status: 'pending',
        },
      ],
    })
    assert.ok(plan)
    assert.deepEqual(plan.updates, [{ id: 'room', amount: 30_000 }])
    assert.equal(plan.insert, null)

    const money = bookingCollectionFromFolio(plan.projected)
    assert.equal(money.balance, 38_000)
    assert.equal(money.payment_status, 'pending')
    assert.equal(
      bookingDisplayBillBalance(
        { total_amount: 30_000, balance: 30_000, deposit: 0 },
        plan.projected,
      ),
      38_000,
    )
  })

  it('does not rebill a paid room when the stay total increases', () => {
    const plan = planStayFolioAfterTotalEdit({
      nextTotal: 60_000,
      charges: [
        {
          id: 'room',
          amount: 40_000,
          charge_type: 'room_charge',
          payment_status: 'paid',
        },
        {
          id: 'bar',
          amount: 8_000,
          charge_type: 'restaurant',
          payment_status: 'pending',
        },
      ],
    })
    assert.ok(plan)
    assert.deepEqual(plan.updates, [])
    assert.equal(plan.insert?.amount, 20_000)
    assert.equal(plan.insert?.payment_status, 'pending')

    const money = bookingCollectionFromFolio(plan.projected)
    assert.equal(money.balance, 28_000)
    assert.equal(
      bookingDisplayBillBalance(
        { total_amount: 60_000, balance: 0, deposit: 40_000 },
        plan.projected,
      ),
      28_000,
    )
  })

  it('reduces an unpaid room charge before an extension', () => {
    const plan = planStayFolioAfterTotalEdit({
      nextTotal: 50_000,
      charges: [
        {
          id: 'room',
          amount: 40_000,
          charge_type: 'room_charge',
          payment_status: 'pending',
        },
        {
          id: 'ext',
          amount: 20_000,
          charge_type: 'extended_stay',
          payment_status: 'pending',
        },
      ],
    })
    assert.ok(plan)
    assert.deepEqual(plan.updates, [{ id: 'room', amount: 30_000 }])
    assert.equal(bookingCollectionFromFolio(plan.projected).balance, 50_000)
  })

  it('moves a city-ledger stay total onto the company account by the difference', () => {
    const plan = planStayFolioAfterTotalEdit({
      nextTotal: 25_000,
      charges: [
        {
          id: 'room',
          amount: 40_000,
          charge_type: 'room_charge',
          payment_status: 'city_ledger',
          payment_method: 'city_ledger',
          ledger_account_id: 'acct-1',
          ledger_account_type: 'organization',
        },
      ],
    })
    assert.ok(plan)
    assert.deepEqual(plan.updates, [{ id: 'room', amount: 25_000 }])
    assert.deepEqual(plan.ledgerDeltas, [
      { ledgerAccountId: 'acct-1', accountType: 'organization', delta: -15_000 },
    ])
    const money = bookingCollectionFromFolio(plan.projected)
    assert.equal(money.balance, 25_000)
    assert.equal(money.payment_status, 'city_ledger')
  })

  it('adds an increase on a posted company stay as company debt, not a second guest bill', () => {
    const plan = planStayFolioAfterTotalEdit({
      nextTotal: 50_000,
      charges: [
        {
          id: 'room',
          amount: 40_000,
          charge_type: 'room_charge',
          payment_status: 'posted_to_ledger',
          payment_method: 'city_ledger',
          ledger_account_id: 'acct-1',
          ledger_account_type: 'organization',
        },
      ],
    })
    assert.ok(plan)
    assert.equal(plan.insert?.payment_status, 'city_ledger')
    assert.equal(plan.insert?.amount, 10_000)
    assert.equal(plan.ledgerDeltas[0]?.delta, 10_000)
    assert.equal(bookingCollectionFromFolio(plan.projected).balance, 10_000)
  })

  it('keeps a recorded payment when the room total drops', () => {
    const plan = planStayFolioAfterTotalEdit({
      nextTotal: 30_000,
      charges: [
        {
          id: 'room',
          amount: 40_000,
          charge_type: 'room_charge',
          payment_status: 'pending',
        },
        {
          id: 'pay',
          amount: -10_000,
          charge_type: 'payment',
          payment_status: 'paid',
          payment_method: 'cash',
        },
      ],
    })
    assert.ok(plan)
    assert.deepEqual(plan.updates, [{ id: 'room', amount: 30_000 }])
    const money = bookingCollectionFromFolio(plan.projected)
    assert.equal(money.balance, 20_000)
    assert.equal(money.payment_status, 'partial')
  })

  it('leaves the folio alone when there is no folio yet or the stay lines already match', () => {
    assert.equal(
      planStayFolioAfterTotalEdit({ nextTotal: 30_000, charges: [] }),
      null,
    )
    assert.equal(
      planStayFolioAfterTotalEdit({
        nextTotal: 40_000,
        charges: [
          {
            id: 'room',
            amount: 40_000,
            charge_type: 'room_charge',
            payment_status: 'unpaid',
          },
        ],
      }),
      null,
    )
  })
})
