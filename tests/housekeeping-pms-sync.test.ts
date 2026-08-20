import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  pmsStatusForHousekeepingStatus,
  pmsStatusPatchForHousekeepingChange,
} from '../lib/rooms/housekeeping-status'

describe('pmsStatusForHousekeepingStatus', () => {
  it('maps only OOO onto PMS out_of_order', () => {
    assert.equal(pmsStatusForHousekeepingStatus('out_of_order'), 'out_of_order')
  })

  it('does not rewrite occupancy from vacant / occupied / reservation floor labels', () => {
    assert.equal(pmsStatusForHousekeepingStatus('vacant'), null)
    assert.equal(pmsStatusForHousekeepingStatus('occupied'), null)
    assert.equal(pmsStatusForHousekeepingStatus('reservation'), null)
    assert.equal(pmsStatusForHousekeepingStatus('checkout'), null)
    assert.equal(pmsStatusForHousekeepingStatus('complimentary'), null)
    assert.equal(pmsStatusForHousekeepingStatus('long_stay'), null)
    assert.equal(pmsStatusForHousekeepingStatus('sleep_out'), null)
  })
})

describe('pmsStatusPatchForHousekeepingChange', () => {
  it('does not clear occupied when HK marks vacant on an in-house room', () => {
    assert.equal(
      pmsStatusPatchForHousekeepingChange({
        hkStatus: 'vacant',
        currentPmsStatus: 'occupied',
      }),
      null,
    )
  })

  it('does not lock a vacant sellable room as occupied or reserved', () => {
    assert.equal(
      pmsStatusPatchForHousekeepingChange({
        hkStatus: 'occupied',
        currentPmsStatus: 'available',
      }),
      null,
    )
    assert.equal(
      pmsStatusPatchForHousekeepingChange({
        hkStatus: 'reservation',
        currentPmsStatus: 'available',
      }),
      null,
    )
  })

  it('does not clear a future reserved hold when HK marks vacant', () => {
    assert.equal(
      pmsStatusPatchForHousekeepingChange({
        hkStatus: 'vacant',
        currentPmsStatus: 'reserved',
      }),
      null,
    )
  })

  it('sets PMS out_of_order when HK marks OOO', () => {
    assert.equal(
      pmsStatusPatchForHousekeepingChange({
        hkStatus: 'out_of_order',
        currentPmsStatus: 'available',
      }),
      'out_of_order',
    )
    assert.equal(
      pmsStatusPatchForHousekeepingChange({
        hkStatus: 'out_of_order',
        currentPmsStatus: 'occupied',
      }),
      'out_of_order',
    )
  })

  it('restores occupied from the live folio when HK clears OOO', () => {
    assert.equal(
      pmsStatusPatchForHousekeepingChange({
        hkStatus: 'vacant',
        currentPmsStatus: 'out_of_order',
        occupyingPmsStatus: 'occupied',
      }),
      'occupied',
    )
  })

  it('restores available when HK clears OOO with no occupying folio', () => {
    assert.equal(
      pmsStatusPatchForHousekeepingChange({
        hkStatus: 'vacant',
        currentPmsStatus: 'out_of_order',
        occupyingPmsStatus: null,
      }),
      'available',
    )
  })

  it('does not clear maintenance from an HK vacant/occupied tap', () => {
    assert.equal(
      pmsStatusPatchForHousekeepingChange({
        hkStatus: 'vacant',
        currentPmsStatus: 'maintenance',
      }),
      null,
    )
  })
})
