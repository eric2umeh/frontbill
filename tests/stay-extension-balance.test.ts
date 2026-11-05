import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  balanceAfterStayExtension,
  outstandingBeforeStayExtension,
} from '../lib/booking/stay-extension-balance.ts'

describe('balanceAfterStayExtension', () => {
  it('keeps a minibar charge when a fully paid room is extended with cash', () => {
    // Room ₦40,000 paid (balance was 0), then a ₦8,000 deferred charge.
    // One extra night at ₦10,000 collected now must not zero the minibar.
    const next = balanceAfterStayExtension({
      previousBalance: 8000,
      addedToTotal: 10000,
      addedToDeposit: 10000,
    })
    assert.equal(next, 8000)
  })

  it('keeps unpaid room nights plus an outlet charge on a cash extension', () => {
    // total 40,000, deposit 20,000, outlet 8,000 → balance 28,000.
    const next = balanceAfterStayExtension({
      previousBalance: 28000,
      addedToTotal: 10000,
      addedToDeposit: 10000,
    })
    assert.equal(next, 28000)
  })

  it('leaves a room-only balance unchanged when the extension is paid in full', () => {
    const next = balanceAfterStayExtension({
      previousBalance: 40000,
      addedToTotal: 10000,
      addedToDeposit: 10000,
    })
    assert.equal(next, 40000)
  })

  it('adds a city-ledger extension on top of existing outstanding', () => {
    const next = balanceAfterStayExtension({
      previousBalance: 8000,
      addedToTotal: 10000,
      addedToDeposit: 0,
    })
    assert.equal(next, 18000)
  })

  it('does not invent room debt when the stored balance is already clear', () => {
    const next = balanceAfterStayExtension({
      previousBalance: 0,
      addedToTotal: 10000,
      addedToDeposit: 10000,
    })
    assert.equal(next, 0)
  })

  it('preserves a credit balance across a paid extension', () => {
    const next = balanceAfterStayExtension({
      previousBalance: -2000,
      addedToTotal: 10000,
      addedToDeposit: 10000,
    })
    assert.equal(next, -2000)
  })
})

describe('outstandingBeforeStayExtension', () => {
  it('uses a stored balance, including zero and credit', () => {
    assert.equal(outstandingBeforeStayExtension(8000, 40000, 40000), 8000)
    assert.equal(outstandingBeforeStayExtension(0, 40000, 0), 0)
    assert.equal(outstandingBeforeStayExtension(-1500, 40000, 40000), -1500)
  })

  it('falls back to room total minus deposit when balance was never stored', () => {
    assert.equal(outstandingBeforeStayExtension(null, 40000, 15000), 25000)
    assert.equal(outstandingBeforeStayExtension(undefined, 10000, 40000), 0)
  })
})
