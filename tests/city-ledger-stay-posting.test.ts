import assert from 'node:assert/strict'
import test from 'node:test'
import { cityLedgerStayPosting } from '../lib/booking/city-ledger-stay-posting'
import { bookingDisplayBillBalance } from '../lib/utils/booking-bill-balance'

test('city ledger stay is not collectible on the guest folio', () => {
  const post = cityLedgerStayPosting(40000)
  assert.equal(post.balance, 0)
  assert.equal(post.deposit, 0)
  assert.equal(post.ledgerAmount, 40000)
  assert.equal(post.recordPaymentRow, false)
  assert.equal(post.folioPaymentStatus, 'posted_to_ledger')

  const bill = bookingDisplayBillBalance(
    {
      total_amount: 40000,
      deposit: post.deposit,
      balance: post.balance,
      payment_status: post.paymentStatus,
    },
    [
      {
        amount: 40000,
        charge_type: 'room_charge',
        payment_status: post.folioPaymentStatus,
        payment_method: 'city_ledger',
      },
    ],
  )
  assert.equal(bill, 0)
})

test('an unpaid city-ledger folio line still counts as guest debt', () => {
  const bill = bookingDisplayBillBalance(
    { total_amount: 40000, deposit: 0, balance: 40000, payment_status: 'pending' },
    [
      {
        amount: 40000,
        charge_type: 'room_charge',
        payment_status: 'unpaid',
        payment_method: 'city_ledger',
      },
    ],
  )
  assert.equal(bill, 40000)
})

test('city ledger posting ignores a negative room total', () => {
  assert.equal(cityLedgerStayPosting(-5).ledgerAmount, 0)
})
