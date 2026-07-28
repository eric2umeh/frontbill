import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  buildRescheduleRoomChargeFolioUpdates,
  buildRescheduleStayFields,
  folioRoomChargeStatusAfterReschedule,
} from '../lib/booking/reschedule-stay.ts'
import { folioPositiveOutstandingSum } from '../lib/utils/booking-bill-balance.ts'

describe('reschedule folio sync', () => {
  it('maps booking payment_status onto folio room_charge status', () => {
    assert.equal(folioRoomChargeStatusAfterReschedule('paid'), 'paid')
    assert.equal(folioRoomChargeStatusAfterReschedule('city_ledger'), 'city_ledger')
    assert.equal(folioRoomChargeStatusAfterReschedule('partial'), 'unpaid')
    assert.equal(folioRoomChargeStatusAfterReschedule('pending'), 'unpaid')
  })

  it('shortening nights updates primary room_charge and clears extras', () => {
    const fields = buildRescheduleStayFields(
      {
        check_in: '2026-07-10',
        check_out: '2026-07-13',
        rate_per_night: 50_000,
        deposit: 0,
        payment_status: 'pending',
      },
      '2026-07-10',
      '2026-07-11',
    )
    assert.equal(fields.number_of_nights, 1)
    assert.equal(fields.total_amount, 50_000)
    assert.equal(fields.balance, 50_000)

    const patches = buildRescheduleRoomChargeFolioUpdates(
      [
        { id: 'rc-1', amount: 150_000, description: 'Initial booking charge - 3 nights' },
        { id: 'rc-2', amount: 10_000, description: 'Legacy room charge' },
      ],
      fields,
    )
    assert.deepEqual(patches, [
      {
        id: 'rc-1',
        amount: 50_000,
        description: 'Initial booking charge - 1 night',
        payment_status: 'unpaid',
      },
      {
        id: 'rc-2',
        amount: 0,
        description: 'Legacy room charge',
        payment_status: 'unpaid',
      },
    ])

    const outstanding = folioPositiveOutstandingSum([
      { amount: 50_000, charge_type: 'room_charge', payment_status: 'unpaid' },
      { amount: 0, charge_type: 'room_charge', payment_status: 'unpaid' },
    ])
    assert.equal(outstanding, 50_000)
  })

  it('lengthening a prepaid stay marks room_charge unpaid for the new balance', () => {
    const fields = buildRescheduleStayFields(
      {
        check_in: '2026-07-10',
        check_out: '2026-07-11',
        rate_per_night: 50_000,
        deposit: 50_000,
        payment_status: 'paid',
      },
      '2026-07-10',
      '2026-07-13',
    )
    assert.equal(fields.total_amount, 150_000)
    assert.equal(fields.balance, 100_000)
    assert.equal(fields.payment_status, 'partial')

    const [primary] = buildRescheduleRoomChargeFolioUpdates(
      [{ id: 'rc-1', amount: 50_000, description: 'Initial booking charge - 1 night' }],
      fields,
    )
    assert.equal(primary.amount, 150_000)
    assert.equal(primary.payment_status, 'unpaid')

    const outstanding = folioPositiveOutstandingSum([
      { amount: 150_000, charge_type: 'room_charge', payment_status: 'unpaid' },
      { amount: -50_000, charge_type: 'payment', payment_status: 'paid' },
    ])
    assert.equal(outstanding, 100_000)
  })

  it('shortening a fully paid stay keeps folio settled (no false outstanding)', () => {
    const fields = buildRescheduleStayFields(
      {
        check_in: '2026-07-10',
        check_out: '2026-07-13',
        rate_per_night: 50_000,
        deposit: 150_000,
        payment_status: 'paid',
      },
      '2026-07-10',
      '2026-07-11',
    )
    assert.equal(fields.total_amount, 50_000)
    assert.equal(fields.balance, 0)
    assert.equal(fields.payment_status, 'paid')

    const [primary] = buildRescheduleRoomChargeFolioUpdates(
      [{ id: 'rc-1', amount: 150_000, description: 'Initial booking charge - 3 nights' }],
      fields,
    )
    assert.equal(primary.amount, 50_000)
    assert.equal(primary.payment_status, 'paid')

    const outstanding = folioPositiveOutstandingSum([
      { amount: 50_000, charge_type: 'room_charge', payment_status: 'paid' },
      { amount: -150_000, charge_type: 'payment', payment_status: 'paid' },
    ])
    assert.equal(outstanding, 0)
  })
})
