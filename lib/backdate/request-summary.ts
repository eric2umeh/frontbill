import type { SerializedBookingPayload } from '@/lib/backdate/booking-payload'

export type BackdateRequestSummary = {
  guest_name?: string | null
  guest_phone?: string | null
  room_number?: string | null
  room_type?: string | null
  nights?: number | null
  rate_per_night?: number | null
  total_amount?: number | null
  payment_method?: string | null
  payment_status?: string | null
  amount_paid?: number | null
  /** Bulk / reservation extras */
  booking_type?: string | null
  organization_name?: string | null
  room_count?: number | null
}

type BackdateRow = {
  request_type: string
  requested_check_in: string
  requested_check_out?: string | null
  metadata?: Record<string, unknown> | null
}

type RoomLookup = Record<string, { room_number?: string; room_type?: string; price_per_night?: number }>

function payloadFromMeta(meta: Record<string, unknown>): SerializedBookingPayload | null {
  const p = meta.booking_payload
  if (!p || typeof p !== 'object') return null
  return p as SerializedBookingPayload
}

export function buildBackdateRequestSummary(
  row: BackdateRow,
  roomLookup: RoomLookup = {},
): BackdateRequestSummary {
  const meta = (row.metadata && typeof row.metadata === 'object' ? row.metadata : {}) as Record<string, unknown>
  const payload = payloadFromMeta(meta)
  const roomId = String(meta.room_id ?? payload?.room_id ?? '')
  const room = roomId ? roomLookup[roomId] : undefined

  if (payload) {
    const rate = payload.custom_price > 0 ? payload.custom_price : payload.price_per_night
    const total = rate * payload.nights
    return {
      guest_name: payload.guest?.full_name || (meta.guest_name as string) || null,
      guest_phone: payload.guest?.phone || null,
      room_number: payload.room_number || room?.room_number || null,
      room_type: room?.room_type || null,
      nights: payload.nights,
      rate_per_night: rate,
      total_amount: total,
      payment_method: payload.payment_method,
      payment_status: payload.payment_status,
      amount_paid: payload.amount_paid,
    }
  }

  const customPrice = Number(meta.custom_price) || 0
  const listPrice = Number(meta.price_per_night) || room?.price_per_night || 0
  const rate = customPrice > 0 ? customPrice : listPrice
  const nights =
    typeof meta.nights === 'number'
      ? meta.nights
      : row.requested_check_in && row.requested_check_out
        ? nightsBetween(row.requested_check_in, row.requested_check_out)
        : null

  return {
    guest_name: (meta.guest_name as string) || null,
    guest_phone: (meta.guest_phone as string) || null,
    room_number: (meta.room_number as string) || room?.room_number || null,
    room_type: (meta.room_type as string) || room?.room_type || null,
    nights,
    rate_per_night: rate || null,
    total_amount: rate && nights ? rate * nights : null,
    payment_method: (meta.payment_method as string) || null,
    payment_status: (meta.payment_status as string) || null,
    amount_paid: meta.amount_paid != null ? Number(meta.amount_paid) : null,
    booking_type: (meta.booking_type as string) || null,
    organization_name: (meta.organization_name as string) || null,
    room_count: meta.room_count != null ? Number(meta.room_count) : null,
  }
}

function nightsBetween(checkIn: string, checkOut: string): number | null {
  const a = new Date(`${checkIn}T12:00:00`)
  const b = new Date(`${checkOut}T12:00:00`)
  if (Number.isNaN(a.getTime()) || Number.isNaN(b.getTime())) return null
  const diff = Math.round((b.getTime() - a.getTime()) / 86400000)
  return diff > 0 ? diff : null
}

export function collectRoomIdsFromRequests(requests: BackdateRow[]): string[] {
  const ids = new Set<string>()
  for (const row of requests) {
    const meta = (row.metadata && typeof row.metadata === 'object' ? row.metadata : {}) as Record<string, unknown>
    const payload = payloadFromMeta(meta)
    const id = String(meta.room_id ?? payload?.room_id ?? '')
    if (id) ids.add(id)
  }
  return [...ids]
}
