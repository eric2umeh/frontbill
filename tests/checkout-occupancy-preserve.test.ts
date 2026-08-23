import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  deriveRoomStatusFromOccupying,
  isCheckedInOccupant,
} from '../lib/rooms/room-occupancy'
import {
  buildHousekeepingSyncPatch,
  roomHousekeepingPatchAfterGuestDeparture,
} from '../lib/rooms/sync-housekeeping-status'

const checkedIn = { status: 'checked_in', check_in: '2026-08-23' }
const reservedToday = { status: 'reserved', check_in: '2026-08-23' }

describe('isCheckedInOccupant', () => {
  it('is true only for checked_in folios', () => {
    assert.equal(isCheckedInOccupant(checkedIn), true)
    assert.equal(isCheckedInOccupant({ status: 'reserved' }), false)
    assert.equal(isCheckedInOccupant({ status: 'confirmed' }), false)
    assert.equal(isCheckedInOccupant(null), false)
  })
})

describe('deriveRoomStatusFromOccupying — checkout / cleaning', () => {
  it('restores occupied when a guest is already checked in on a C/O room', () => {
    assert.equal(
      deriveRoomStatusFromOccupying(checkedIn, 'cleaning', 'checkout'),
      'occupied',
    )
  })

  it('keeps C/O when the next folio is only reserved', () => {
    assert.equal(
      deriveRoomStatusFromOccupying(reservedToday, 'cleaning', 'checkout'),
      null,
    )
  })

  it('keeps C/O when the room is empty', () => {
    assert.equal(deriveRoomStatusFromOccupying(null, 'cleaning', 'checkout'), null)
  })

  it('still frees occupied rooms after a real departure', () => {
    assert.equal(deriveRoomStatusFromOccupying(null, 'occupied', 'occupied'), 'available')
  })
})

describe('roomHousekeepingPatchAfterGuestDeparture', () => {
  it('keeps the room occupied when another guest is already in-house', () => {
    const patch = roomHousekeepingPatchAfterGuestDeparture(checkedIn, '2026-08-23T12:00:00.000Z')
    assert.equal(patch.housekeeping_status, 'occupied')
    assert.equal(patch.status, 'occupied')
  })

  it('queues C/O / cleaning when nobody is checked in', () => {
    const empty = roomHousekeepingPatchAfterGuestDeparture(null, '2026-08-23T12:00:00.000Z')
    assert.equal(empty.housekeeping_status, 'checkout')
    assert.equal(empty.status, 'cleaning')

    const reserved = roomHousekeepingPatchAfterGuestDeparture(
      reservedToday,
      '2026-08-23T12:00:00.000Z',
    )
    assert.equal(reserved.housekeeping_status, 'checkout')
    assert.equal(reserved.status, 'cleaning')
  })
})

describe('buildHousekeepingSyncPatch — checkout vs in-house', () => {
  it('lifts checkout to occupied when a checked-in folio remains', () => {
    const patch = buildHousekeepingSyncPatch({
      currentHousekeepingStatus: 'checkout',
      occupying: checkedIn,
      now: '2026-08-23T12:00:00.000Z',
    })
    assert.ok(patch)
    assert.equal(patch?.housekeeping_status, 'occupied')
    assert.equal(patch?.status, 'occupied')
  })

  it('leaves checkout in place for an arriving reservation', () => {
    const patch = buildHousekeepingSyncPatch({
      currentHousekeepingStatus: 'checkout',
      occupying: reservedToday,
      now: '2026-08-23T12:00:00.000Z',
    })
    assert.equal(patch, null)
  })

  it('still marks occupied rooms C/O after the last guest leaves', () => {
    const patch = buildHousekeepingSyncPatch({
      currentHousekeepingStatus: 'occupied',
      occupying: null,
      now: '2026-08-23T12:00:00.000Z',
    })
    assert.equal(patch?.housekeeping_status, 'checkout')
    assert.equal(patch?.status, 'cleaning')
  })
})
