/** Hold a date without collecting payment (guest may not attend). */
export const EVENT_PAYMENT_METHOD_PENDING = 'pending' as const

export const EVENT_PAYMENT_METHOD_OPTIONS = [
  { value: 'pos', label: 'POS' },
  { value: 'cash', label: 'Cash' },
  { value: 'transfer', label: 'Transfer' },
  { value: 'card', label: 'Card' },
  { value: EVENT_PAYMENT_METHOD_PENDING, label: 'Pending (hold date, no payment)' },
] as const

export function isEventPendingHold(method: string | null | undefined): boolean {
  return String(method || '').trim().toLowerCase() === EVENT_PAYMENT_METHOD_PENDING
}

export function formatEventPaymentMethodLabel(method: string | null | undefined): string {
  const m = String(method || '').trim().toLowerCase()
  const found = EVENT_PAYMENT_METHOD_OPTIONS.find((o) => o.value === m)
  if (found) return found.label
  if (!m) return '—'
  return m.replace(/_/g, ' ')
}
