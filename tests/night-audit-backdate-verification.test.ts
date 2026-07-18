import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
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

test('submit verification does not depend on Night Audit for today or future dates', async () => {
  let loadCalls = 0
  const unavailableLoader = async () => {
    loadCalls += 1
    return null
  }

  assert.equal(
    await verifyStayCheckInBackdate('2026-07-16', unavailableLoader, now, timeZone),
    false,
  )
  assert.equal(
    await verifyStayCheckInBackdate('2026-07-17', unavailableLoader, now, timeZone),
    false,
  )
  assert.equal(loadCalls, 0)
})

test('older dates remain backdated without depending on Night Audit availability', async () => {
  let loadCalls = 0
  const unavailableLoader = async () => {
    loadCalls += 1
    return null
  }

  assert.equal(
    await verifyStayCheckInBackdate('2026-07-14', unavailableLoader, now, timeZone),
    true,
  )
  assert.equal(loadCalls, 0)
})

test('every direct booking modal verifies Night Audit after submit begins and before insert', () => {
  const modalPaths = [
    'components/bookings/new-booking-modal.tsx',
    'components/reservations/new-reservation-modal.tsx',
    'components/reservations/bulk-booking-modal.tsx',
  ]

  for (const modalPath of modalPaths) {
    const source = readFileSync(new URL(`../${modalPath}`, import.meta.url), 'utf8')
    const submitStart = source.indexOf('const handleSubmit = async () =>')
    const verification = source.indexOf('await verifyStayCheckInBackdate(', submitStart)
    const bookingInsert = source.indexOf(".from('bookings')", verification)

    assert.notEqual(submitStart, -1, `${modalPath} must define handleSubmit`)
    assert.notEqual(verification, -1, `${modalPath} must verify Night Audit during submit`)
    assert.notEqual(bookingInsert, -1, `${modalPath} must perform booking insert after verification`)
    assert.ok(verification < bookingInsert, `${modalPath} must verify before its direct booking insert`)
  }
})
