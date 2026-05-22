/** Standard guest-facing payment methods (no cheque / other). */
export const STANDARD_PAYMENT_METHODS = ['pos', 'cash', 'transfer', 'card'] as const

export type StandardPaymentMethod = (typeof STANDARD_PAYMENT_METHODS)[number]

/** Default across POS, bookings, expenses, and payment forms. */
export const DEFAULT_PAYMENT_METHOD: StandardPaymentMethod = 'pos'

export const PAYMENT_METHOD_SELECT_OPTIONS: { value: StandardPaymentMethod; label: string }[] = [
  { value: 'pos', label: 'POS' },
  { value: 'cash', label: 'Cash' },
  { value: 'transfer', label: 'Transfer' },
  { value: 'card', label: 'Card' },
]

/** Operating expense API + forms (same set as standard). */
export const EXPENSE_PAYMENT_METHODS = [...STANDARD_PAYMENT_METHODS] as const

export function formatPaymentMethodLabel(method: string | null | undefined): string {
  const m = String(method || '')
    .trim()
    .toLowerCase()
    .replace(/-/g, '_')
  if (m === 'bank_transfer') return 'Transfer'
  const found = PAYMENT_METHOD_SELECT_OPTIONS.find((o) => o.value === m)
  if (found) return found.label
  if (m === 'pending') return 'Pending (hold date, no payment)'
  if (m === 'complimentary') return 'Complimentary'
  if (m === 'city_ledger' || m === 'room_charge') return 'City ledger'
  if (!m) return '—'
  return m
    .split(/[\s_]+/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ')
}
