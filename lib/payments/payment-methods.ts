/** Standard guest-facing payment methods (no cheque / other). */
export const STANDARD_PAYMENT_METHODS = ['pos', 'cash', 'transfer'] as const

export type StandardPaymentMethod = (typeof STANDARD_PAYMENT_METHODS)[number]

/** Folio / outlet settlement — includes city ledger (cashback posts as folio discount lines, not a select option). */
export const GUEST_SETTLEMENT_PAYMENT_METHODS = [
  'cash',
  'pos',
  'transfer',
  'city_ledger',
  'cashback',
] as const

export type GuestSettlementPaymentMethod =
  (typeof GUEST_SETTLEMENT_PAYMENT_METHODS)[number]

/** Default across POS, bookings, expenses, and payment forms. */
export const DEFAULT_PAYMENT_METHOD: StandardPaymentMethod = 'pos'

export const PAYMENT_METHOD_SELECT_OPTIONS: { value: StandardPaymentMethod; label: string }[] = [
  { value: 'pos', label: 'POS' },
  { value: 'cash', label: 'Cash' },
  { value: 'transfer', label: 'Transfer' },
]

export const GUEST_SETTLEMENT_PAYMENT_OPTIONS: {
  value: GuestSettlementPaymentMethod
  label: string
}[] = [
  { value: 'cash', label: 'Cash' },
  { value: 'pos', label: 'POS' },
  { value: 'transfer', label: 'Transfer' },
  { value: 'city_ledger', label: 'City Ledger' },
]

/** Operating expense API + forms (same set as standard). */
export const EXPENSE_PAYMENT_METHODS = [...STANDARD_PAYMENT_METHODS] as const

export function formatPaymentMethodLabel(method: string | null | undefined): string {
  const m = String(method || '')
    .trim()
    .toLowerCase()
    .replace(/-/g, '_')
  if (m === 'card') return 'POS'
  if (m === 'bank_transfer') return 'Transfer'
  const found = PAYMENT_METHOD_SELECT_OPTIONS.find((o) => o.value === m)
  if (found) return found.label
  if (m === 'pending') return 'Pending (hold date, no payment)'
  if (m === 'complimentary') return 'Complimentary'
  if (m === 'city_ledger' || m === 'room_charge') return 'City ledger'
  if (m === 'cashback') return 'Cashback discount'
  if (!m) return '—'
  return m
    .split(/[\s_]+/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ')
}
