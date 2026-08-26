import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  canReleaseRoomInventory,
  type OccupyingBookingRow,
} from '../lib/rooms/room-occupancy'
import { todayYmdHotel } from '../lib/utils/booking-in-house-dates'

function addDays(ymd: string, days: number): string {
  const [y, m, d] = ymd.split('-').map(Number)
  const dt = new Date(Date.UTC(y, m - 1, d + days))
  const yy = dt.getUTCFullYear()
  const mm = String(dt.getUTCMonth() + 1).padStart(2, '0')
  const dd = String(dt.getUTCDate()).padStart(2, '0')
  return `${yy}-${mm}-${dd}`
}

function occupyingRow(
  overrides: Partial<OccupyingBookingRow> & Pick<OccupyingBookingRow, 'id' | 'status'>,
): OccupyingBookingRow {
  const today = todayYmdHotel()
  return {
    room_id: 'room-101',
    check_in: today,
    check_out: addDays(today, 2),
    ...overrides,
  }
}

describe('canReleaseRoomInventory', () => {
  it('allows release when no other folio remains on the room', () => {
    assert.equal(canReleaseRoomInventory([]), true)
  })

  it('blocks release when another guest is checked in today', () => {
    assert.equal(
      canReleaseRoomInventory([
        occupyingRow({ id: 'guest-a', status: 'checked_in' }),
      ]),
      false,
    )
  })

  it('blocks release when a confirmed in-house folio remains', () => {
    assert.equal(
      canReleaseRoomInventory([
        occupyingRow({ id: 'guest-a', status: 'confirmed' }),
      ]),
      false,
    )
  })

  it('allows release when the only remaining row is a future arrival', () => {
    const today = todayYmdHotel()
    assert.equal(
      canReleaseRoomInventory([
        occupyingRow({
          id: 'guest-future',
          status: 'confirmed',
          check_in: addDays(today, 5),
          check_out: addDays(today, 7),
        }),
      ]),
      true,
    )
  })

  it('blocks release when the remaining guest is due out today', () => {
    const today = todayYmdHotel()
    assert.equal(
      canReleaseRoomInventory([
        occupyingRow({
          id: 'guest-due-out',
          status: 'checked_in',
          check_in: addDays(today, -1),
          check_out: today,
        }),
      ]),
      false,
    )
  })

  it('allows release after the remaining guest has already departed', () => {
    const today = todayYmdHotel()
    assert.equal(
      canReleaseRoomInventory([
        occupyingRow({
          id: 'guest-gone',
          status: 'checked_in',
          check_in: addDays(today, -4),
          check_out: addDays(today, -1),
        }),
      ]),
      true,
    )
  })
})
