import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  isRoomAssignable,
  normalizeRoomsForBookingPickers,
  roomNotBookableReason,
} from '../lib/utils/room-bookability.ts'

test('occupied and reserved PMS rooms stay in booking pickers for future dates', () => {
  assert.equal(isRoomAssignable('occupied'), true)
  assert.equal(isRoomAssignable('reserved'), true)
  assert.equal(isRoomAssignable('available'), true)
  assert.equal(isRoomAssignable('cleaning'), true)
  assert.equal(roomNotBookableReason({ status: 'occupied' }), null)
  assert.equal(roomNotBookableReason({ status: 'reserved' }), null)
})

test('HK occupied / reservation / complimentary do not hide rooms from pickers', () => {
  for (const hk of ['occupied', 'reservation', 'complimentary', 'long_stay', 'sleep_out', 'checkout', 'vacant']) {
    assert.equal(isRoomAssignable('available', hk), true, hk)
    assert.equal(roomNotBookableReason({ status: 'available', housekeeping_status: hk }), null, hk)
  }
})

test('maintenance and out-of-order inventory holds stay blocked', () => {
  assert.equal(isRoomAssignable('maintenance'), false)
  assert.equal(isRoomAssignable('out_of_order'), false)
  assert.equal(isRoomAssignable('available', 'out_of_order'), false)
  assert.match(roomNotBookableReason({ status: 'maintenance' }) ?? '', /maintenance/)
  assert.match(roomNotBookableReason({ status: 'out_of_order' }) ?? '', /out of order/)
  assert.match(
    roomNotBookableReason({ status: 'available', housekeeping_status: 'out_of_order' }) ?? '',
    /Out of Order/,
  )
})

test('normalizeRoomsForBookingPickers keeps occupied rooms and drops OOO', () => {
  const rows = normalizeRoomsForBookingPickers([
    { id: '101', room_number: '101', room_type: 'Deluxe', status: 'occupied' },
    { id: '102', room_number: '102', room_type: 'Deluxe', status: 'reserved', housekeeping_status: 'reservation' },
    { id: '103', room_number: '103', room_type: 'Deluxe', status: 'out_of_order', housekeeping_status: 'out_of_order' },
    { id: '104', room_number: '104', room_type: 'Deluxe', status: 'maintenance' },
    { id: '105', room_number: '105', room_type: 'Deluxe', status: 'available', housekeeping_status: 'occupied' },
  ])
  assert.deepEqual(
    rows.map((r) => r.id),
    ['101', '102', '105'],
  )
})
