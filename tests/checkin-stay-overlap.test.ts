import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  bookingsDateRangesOverlap,
  occupyingStayBlocksRoom,
  roomIdsBlockedForStay,
  stayDatesFromActualArrival,
} from '../lib/booking/edit-booking-patch'

describe('stayDatesFromActualArrival', () => {
  it('keeps original nights when the guest arrives late', () => {
    const stay = stayDatesFromActualArrival({
      originalCheckIn: '2026-08-20',
      originalCheckOut: '2026-08-22',
      actualArrivalYmd: '2026-08-22',
      numberOfNights: 2,
    })
    assert.deepEqual(stay, {
      check_in: '2026-08-22',
      check_out: '2026-08-24',
      number_of_nights: 2,
    })
  })

  it('shifts an early arrival onto today for the original night count', () => {
    const stay = stayDatesFromActualArrival({
      originalCheckIn: '2026-08-25',
      originalCheckOut: '2026-08-27',
      actualArrivalYmd: '2026-08-20',
      numberOfNights: 2,
    })
    assert.deepEqual(stay, {
      check_in: '2026-08-20',
      check_out: '2026-08-22',
      number_of_nights: 2,
    })
  })
})

describe('bookingsDateRangesOverlap', () => {
  it('does not treat same-day succession as an overlap', () => {
    assert.equal(
      bookingsDateRangesOverlap('2026-08-20', '2026-08-22', '2026-08-22', '2026-08-24'),
      false,
    )
  })

  it('detects overlapping hotel nights', () => {
    assert.equal(
      bookingsDateRangesOverlap('2026-08-22', '2026-08-24', '2026-08-22', '2026-08-24'),
      true,
    )
    assert.equal(
      bookingsDateRangesOverlap('2026-08-20', '2026-08-23', '2026-08-22', '2026-08-24'),
      true,
    )
  })

  it('normalizes ISO timestamps to calendar dates', () => {
    assert.equal(
      bookingsDateRangesOverlap(
        '2026-08-22T00:00:00.000Z',
        '2026-08-24T00:00:00.000Z',
        '2026-08-22',
        '2026-08-24',
      ),
      true,
    )
  })
})

describe('late reservation check-in vs next guest on the same room', () => {
  const nextGuest = {
    id: 'guest-b',
    room_id: 'room-101',
    check_in: '2026-08-22',
    check_out: '2026-08-24',
    status: 'checked_in',
  }

  it('original reserved dates miss the next guest (the escaped-review bug)', () => {
    assert.equal(
      occupyingStayBlocksRoom(nextGuest, 'room-101', '2026-08-20', '2026-08-22', 'guest-a'),
      false,
    )
  })

  it('shifted actual-arrival dates block the assigned room', () => {
    const stay = stayDatesFromActualArrival({
      originalCheckIn: '2026-08-20',
      originalCheckOut: '2026-08-22',
      actualArrivalYmd: '2026-08-22',
      numberOfNights: 2,
    })
    assert.equal(
      occupyingStayBlocksRoom(
        nextGuest,
        'room-101',
        stay.check_in,
        stay.check_out,
        'guest-a',
      ),
      true,
    )
    const blocked = roomIdsBlockedForStay(
      [nextGuest],
      stay.check_in,
      stay.check_out,
      'guest-a',
    )
    assert.equal(blocked.has('room-101'), true)
  })

  it('does not force-keep the reserved room when a later occupant holds it', () => {
    const stay = stayDatesFromActualArrival({
      originalCheckIn: '2026-08-20',
      originalCheckOut: '2026-08-22',
      actualArrivalYmd: '2026-08-22',
      numberOfNights: 2,
    })
    const blocked = roomIdsBlockedForStay(
      [nextGuest],
      stay.check_in,
      stay.check_out,
      'guest-a',
    )
    assert.equal(blocked.has('room-101'), true)
  })
})

describe('early reservation check-in vs current in-house guest', () => {
  it('blocks today occupancy after the stay is shifted forward', () => {
    const inHouse = {
      id: 'guest-now',
      room_id: 'room-101',
      check_in: '2026-08-20',
      check_out: '2026-08-22',
      status: 'checked_in',
    }
    const stay = stayDatesFromActualArrival({
      originalCheckIn: '2026-08-25',
      originalCheckOut: '2026-08-27',
      actualArrivalYmd: '2026-08-20',
      numberOfNights: 2,
    })
    assert.equal(
      occupyingStayBlocksRoom(
        inHouse,
        'room-101',
        stay.check_in,
        stay.check_out,
        'guest-future',
      ),
      true,
    )
  })

  it('ignores reserved folios that do not occupy inventory', () => {
    const reserved = {
      id: 'hold',
      room_id: 'room-101',
      check_in: '2026-08-22',
      check_out: '2026-08-24',
      status: 'reserved',
    }
    assert.equal(
      occupyingStayBlocksRoom(reserved, 'room-101', '2026-08-22', '2026-08-24', 'me'),
      false,
    )
  })
})
