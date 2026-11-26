import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { extendChargeFromFreshBooking } from '../lib/booking/extend-charge-from-fresh.ts'

const ORIGINAL = {
  fallbackCheckIn: '2026-11-26',
  fallbackCheckOut: '2026-11-28',
  fallbackRate: 20000,
  newCheckOutYmd: '2026-11-30',
}

describe('extendChargeFromFreshBooking', () => {
  it('charges the extra nights when the stored checkout is still the original date', () => {
    const charge = extendChargeFromFreshBooking({
      ...ORIGINAL,
      freshCheckIn: '2026-11-26',
      freshCheckOut: '2026-11-28',
      freshRate: 20000,
    })
    assert.equal(charge.alreadyExtended, false)
    assert.equal(charge.nights, 2)
    assert.equal(charge.amount, 40000)
  })

  it('does not charge a room whose checkout was already moved to the requested date', () => {
    // Room A saved, room B failed, staff clicked Confirm again.
    // The dialog still shows 28 Nov, but the row is already 30 Nov.
    const charge = extendChargeFromFreshBooking({
      ...ORIGINAL,
      freshCheckIn: '2026-11-26',
      freshCheckOut: '2026-11-30',
      freshRate: 20000,
    })
    assert.equal(charge.alreadyExtended, true)
    assert.equal(charge.nights, 0)
    assert.equal(charge.amount, 0)
  })

  it('does not charge when the stored checkout is already past the requested date', () => {
    const charge = extendChargeFromFreshBooking({
      ...ORIGINAL,
      freshCheckIn: '2026-11-26',
      freshCheckOut: '2026-12-02',
      freshRate: 20000,
    })
    assert.equal(charge.alreadyExtended, true)
    assert.equal(charge.amount, 0)
  })

  it('charges only the remaining nights when checkout moved partway', () => {
    const charge = extendChargeFromFreshBooking({
      ...ORIGINAL,
      freshCheckIn: '2026-11-26',
      freshCheckOut: '2026-11-29',
      freshRate: 20000,
    })
    assert.equal(charge.alreadyExtended, false)
    assert.equal(charge.nights, 1)
    assert.equal(charge.amount, 20000)
  })

  it('treats an ISO checkout timestamp on the target day as already extended', () => {
    const charge = extendChargeFromFreshBooking({
      ...ORIGINAL,
      freshCheckIn: '2026-11-26T14:00:00.000Z',
      freshCheckOut: '2026-11-30T00:00:00+01:00',
      freshRate: '20000',
    })
    assert.equal(charge.alreadyExtended, true)
    assert.equal(charge.amount, 0)
  })

  it('uses the dialog checkout when the fresh read has no date', () => {
    const charge = extendChargeFromFreshBooking({
      ...ORIGINAL,
      freshCheckIn: null,
      freshCheckOut: null,
      freshRate: null,
    })
    assert.equal(charge.alreadyExtended, false)
    assert.equal(charge.nights, 2)
    assert.equal(charge.amount, 40000)
  })

  it('keeps an explicit zero rate instead of falling back to the dialog rate', () => {
    const charge = extendChargeFromFreshBooking({
      ...ORIGINAL,
      freshCheckIn: '2026-11-26',
      freshCheckOut: '2026-11-28',
      freshRate: 0,
    })
    assert.equal(charge.alreadyExtended, false)
    assert.equal(charge.nights, 2)
    assert.equal(charge.rate, 0)
    assert.equal(charge.amount, 0)
  })
})
