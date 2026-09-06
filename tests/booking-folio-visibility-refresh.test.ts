import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { shouldRefreshOpenBookingFolio } from '../lib/utils/booking-checkout-ui.ts'

describe('shouldRefreshOpenBookingFolio', () => {
  it('refreshes an open folio when the tab is visible', () => {
    assert.equal(
      shouldRefreshOpenBookingFolio({ visibilityState: 'visible' }),
      true,
    )
  })

  it('skips interval/live refresh while the tab is hidden', () => {
    assert.equal(
      shouldRefreshOpenBookingFolio({ visibilityState: 'hidden' }),
      false,
    )
  })

  it('does not refresh during the initial load', () => {
    assert.equal(
      shouldRefreshOpenBookingFolio({ visibilityState: 'visible', loading: true }),
      false,
    )
  })

  it('does not refresh a checked-out folio', () => {
    assert.equal(
      shouldRefreshOpenBookingFolio({
        visibilityState: 'visible',
        checkedOut: true,
      }),
      false,
    )
  })

  it('treats a missing visibility state as visible so first paint still polls', () => {
    assert.equal(shouldRefreshOpenBookingFolio({}), true)
  })
})
