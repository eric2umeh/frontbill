import assert from 'node:assert/strict'
import test from 'node:test'

import {
  defaultStayCheckInYmdHotel,
  isStayCheckInConsideredBackdated,
} from '../lib/hotel-date.ts'

const HOTEL_TZ = 'Africa/Lagos'
const DURING_GRACE = new Date('2026-07-14T01:00:00.000Z')
const YESTERDAY = '2026-07-13'
const TODAY = '2026-07-14'

test('unknown audit state fails closed for yesterday', () => {
  assert.equal(
    isStayCheckInConsideredBackdated(YESTERDAY, DURING_GRACE, HOTEL_TZ, {
      auditedDates: null,
    }),
    true,
  )
  assert.equal(defaultStayCheckInYmdHotel(DURING_GRACE, HOTEL_TZ), TODAY)
})

test('known open yesterday remains a normal late check-in', () => {
  const auditedDates = new Set()

  assert.equal(
    isStayCheckInConsideredBackdated(YESTERDAY, DURING_GRACE, HOTEL_TZ, {
      auditedDates,
    }),
    false,
  )
  assert.equal(
    defaultStayCheckInYmdHotel(DURING_GRACE, HOTEL_TZ, { auditedDates }),
    YESTERDAY,
  )
})

test('known closed yesterday requires approval and is not defaulted', () => {
  const auditedDates = new Set([YESTERDAY])

  assert.equal(
    isStayCheckInConsideredBackdated(YESTERDAY, DURING_GRACE, HOTEL_TZ, {
      auditedDates,
    }),
    true,
  )
  assert.equal(
    defaultStayCheckInYmdHotel(DURING_GRACE, HOTEL_TZ, { auditedDates }),
    TODAY,
  )
})
