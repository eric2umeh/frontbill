import assert from 'node:assert/strict'
import { test } from 'node:test'

import { roomStatusAfterReservationCancel } from '../lib/reservations/cancel-reservation.ts'

test('keeps a room occupied when another booking is still checked in', () => {
  const nextStatus = roomStatusAfterReservationCancel(
    [{ status: 'checked_in', folio_status: 'active' }],
    'occupied',
  )

  assert.equal(nextStatus, 'occupied')
})

test('keeps a room reserved when another active room hold remains', () => {
  const nextStatus = roomStatusAfterReservationCancel(
    [{ status: 'reserved', folio_status: 'active' }],
    'reserved',
  )

  assert.equal(nextStatus, 'reserved')
})

test('frees a reserved or occupied room when no active room holds remain', () => {
  assert.equal(roomStatusAfterReservationCancel([], 'reserved'), 'available')
  assert.equal(roomStatusAfterReservationCancel([], 'occupied'), 'available')
})

test('ignores cancelled or checked-out remaining folios', () => {
  const nextStatus = roomStatusAfterReservationCancel(
    [
      { status: 'reserved', folio_status: 'cancelled' },
      { status: 'checked_in', folio_status: 'checked_out' },
    ],
    'reserved',
  )

  assert.equal(nextStatus, 'available')
})

test('does not overwrite housekeeping or already available room statuses', () => {
  assert.equal(roomStatusAfterReservationCancel([], 'cleaning'), null)
  assert.equal(roomStatusAfterReservationCancel([], 'maintenance'), null)
  assert.equal(roomStatusAfterReservationCancel([], 'out_of_order'), null)
  assert.equal(roomStatusAfterReservationCancel([], 'available'), null)
})
