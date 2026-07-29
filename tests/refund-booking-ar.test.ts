import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, it } from 'node:test'
import { bookingDisplayBillBalance } from '../lib/utils/booking-bill-balance.ts'

describe('refund booking AR invariant', () => {
  it('cutting deposit on a settled folio invents false outstanding', () => {
    const settledFolio = [
      { amount: 100_000, charge_type: 'room_charge', payment_status: 'paid' },
      {
        amount: -100_000,
        charge_type: 'payment',
        payment_status: 'paid',
        payment_method: 'pos',
      },
    ]
    const before = { total_amount: 100_000, deposit: 100_000, balance: 0 }
    assert.equal(bookingDisplayBillBalance(before, settledFolio), 0)

    // Former refunds POST behavior: reduce deposit by refund amount.
    const afterBuggyDepositCut = {
      total_amount: 100_000,
      deposit: 80_000,
      balance: 0,
    }
    assert.equal(
      bookingDisplayBillBalance(afterBuggyDepositCut, settledFolio),
      20_000,
    )
  })

  it('refunds route must not rewrite bookings.deposit or balance', () => {
    const src = readFileSync(
      join(process.cwd(), 'app/api/refunds/route.ts'),
      'utf8',
    )
    assert.equal(/deposit:\s*depNext/.test(src), false)
    assert.equal(/balance:\s*balNext/.test(src), false)
    assert.equal(
      src.includes('Do not mutate bookings.deposit / bookings.balance'),
      true,
    )
  })
})
