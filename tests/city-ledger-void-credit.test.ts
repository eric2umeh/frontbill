import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { cityLedgerBalanceAfterChargeReversal } from '../lib/outlets/city-ledger-reversal.ts'

describe('cityLedgerBalanceAfterChargeReversal', () => {
  it('restores prepaid credit when a charge on a credit balance is voided', () => {
    // ₦10,000 prepaid, ₦2,000 bar charge posted → balance -8,000. Void must return -10,000.
    assert.equal(cityLedgerBalanceAfterChargeReversal(-8000, 2000), -10000)
  })

  it('turns a paid-off city-ledger charge into credit instead of zero', () => {
    // Charge ₦8,000 then the company pays it (balance 0). Void must leave ₦8,000 credit.
    assert.equal(cityLedgerBalanceAfterChargeReversal(0, 8000), -8000)
  })

  it('clears an unpaid charge that is still the whole balance', () => {
    assert.equal(cityLedgerBalanceAfterChargeReversal(8000, 8000), 0)
  })

  it('leaves other debt in place', () => {
    assert.equal(cityLedgerBalanceAfterChargeReversal(13000, 8000), 5000)
  })

  it('keeps credit that was already larger than the voided charge', () => {
    assert.equal(cityLedgerBalanceAfterChargeReversal(-2000, 4500), -6500)
  })

  it('rounds to kobo', () => {
    assert.equal(cityLedgerBalanceAfterChargeReversal(10.1, 0.2), 9.9)
  })

  it('ignores non-finite inputs instead of writing NaN', () => {
    assert.equal(cityLedgerBalanceAfterChargeReversal(Number.NaN, 500), -500)
    assert.equal(cityLedgerBalanceAfterChargeReversal(1500, Number.NaN), 1500)
  })
})
