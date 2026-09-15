/**
 * Night Audit approval of a discounted extend-stay marks the folio paid and
 * bumps deposit, but Daily book / Night Audit collections read `transactions`
 * (and `payments`). Standard Extend Stay already inserts an EXT-* row; the
 * discount-approval path must do the same or cash/POS/transfer vanishes.
 */

export function relatedRecordString(relation: unknown, key: string): string {
  const row = Array.isArray(relation) ? relation[0] : relation
  if (!row || typeof row !== 'object') return ''
  const value = (row as Record<string, unknown>)[key]
  return typeof value === 'string' ? value : ''
}

export function shouldPostExtendStayDiscountCollection(
  paymentMethod: string,
  amount: number,
): boolean {
  const method = String(paymentMethod || '')
    .trim()
    .toLowerCase()
  if (
    method === 'city_ledger' ||
    method === 'room_charge' ||
    method === 'complimentary' ||
    method === 'pending'
  ) {
    return false
  }
  return Number.isFinite(amount) && amount > 0.005
}

export type ExtendStayDiscountCollectionInput = {
  organizationId: string
  bookingId: string
  guestName?: string | null
  roomNumber?: string | null
  amount: number
  paymentMethod: string
  nights: number
  userId: string
  nowMs?: number
}

export function buildExtendStayDiscountCollectionRow(
  input: ExtendStayDiscountCollectionInput,
): Record<string, unknown> | null {
  const amount = Math.round(Number(input.amount) * 100) / 100
  if (!shouldPostExtendStayDiscountCollection(input.paymentMethod, amount)) {
    return null
  }
  const nights = Math.max(1, Math.round(Number(input.nights) || 0))
  const nowMs = input.nowMs ?? Date.now()
  const method =
    String(input.paymentMethod || 'cash').trim().toLowerCase() || 'cash'
  return {
    organization_id: input.organizationId,
    booking_id: input.bookingId,
    transaction_id: `EXT-${input.bookingId}-${nowMs}`,
    guest_name: String(input.guestName || '').trim() || 'Guest',
    room: input.roomNumber ? String(input.roomNumber) : null,
    amount,
    payment_method: method,
    status: 'paid',
    description: `Extended Stay — ${nights} night${nights !== 1 ? 's' : ''} (discounted)`,
    received_by: input.userId,
  }
}
