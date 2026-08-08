/**
 * Booking/check-in flows often write the same collection to both `transactions`
 * (TXN-* + room) and `payments` (no ref in UI). Prefer transactions; hide matching payments.
 */

function normMethod(method: string | null | undefined): string {
  const m = String(method || '')
    .trim()
    .toLowerCase()
    .replace(/-/g, '_')
  if (m === 'bank_transfer') return 'transfer'
  return m
}

function roundMoney(n: unknown): number {
  return Math.round((Number(n) || 0) * 100) / 100
}

export type LedgerTxLike = {
  booking_id?: string | null
  amount?: unknown
  payment_method?: string | null
  created_at?: string | null
  transaction_id?: string | null
  guest_name?: string | null
  status?: string | null
}

export type LedgerPaymentLike = {
  booking_id?: string | null
  amount?: unknown
  payment_method?: string | null
  payment_date?: string | null
  reference_number?: string | null
  notes?: string | null
  guest_id?: string | null
}

const MATCH_WINDOW_MS = 5 * 60 * 1000

/** True when this payments row is a duplicate of a visible transactions row. */
export function shouldHideBookingPaymentDuplicate(
  payment: LedgerPaymentLike,
  transactions: LedgerTxLike[],
): boolean {
  const payRef = String(payment.reference_number || '').trim()
  if (
    payRef &&
    transactions.some((t) => String(t.transaction_id || '').trim() === payRef)
  ) {
    return true
  }

  const amt = roundMoney(payment.amount)
  const method = normMethod(payment.payment_method)
  const payTime = new Date(payment.payment_date || 0).getTime()
  if (!Number.isFinite(payTime) || payTime <= 0) return false

  const bid = payment.booking_id ? String(payment.booking_id) : ''

  return transactions.some((t) => {
    const tAmt = roundMoney(t.amount)
    if (tAmt !== amt) return false
    if (normMethod(t.payment_method) !== method) return false

    const tTime = new Date(t.created_at || 0).getTime()
    if (!Number.isFinite(tTime) || Math.abs(tTime - payTime) > MATCH_WINDOW_MS) {
      return false
    }

    return Boolean(bid && t.booking_id && String(t.booking_id) === bid)
  })
}

/**
 * Filter payment rows that duplicate transactions (booking dual-write).
 * Caller should already apply outlet-specific hiding if needed.
 */
export function filterDuplicatePaymentRows<T extends LedgerPaymentLike>(
  payments: T[],
  transactions: LedgerTxLike[],
): T[] {
  return payments.filter((p) => !shouldHideBookingPaymentDuplicate(p, transactions))
}
