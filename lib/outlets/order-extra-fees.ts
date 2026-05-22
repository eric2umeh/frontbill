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
