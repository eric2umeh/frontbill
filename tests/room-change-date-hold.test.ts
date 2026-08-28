import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  hasConflictingStayOnRoom,
  stayRowBlocksRange,
  type RoomStayConflictRow,
} from '../lib/booking/room-date-conflict'
import { roomIdsHeldForStayRange } from '../lib/utils/room-bookability'

function row(
  overrides: Partial<RoomStayConflictRow> & Pick<RoomStayConflictRow, 'id'>,
): RoomStayConflictRow {
  return {
    check_in: '2026-09-01',
    check_out: '2026-09-05',
    status: 'reserved',
    ...overrides,
  }
}

describe('room change onto a reserved date hold', () => {
  it('rejects moving an in-house stay onto a room reserved for overlapping nights', () => {
    // Guest A checked in 202, 28 Aug–4 Sep, moving to 201
    // Guest B reserved 201, 1–5 Sep (room stays PMS available until check-in)
    const destHolds = [
      row({ id: 'guest-b', status: 'reserved', check_in: '2026-09-01', check_out: '2026-09-05' }),
    ]
    assert.equal(
      hasConflictingStayOnRoom(destHolds, '2026-08-28', '2026-09-04', 'guest-a'),
      true,
    )
  })

  it('allows the move when the reservation starts on the in-house checkout day', () => {
    const destHolds = [
      row({ id: 'guest-b', status: 'reserved', check_in: '2026-09-04', check_out: '2026-09-07' }),
    ]
    assert.equal(
      hasConflictingStayOnRoom(destHolds, '2026-08-28', '2026-09-04', 'guest-a'),
      false,
    )
  })

  it('allows the move when a later reservation does not overlap', () => {
    const destHolds = [
      row({ id: 'guest-b', status: 'reserved', check_in: '2026-09-10', check_out: '2026-09-12' }),
    ]
    assert.equal(
      hasConflictingStayOnRoom(destHolds, '2026-08-28', '2026-09-04', 'guest-a'),
      false,
    )
  })

  it('still blocks when the reserved stay is stored as a timestamp', () => {
    assert.equal(
      stayRowBlocksRange(
        row({
          id: 'guest-b',
          check_in: '2026-09-01T12:00:00.000Z',
          check_out: '2026-09-05T12:00:00.000Z',
        }),
        '2026-08-28',
        '2026-09-04',
      ),
      true,
    )
  })

  it('does not treat cancelled, checked-out, or no-show folios as holds', () => {
    for (const status of ['cancelled', 'checked_out', 'no_show'] as const) {
      assert.equal(
        stayRowBlocksRange(row({ id: 'x', status }), '2026-08-28', '2026-09-04'),
        false,
        status,
      )
    }
  })
})

describe('room-change picker date holds', () => {
  it('hides an available room that has an overlapping reservation', () => {
    const held = roomIdsHeldForStayRange(
      [
        {
          room_id: '201',
          check_in: '2026-09-01',
          check_out: '2026-09-05',
          status: 'reserved',
        },
      ],
      '2026-08-28',
      '2026-09-04',
    )
    assert.equal(held.has('201'), true)
  })

  it('keeps a currently occupied room selectable for a later non-overlapping stay', () => {
    const held = roomIdsHeldForStayRange(
      [
        {
          room_id: '201',
          check_in: '2026-08-20',
          check_out: '2026-08-25',
          status: 'checked_in',
        },
      ],
      '2026-09-01',
      '2026-09-04',
    )
    assert.equal(held.has('201'), false)
  })
})
