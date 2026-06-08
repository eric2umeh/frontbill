import assert from 'node:assert/strict'
import { register } from 'node:module'
import test from 'node:test'

register(new URL('./ts-alias-loader.mjs', import.meta.url).href, import.meta.url)

const {
  deriveRoomStatusFromOccupying,
  pickOccupyingBooking,
  pickRoomStatusBooking,
} = await import('../lib/rooms/room-occupancy.ts')

test('room reconciliation preserves housekeeping blocks', () => {
  assert.equal(deriveRoomStatusFromOccupying(null, 'cleaning'), null)
  assert.equal(deriveRoomStatusFromOccupying({ status: 'reserved' }, 'cleaning'), null)
  assert.equal(deriveRoomStatusFromOccupying(null, 'maintenance'), null)
  assert.equal(deriveRoomStatusFromOccupying(null, 'out-of-order'), null)
})

test('future reservations remain room-status holds without becoming outlet occupancy', () => {
  const rows = [
    {
      id: 'future-reservation',
      room_id: 'room-1',
      status: 'reserved',
      check_in: '2099-01-01',
      check_out: '2099-01-03',
      folio_status: 'active',
    },
  ]

  assert.equal(pickOccupyingBooking(rows), null)
  assert.equal(pickRoomStatusBooking(rows)?.id, 'future-reservation')
  assert.equal(deriveRoomStatusFromOccupying(pickRoomStatusBooking(rows), 'available'), 'reserved')
})

test('past reserved rooms are freed when no active or future hold remains', () => {
  const rows = [
    {
      id: 'past-reservation',
      room_id: 'room-1',
      status: 'reserved',
      check_in: '2000-01-01',
      check_out: '2000-01-03',
      folio_status: 'active',
    },
  ]

  assert.equal(pickRoomStatusBooking(rows), null)
  assert.equal(deriveRoomStatusFromOccupying(null, 'reserved'), 'available')
})
