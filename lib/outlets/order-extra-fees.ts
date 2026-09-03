import type { OutletOrderType } from '@/lib/outlets/types'

function parseFee(value: unknown): number | null {
  if (value == null || value === '') return 0
  const n = Math.round(Number(value) * 100) / 100
  if (!Number.isFinite(n) || n < 0) return null
  return n
}

export type OutletOrderExtraFees = {
  roomServiceFee: number
  takeawayFee: number
  extraFeesTotal: number
}

export function parseOutletOrderExtraFees(
  orderType: string,
  body: { room_service_fee?: unknown; takeaway_fee?: unknown },
): { fees: OutletOrderExtraFees; error?: string } {
  const ot = orderType as OutletOrderType
  let roomServiceFee = 0
  let takeawayFee = 0

  if (ot === 'room_service' && body.room_service_fee != null && body.room_service_fee !== '') {
    const parsed = parseFee(body.room_service_fee)
    if (parsed === null) return { fees: { roomServiceFee: 0, takeawayFee: 0, extraFeesTotal: 0 }, error: 'Invalid room service fee' }
    roomServiceFee = parsed
  }

  if (ot === 'takeaway' && body.takeaway_fee != null && body.takeaway_fee !== '') {
    const parsed = parseFee(body.takeaway_fee)
    if (parsed === null) return { fees: { roomServiceFee: 0, takeawayFee: 0, extraFeesTotal: 0 }, error: 'Invalid take-away fee' }
    takeawayFee = parsed
  }

  const extraFeesTotal = Math.round((roomServiceFee + takeawayFee) * 100) / 100
  return { fees: { roomServiceFee, takeawayFee, extraFeesTotal } }
}

export const OUTLET_FEE_LINE_NAMES = {
  roomService: 'Room service delivery fee',
  takeaway: 'Take-away fee',
} as const

const FEE_LINE_NAMES = new Set<string>([
  OUTLET_FEE_LINE_NAMES.roomService,
  OUTLET_FEE_LINE_NAMES.takeaway,
])

export function isOutletFeeLineName(name: string): boolean {
  return FEE_LINE_NAMES.has(name.trim())
}

export function roundOutletMoney(n: number): number {
  return Math.round(n * 100) / 100
}

/** Product (non-fee) line total. Fee rows in `lines` are ignored so they cannot double-count. */
export function outletOrderItemsSubtotal(
  lines: Array<{ item_name?: string | null; qty: number; unit_price: number }>,
): number {
  return roundOutletMoney(
    lines
      .filter((l) => !isOutletFeeLineName(String(l.item_name ?? '')))
      .reduce((s, l) => s + roundOutletMoney(Number(l.qty) * Number(l.unit_price)), 0),
  )
}

/**
 * Amount charged on create, edit, settle, and folio — items plus room-service / take-away fees.
 * Matches POST /api/outlets/orders (`itemsSubtotal + extraFeesTotal`).
 */
export function outletOrderChargeTotal(
  itemsSubtotal: number,
  roomServiceFee: number,
  takeawayFee: number,
): number {
  return roundOutletMoney(itemsSubtotal + (roomServiceFee || 0) + (takeawayFee || 0))
}
