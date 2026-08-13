import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  addCalendarDaysYmd,
  extendDiscountStayConflict,
  extensionAdditionalNights,
} from '../lib/booking/edit-booking-patch.ts'
import { usableCityLedgerAccountId } from '../lib/utils/guest-city-ledger.ts'

describe('addCalendarDaysYmd', () => {
  it('subtracts nights to recover the checkout the discount request was based on', () => {
    assert.equal(addCalendarDaysYmd('2026-08-18', -3), '2026-08-15')
  })

  it('crosses month boundaries', () => {
    assert.equal(addCalendarDaysYmd('2026-09-01', -1), '2026-08-31')
  })
})

describe('extendDiscountStayConflict', () => {
  it('allows approval when checkout is still the request base date', () => {
    assert.equal(
      extendDiscountStayConflict({
        currentCheckOutYmd: '2026-08-15',
        requestedNewCheckOutYmd: '2026-08-18',
        additionalNights: 3,
      }),
      null,
    )
  })

  it('rejects when a standard extend already moved checkout to the requested date', () => {
    const msg = extendDiscountStayConflict({
      currentCheckOutYmd: '2026-08-18',
      requestedNewCheckOutYmd: '2026-08-18',
      additionalNights: 3,
    })
    assert.ok(msg)
    assert.match(String(msg), /Stay dates changed/)
  })

  it('rejects when checkout was extended further than the request (would roll dates backward)', () => {
    const msg = extendDiscountStayConflict({
      currentCheckOutYmd: '2026-08-20',
      requestedNewCheckOutYmd: '2026-08-18',
      additionalNights: 3,
    })
    assert.ok(msg)
    assert.match(String(msg), /Stay dates changed/)
  })

  it('rejects a partial overlap (one extra night already posted)', () => {
    const msg = extendDiscountStayConflict({
      currentCheckOutYmd: '2026-08-16',
      requestedNewCheckOutYmd: '2026-08-18',
      additionalNights: 3,
    })
    assert.ok(msg)
  })

  it('accepts ISO timestamps by using the calendar YMD prefix', () => {
    assert.equal(
      extendDiscountStayConflict({
        currentCheckOutYmd: '2026-08-15T00:00:00.000Z',
        requestedNewCheckOutYmd: '2026-08-18T23:00:00.000Z',
        additionalNights: 3,
      }),
      null,
    )
  })
})

describe('extensionAdditionalNights', () => {
  it('charges only the extra nights, not the whole stay', () => {
    assert.equal(
      extensionAdditionalNights({
        checkInYmd: '2026-08-10',
        currentCheckOutYmd: '2026-08-15',
        newCheckOutYmd: '2026-08-18',
      }),
      3,
    )
  })
})

describe('usableCityLedgerAccountId', () => {
  const guestId = '11111111-1111-1111-1111-111111111111'
  const ledgerId = '22222222-2222-2222-2222-222222222222'

  it('drops the auto-selected guest UUID so it is not used as a ledger row id', () => {
    assert.equal(usableCityLedgerAccountId(guestId, guestId), null)
  })

  it('keeps a real city_ledger_accounts id', () => {
    assert.equal(usableCityLedgerAccountId(ledgerId, guestId), ledgerId)
  })

  it('treats empty candidate as missing', () => {
    assert.equal(usableCityLedgerAccountId('', guestId), null)
    assert.equal(usableCityLedgerAccountId(null, guestId), null)
  })
})
