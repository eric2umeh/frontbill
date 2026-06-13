import assert from 'node:assert/strict'
import test from 'node:test'
import {
  deriveRoomStatusFromOccupying,
  pickOccupyingBooking,
  pickRoomStatusHoldBooking,
  type OccupyingBookingRow,
} from '../lib/rooms/room-occupancy'
import { resolveOutletCustomerContext } from '../lib/outlets/resolve-outlet-customer'

function ymdPlus(days: number): string {
  const d = new Date(Date.now() + days * 24 * 60 * 60 * 1000)
  return d.toISOString().slice(0, 10)
}

test('room-status reconciliation preserves housekeeping cleaning blocks', () => {
  assert.equal(deriveRoomStatusFromOccupying(null, 'cleaning'), null)
})

test('room-status holds keep future reservations unavailable without making them outlet-occupying', () => {
  const futureReservation: OccupyingBookingRow = {
    id: 'future-reservation',
    room_id: 'room-101',
    status: 'reserved',
    check_in: ymdPlus(10),
    check_out: ymdPlus(12),
    folio_status: 'active',
  }

  assert.equal(pickOccupyingBooking([futureReservation]), null)
  assert.equal(pickRoomStatusHoldBooking([futureReservation])?.id, 'future-reservation')
  assert.equal(deriveRoomStatusFromOccupying(futureReservation, 'available'), 'reserved')
})

test('room-status holds prefer checked-in stays over non-overlapping reservations', () => {
  const checkedIn: OccupyingBookingRow = {
    id: 'checked-in',
    room_id: 'room-101',
    status: 'checked_in',
    check_in: ymdPlus(-1),
    check_out: ymdPlus(1),
    folio_status: 'active',
  }
  const futureReservation: OccupyingBookingRow = {
    id: 'future-reservation',
    room_id: 'room-101',
    status: 'confirmed',
    check_in: ymdPlus(20),
    check_out: ymdPlus(23),
    folio_status: 'active',
  }

  const hold = pickRoomStatusHoldBooking([futureReservation, checkedIn])
  assert.equal(hold?.id, 'checked-in')
  assert.equal(deriveRoomStatusFromOccupying(hold, 'reserved'), 'occupied')
})

function mockBookingSupabase(rows: unknown[], error: Error | null = null) {
  return {
    from(table: string) {
      assert.equal(table, 'bookings')
      const chain = {
        select() {
          return chain
        },
        eq() {
          return chain
        },
        in() {
          return chain
        },
        limit() {
          return Promise.resolve({ data: rows, error })
        },
      }
      return chain
    },
  }
}

test('outlet customer resolution rejects supplied booking IDs outside active in-house stays', async () => {
  await assert.rejects(
    () =>
      resolveOutletCustomerContext(mockBookingSupabase([]) as never, 'org-1', {
        bookingId: 'other-org-booking',
      }),
    /active in-house stay/,
  )
})

test('outlet customer resolution accepts valid in-house booking IDs and fills context', async () => {
  const ctx = await resolveOutletCustomerContext(
    mockBookingSupabase([
      {
        id: 'booking-1',
        room_id: 'room-101',
        status: 'checked_in',
        check_in: ymdPlus(-1),
        check_out: ymdPlus(1),
        folio_status: 'active',
        guests: { name: 'Ada Guest' },
        rooms: { room_number: '101' },
      },
    ]) as never,
    'org-1',
    { bookingId: 'booking-1' },
  )

  assert.deepEqual(ctx, {
    bookingId: 'booking-1',
    guestName: 'Ada Guest',
    roomNumber: '101',
  })
})
