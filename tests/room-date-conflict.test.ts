import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  hasConflictingStayOnRoom,
  stayRowBlocksRange,
  type RoomStayConflictRow,
} from '../lib/booking/room-date-conflict'

function row(
  overrides: Partial<RoomStayConflictRow> & Pick<RoomStayConflictRow, 'id'>,
): RoomStayConflictRow {
  return {
    check_in: '2026-09-01',
    check_out: '2026-09-04',
    status: 'reserved',
    ...overrides,
  }
}

describe('stayRowBlocksRange', () => {
  it('blocks an in-house stay that overlaps a later reservation on the same room', () => {
    // Guest A 27–30 Aug extending through 5 Sep vs Guest B reserved 1–4 Sep
    assert.equal(
      stayRowBlocksRange(row({ id: 'guest-b', status: 'reserved' }), '2026-08-27', '2026-09-05'),
      true,
    )
  })

  it('allows extending up to the next arrival’s check-in (same-day turnover)', () => {
    assert.equal(
      stayRowBlocksRange(row({ id: 'guest-b', status: 'reserved' }), '2026-08-27', '2026-09-01'),
      false,
    )
  })

  it('does not treat cancelled, checked-out, or no-show folios as holds', () => {
    assert.equal(
      stayRowBlocksRange(row({ id: 'x', status: 'cancelled' }), '2026-08-27', '2026-09-05'),
      false,
    )
    assert.equal(
      stayRowBlocksRange(row({ id: 'x', status: 'checked_out' }), '2026-08-27', '2026-09-05'),
      false,
    )
    assert.equal(
      stayRowBlocksRange(row({ id: 'x', status: 'no_show' }), '2026-08-27', '2026-09-05'),
      false,
    )
  })

  it('ignores the booking being extended', () => {
    assert.equal(
      stayRowBlocksRange(
        row({ id: 'guest-a', status: 'checked_in', check_in: '2026-08-27', check_out: '2026-08-30' }),
        '2026-08-27',
        '2026-09-05',
        'guest-a',
      ),
      false,
    )
  })

  it('still overlaps when the other stay is stored as a timestamp', () => {
    assert.equal(
      stayRowBlocksRange(
        row({
          id: 'guest-b',
          check_in: '2026-09-01T12:00:00.000Z',
          check_out: '2026-09-04T12:00:00.000Z',
        }),
        '2026-08-27',
        '2026-09-05',
      ),
      true,
    )
  })
})

describe('hasConflictingStayOnRoom', () => {
  it('detects the occupied-room future-reservation extend-stay case', () => {
    const rows: RoomStayConflictRow[] = [
      row({
        id: 'guest-a',
        status: 'checked_in',
        check_in: '2026-08-27',
        check_out: '2026-08-30',
      }),
      row({ id: 'guest-b', status: 'reserved', check_in: '2026-09-01', check_out: '2026-09-04' }),
    ]
    assert.equal(
      hasConflictingStayOnRoom(rows, '2026-08-27', '2026-09-05', 'guest-a'),
      true,
    )
    assert.equal(
      hasConflictingStayOnRoom(rows, '2026-08-27', '2026-09-01', 'guest-a'),
      false,
    )
  })
})
