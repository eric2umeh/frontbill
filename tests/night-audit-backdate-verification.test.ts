import assert from 'node:assert/strict'
import test from 'node:test'

import { isStayCheckInConsideredBackdated } from '../lib/hotel-date'

const now = new Date('2026-07-17T10:00:00.000Z')
const timeZone = 'Africa/Lagos'

test('yesterday fails closed until Night Audit dates are verified', () => {
  assert.equal(
    isStayCheckInConsideredBackdated('2026-07-16', now, timeZone),
    true,
  )
})

test('verified open and closed audit states remain distinct', () => {
  assert.equal(
    isStayCheckInConsideredBackdated('2026-07-16', now, timeZone, {
      auditedDates: new Set(),
    }),
    false,
  )
  assert.equal(
    isStayCheckInConsideredBackdated('2026-07-16', now, timeZone, {
      auditedDates: new Set(['2026-07-16']),
    }),
    true,
  )
})

test('dates outside yesterday do not depend on audit verification', () => {
  assert.equal(
    isStayCheckInConsideredBackdated('2026-07-15', now, timeZone),
    true,
  )
  assert.equal(
    isStayCheckInConsideredBackdated('2026-07-17', now, timeZone),
    false,
  )
  assert.equal(
    isStayCheckInConsideredBackdated('2026-07-18', now, timeZone),
    false,
  )
})
