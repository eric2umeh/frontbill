import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { callerMatchesSession } from '../lib/api/caller-session-match.ts'
import { bulkRoomUsesStep1Cashback } from '../lib/cashback/bulk-cashback-guest.ts'

describe('callerMatchesSession', () => {
  it('rejects missing session or caller', () => {
    assert.equal(callerMatchesSession('admin-1', null), false)
    assert.equal(callerMatchesSession(null, 'admin-1'), false)
    assert.equal(callerMatchesSession('', 'admin-1'), false)
  })

  it('rejects spoofed caller_id that does not match the session', () => {
    assert.equal(callerMatchesSession('manager-uuid', 'receptionist-uuid'), false)
  })

  it('allows when session user equals caller_id', () => {
    assert.equal(callerMatchesSession('manager-uuid', 'manager-uuid'), true)
  })
})

describe('bulkRoomUsesStep1Cashback', () => {
  it('allows cashback only when room guest is the Step-1 cashback guest', () => {
    assert.equal(
      bulkRoomUsesStep1Cashback({
        cashbackEligible: true,
        step1GuestId: 'guest-a',
        roomGuestId: 'guest-a',
      }),
      true,
    )
  })

  it('blocks cashback when detailed room guest differs from Step-1 contact', () => {
    assert.equal(
      bulkRoomUsesStep1Cashback({
        cashbackEligible: true,
        step1GuestId: 'guest-a',
        roomGuestId: 'guest-b',
      }),
      false,
    )
  })

  it('blocks when ineligible or missing ids', () => {
    assert.equal(
      bulkRoomUsesStep1Cashback({
        cashbackEligible: false,
        step1GuestId: 'guest-a',
        roomGuestId: 'guest-a',
      }),
      false,
    )
    assert.equal(
      bulkRoomUsesStep1Cashback({
        cashbackEligible: true,
        step1GuestId: 'guest-a',
        roomGuestId: null,
      }),
      false,
    )
  })
})

/**
 * Models the optimistic-lock filter used by recordCashbackRedeem:
 * update succeeds only when stored balance still equals the value read.
 */
function simulateOptimisticRedeem(
  store: { balance: number; redeemed: number },
  readBalance: number,
  amount: number,
): boolean {
  if (store.balance !== readBalance) return false
  if (amount > store.balance) return false
  store.balance = Math.max(0, store.balance - amount)
  store.redeemed += amount
  return true
}

describe('cashback redeem optimistic lock', () => {
  it('prevents concurrent double-redeem of the same balance', () => {
    const store = { balance: 1000, redeemed: 0 }
    const readA = store.balance
    const readB = store.balance

    assert.equal(simulateOptimisticRedeem(store, readA, 1000), true)
    assert.equal(simulateOptimisticRedeem(store, readB, 1000), false)
    assert.equal(store.balance, 0)
    assert.equal(store.redeemed, 1000)
  })

  it('allows sequential redeems that fit the remaining balance', () => {
    const store = { balance: 1000, redeemed: 0 }
    assert.equal(simulateOptimisticRedeem(store, store.balance, 400), true)
    assert.equal(simulateOptimisticRedeem(store, store.balance, 400), true)
    assert.equal(store.balance, 200)
    assert.equal(store.redeemed, 800)
  })
})
