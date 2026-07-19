import assert from 'node:assert/strict'
import test from 'node:test'

import {
  defaultStayCheckInYmdHotel,
  isStayCheckInConsideredBackdated,
} from '../lib/hotel-date'

const timezone = 'Africa/Lagos'
const yesterday = '2026-07-18'
const today = '2026-07-19'

test('unknown closed-date state treats yesterday as backdated', () => {
  const daytime = new Date('2026-07-19T09:00:00Z')

  assert.equal(
    isStayCheckInConsideredBackdated(yesterday, daytime, timezone, {
      auditedDates: new Set(),
      auditedDatesReady: false,
    }),
    true,
  )
})

test('loaded closed dates distinguish open and audited yesterday', () => {
  const daytime = new Date('2026-07-19T09:00:00Z')

  assert.equal(
    isStayCheckInConsideredBackdated(yesterday, daytime, timezone, {
      auditedDates: new Set(),
      auditedDatesReady: true,
    }),
    false,
  )
  assert.equal(
    isStayCheckInConsideredBackdated(yesterday, daytime, timezone, {
      auditedDates: new Set([yesterday]),
      auditedDatesReady: true,
    }),
    true,
  )
})

test('late-night default waits for closed dates before selecting yesterday', () => {
  const oneAmHotelTime = new Date('2026-07-19T00:00:00Z')

  assert.equal(
    defaultStayCheckInYmdHotel(oneAmHotelTime, timezone, {
      auditedDates: new Set(),
      auditedDatesReady: false,
    }),
    today,
  )
  assert.equal(
    defaultStayCheckInYmdHotel(oneAmHotelTime, timezone, {
      auditedDates: new Set(),
      auditedDatesReady: true,
    }),
    yesterday,
  )
  assert.equal(
    defaultStayCheckInYmdHotel(oneAmHotelTime, timezone, {
      auditedDates: new Set([yesterday]),
      auditedDatesReady: true,
    }),
    today,
  )
})
