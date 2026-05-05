/**
 * Matches guest account / enriched booking balance logic:
 * unpaid positive folio charges (excluding payment rows),
 * counting city_ledger payment_method rows that are still outstanding.
 */

export type FolioLineForBalance = {
  amount?: unknown
  type?: string | null
  charge_type?: string | null
  paymentStatus?: string | null
  payment_status?: string | null
  paymentMethod?: string | null
  payment_method?: string | null
}

export function folioPositiveOutstandingSum(charges: FolioLineForBalance[]): number {
  return charges.reduce((sum, raw) => {
    const ctype = String(raw.type ?? raw.charge_type ?? '')
    if (ctype === 'payment') return sum

    const amt = Number(raw.amount ?? 0)
    if (amt <= 0) return sum

    const status = String(raw.paymentStatus ?? raw.payment_status ?? '').toLowerCase()
    if (status === 'posted_to_ledger') return sum
    const method = String(raw.paymentMethod ?? raw.payment_method ?? '').toLowerCase()

    const isUnpaid =
      ['pending', 'unpaid', 'city_ledger'].includes(status) ||
      (method === 'city_ledger' && status !== 'paid')

    return isUnpaid ? sum + amt : sum
  }, 0)
}

/** Bill Balance (Unpaid) for the payment summary card — never below folio-vs-booking max (accounts/[id]). */
export function bookingDisplayBillBalance(
  booking:
    | {
        total_amount?: unknown
        deposit?: unknown
        balance?: unknown
        payment_status?: string | null
      }
    | null
    | undefined,
  folioCharges: FolioLineForBalance[],
): number {
  const fromFolio = folioPositiveOutstandingSum(folioCharges ?? [])
  if (!booking) return Math.max(0, fromFolio)
  const bookingBal = Number(booking.balance ?? 0)
  const fallbackOwed = Math.max(0, Number(booking.total_amount ?? 0) - Number(booking.deposit ?? 0))
  return Math.max(fromFolio, bookingBal, fallbackOwed)
}
