import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  applyFolioStayCheckout,
  stayCheckoutPatch,
} from '../lib/booking/checkout-folio-stay'
import { pickOccupyingBooking } from '../lib/rooms/room-occupancy'
import { isBookingCheckedOut, localTodayYmd } from '../lib/utils/booking-checkout-ui'

function addDays(ymd: string, days: number): string {
  const [y, m, d] = ymd.split('-').map(Number)
  const dt = new Date(y, m - 1, d + days)
  const yy = dt.getFullYear()
  const mm = String(dt.getMonth() + 1).padStart(2, '0')
  const dd = String(dt.getDate()).padStart(2, '0')
  return `${yy}-${mm}-${dd}`
}

describe('stayCheckoutPatch', () => {
  it('sets stay status and folio_status together', () => {
    const patch = stayCheckoutPatch({ check_out: '2020-01-15' }, 'staff-1')
    assert.equal(patch.status, 'checked_out')
    assert.equal(patch.folio_status, 'checked_out')
    assert.equal(patch.check_out, '2020-01-15')
    assert.equal(patch.updated_by, 'staff-1')
    assert.equal(isBookingCheckedOut(patch), true)
  })

  it('keeps a past scheduled check-out date', () => {
    assert.equal(stayCheckoutPatch({ check_out: '2019-12-01T10:00:00Z' }).check_out, '2019-12-01')
  })

  it('writes today when the stay has not ended yet', () => {
    const today = localTodayYmd()
    const later = addDays(today, 3)
    assert.equal(stayCheckoutPatch({ check_out: later }).check_out, today)
  })
})

describe('folio-only close occupancy hole', () => {
  it('folio_status checked_out vacates the room even if status stays checked_in', () => {
    const today = localTodayYmd()
    const occupying = pickOccupyingBooking([
      {
        id: 'stay-1',
        room_id: 'room-101',
        status: 'checked_in',
        check_in: addDays(today, -1),
        check_out: addDays(today, 2),
        folio_status: 'checked_out',
      },
    ])
    assert.equal(occupying, null)
  })

  it('full stay checkout also vacates and is consistent with isBookingCheckedOut', () => {
    const today = localTodayYmd()
    const closed = stayCheckoutPatch({ check_out: addDays(today, 2) })
    const occupying = pickOccupyingBooking([
      {
        id: 'stay-1',
        room_id: 'room-101',
        status: closed.status,
        check_in: addDays(today, -1),
        check_out: closed.check_out,
        folio_status: closed.folio_status,
      },
    ])
    assert.equal(occupying, null)
    assert.equal(isBookingCheckedOut(closed), true)
    assert.equal(closed.status, 'checked_out')
  })
})

describe('applyFolioStayCheckout', () => {
  it('writes status, folio_status, and check_out for each stay on the folio', async () => {
    const updates: Array<{ id: string; patch: Record<string, unknown> }> = []
    const filters: Array<{ col: string; val: unknown }> = []

    const supabase = {
      from(table: string) {
        assert.equal(table, 'bookings')
        return {
          select() {
            return this
          },
          eq(col: string, val: unknown) {
            filters.push({ col, val })
            return this
          },
          then(resolve: (value: { data: unknown; error: null }) => unknown) {
            return Promise.resolve(
              resolve({
                data: [
                  { id: 'b1', check_out: '2020-06-10' },
                  { id: 'b2', check_out: '2020-06-11' },
                ],
                error: null,
              }),
            )
          },
          update(patch: Record<string, unknown>) {
            return {
              eq(_col: string, id: string) {
                updates.push({ id, patch })
                return Promise.resolve({ error: null })
              },
            }
          },
        }
      },
    }

    const result = await applyFolioStayCheckout(supabase as never, {
      folioId: 'FOLIO-9',
      organizationId: 'org-1',
      updatedBy: 'staff-9',
    })

    assert.equal(result.updated, 2)
    assert.equal(result.checkOut, '2020-06-11')
    assert.deepEqual(filters, [
      { col: 'folio_id', val: 'FOLIO-9' },
      { col: 'organization_id', val: 'org-1' },
    ])
    assert.equal(updates.length, 2)
    assert.equal(updates[0].id, 'b1')
    assert.equal(updates[0].patch.status, 'checked_out')
    assert.equal(updates[0].patch.folio_status, 'checked_out')
    assert.equal(updates[0].patch.check_out, '2020-06-10')
    assert.equal(updates[0].patch.updated_by, 'staff-9')
    assert.equal(updates[1].id, 'b2')
    assert.equal(updates[1].patch.status, 'checked_out')
  })

  it('rejects a missing folio instead of writing folio_status alone', async () => {
    const supabase = {
      from() {
        return {
          select() {
            return this
          },
          eq() {
            return this
          },
          then(resolve: (value: { data: unknown[]; error: null }) => unknown) {
            return Promise.resolve(resolve({ data: [], error: null }))
          },
        }
      },
    }

    await assert.rejects(
      () => applyFolioStayCheckout(supabase as never, { folioId: 'missing' }),
      /Folio not found/,
    )
  })
})

