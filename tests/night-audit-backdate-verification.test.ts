import assert from 'node:assert/strict'
import test from 'node:test'

import {
  isStayCheckInConsideredBackdated,
  verifyStayCheckInBackdate,
} from '../lib/hotel-date'

const now = new Date('2026-07-16T11:00:00.000Z')
const timeZone = 'Africa/Lagos'

test('submit verification detects an audit that closed after the modal loaded', async () => {
  const staleStatus = isStayCheckInConsideredBackdated(
    '2026-07-15',
    now,
    timeZone,
    { auditedDates: new Set() },
  )
  assert.equal(staleStatus, false)

  const verifiedStatus = await verifyStayCheckInBackdate(
    '2026-07-15',
    async () => new Set(['2026-07-15']),
    now,
    timeZone,
  )
  assert.equal(verifiedStatus, true)
})

test('submit verification permits yesterday when Night Audit confirms it is open', async () => {
  const verifiedStatus = await verifyStayCheckInBackdate(
    '2026-07-15',
    async () => new Set(),
    now,
    timeZone,
  )
  assert.equal(verifiedStatus, false)
})

test('submit verification fails closed when Night Audit cannot be checked', async () => {
  const verifiedStatus = await verifyStayCheckInBackdate(
    '2026-07-15',
    async () => null,
    now,
    timeZone,
  )
  assert.equal(verifiedStatus, null)
})
