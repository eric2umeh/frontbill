/** Hold room dates without collecting payment (guest or org may not attend). */
export const RESERVATION_PAYMENT_METHOD_PENDING = 'pending' as const

export const RESERVATION_PAYMENT_METHOD_OPTIONS = [
  { value: 'pos', label: 'POS' },
  { value: 'cash', label: 'Cash' },
  { value: 'transfer', label: 'Transfer' },
  { value: 'card', label: 'Card' },
  {
    value: RESERVATION_PAYMENT_METHOD_PENDING,
    label: 'Pending (hold date, no payment)',
  },
] as const

export type ReservationPaymentMethod =
  (typeof RESERVATION_PAYMENT_METHOD_OPTIONS)[number]['value']

export function isReservationPendingHold(method: string | null | undefined): boolean {
  return String(method || '').trim().toLowerCase() === RESERVATION_PAYMENT_METHOD_PENDING
}

export function formatReservationPaymentMethodLabel(method: string | null | undefined): string {
  const m = String(method || '').trim().toLowerCase()
  const found = RESERVATION_PAYMENT_METHOD_OPTIONS.find((o) => o.value === m)
  if (found) return found.label
  if (!m) return '—'
  return m.replace(/_/g, ' ')
}
