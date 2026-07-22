import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

import { verifyStayDateWithNightAudit } from '../lib/night-audit/verify-stay-date'

const lateNight = new Date('2026-07-22T00:30:00.000Z')
const yesterday = '2026-07-21'

test('fails closed when closed-date verification fails', async () => {
  assert.deepEqual(
    await verifyStayDateWithNightAudit(yesterday, async () => null, lateNight, 'Africa/Lagos'),
    { ok: false },
  )
  assert.deepEqual(
    await verifyStayDateWithNightAudit(
      yesterday,
      async () => {
        throw new Error('network unavailable')
      },
      lateNight,
      'Africa/Lagos',
    ),
    { ok: false },
  )
})

test('uses freshly loaded audit dates to classify yesterday', async () => {
  const openDate = await verifyStayDateWithNightAudit(
    yesterday,
    async () => new Set(),
    lateNight,
    'Africa/Lagos',
  )
  assert.equal(openDate.ok, true)
  if (openDate.ok) assert.equal(openDate.isBackdated, false)

  const closedDate = await verifyStayDateWithNightAudit(
    yesterday,
    async () => new Set([yesterday]),
    lateNight,
    'Africa/Lagos',
  )
  assert.equal(closedDate.ok, true)
  if (closedDate.ok) assert.equal(closedDate.isBackdated, true)
})

test('all direct stay writers refresh Night Audit state before booking inserts', async () => {
  const root = fileURLToPath(new URL('..', import.meta.url))
  const directWriters = [
    'components/dashboard/checkin-modal.tsx',
    'components/bookings/new-booking-modal.tsx',
    'components/reservations/new-reservation-modal.tsx',
    'components/reservations/bulk-booking-modal.tsx',
  ]

  for (const relativePath of directWriters) {
    const source = await readFile(`${root}/${relativePath}`, 'utf8')
    const verification = source.indexOf('await verifyStayDateWithNightAudit(')
    const bookingInsert = source.indexOf(".from('bookings')", verification)
    assert.notEqual(verification, -1, `${relativePath} must verify Night Audit state`)
    assert.notEqual(bookingInsert, -1, `${relativePath} must insert only after verification`)
    assert.ok(
      verification < bookingInsert,
      `${relativePath} must refresh Night Audit state before writing a booking`,
    )
  }
})

test('dashboard data loading cannot overwrite a staff date selection', async () => {
  const root = fileURLToPath(new URL('..', import.meta.url))
  const source = await readFile(`${root}/components/dashboard/checkin-modal.tsx`, 'utf8')
  const loadData = source.slice(
    source.indexOf('const loadData = async () =>'),
    source.indexOf('const filterRooms ='),
  )

  assert.doesNotMatch(loadData, /setCheckInDate|setCheckOutDate|setNights/)
  assert.match(
    loadData,
    /filterRooms\(checkInDateRef\.current, checkOutDateRef\.current/,
  )
})
