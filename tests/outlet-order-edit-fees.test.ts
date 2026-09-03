import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  OUTLET_FEE_LINE_NAMES,
  outletOrderChargeTotal,
  outletOrderItemsSubtotal,
  parseOutletOrderExtraFees,
} from '../lib/outlets/order-extra-fees'

/**
 * Edit-order dialog sends product lines only plus fee fields.
 * POST create stores subtotal = items + extraFeesTotal; PATCH must do the same
 * or room-service / take-away fees vanish from folio, settle, and sales reports.
 */
describe('outlet order edit keeps extra fees in the charge total', () => {
  const productLines = [{ item_name: 'Jollof Rice', qty: 1, unit_price: 5_000 }]

  it('matches create: items plus room-service fee', () => {
    const fees = parseOutletOrderExtraFees('room_service', { room_service_fee: 1_500 })
    const items = outletOrderItemsSubtotal(productLines)
    const charged = outletOrderChargeTotal(
      items,
      fees.fees.roomServiceFee,
      fees.fees.takeawayFee,
    )
    assert.equal(items, 5_000)
    assert.equal(charged, 6_500)
  })

  it('matches create: items plus take-away fee', () => {
    const fees = parseOutletOrderExtraFees('takeaway', { takeaway_fee: 500 })
    const charged = outletOrderChargeTotal(
      outletOrderItemsSubtotal(productLines),
      fees.fees.roomServiceFee,
      fees.fees.takeawayFee,
    )
    assert.equal(charged, 5_500)
  })

  it('does not drop fees when qty on a product line changes', () => {
    const fees = parseOutletOrderExtraFees('room_service', { room_service_fee: 1_500 })
    const charged = outletOrderChargeTotal(
      outletOrderItemsSubtotal([{ item_name: 'Jollof Rice', qty: 2, unit_price: 5_000 }]),
      fees.fees.roomServiceFee,
      fees.fees.takeawayFee,
    )
    assert.equal(charged, 11_500)
  })

  it('does not double-count a fee row mixed into lines', () => {
    const fees = parseOutletOrderExtraFees('room_service', { room_service_fee: 1_500 })
    const charged = outletOrderChargeTotal(
      outletOrderItemsSubtotal([
        ...productLines,
        {
          item_name: OUTLET_FEE_LINE_NAMES.roomService,
          qty: 1,
          unit_price: 1_500,
        },
      ]),
      fees.fees.roomServiceFee,
      fees.fees.takeawayFee,
    )
    assert.equal(charged, 6_500)
  })

  it('clears room-service fee when the order type is no longer room service', () => {
    const fees = parseOutletOrderExtraFees('dine_in', { room_service_fee: 1_500 })
    const charged = outletOrderChargeTotal(
      outletOrderItemsSubtotal(productLines),
      fees.fees.roomServiceFee,
      fees.fees.takeawayFee,
    )
    assert.equal(fees.fees.roomServiceFee, 0)
    assert.equal(charged, 5_000)
  })
})
