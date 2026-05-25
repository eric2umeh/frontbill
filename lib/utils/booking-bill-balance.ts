/**
 * Matches guest account / enriched booking balance logic:
 * unpaid positive folio charges minus recorded payment rows,
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

function isFolioPaymentLine(ctype: string, amt: number): boolean {
  if (ctype.toLowerCase() === 'payment') return true
  return amt < 0
}

export function folioPositiveOutstandingSum(charges: FolioLineForBalance[]): number {
  return charges.reduce((sum, raw) => {
    const ctype = String(raw.type ?? raw.charge_type ?? '').trim()
    const amt = Number(raw.amount ?? 0)
    const status = String(raw.paymentStatus ?? raw.payment_status ?? '').toLowerCase()
    const method = String(raw.paymentMethod ?? raw.payment_method ?? '').toLowerCase()

    // Payments (usually negative amounts) reduce net outstanding bill balance.
    if (isFolioPaymentLine(ctype, amt)) {
      if (status !== 'paid' && status !== 'posted_to_ledger') return sum
      const credit = amt < 0 ? amt : -Math.abs(amt)
      return sum + credit
    }

    if (amt <= 0) return sum
    if (status === 'posted_to_ledger') return sum

    const isUnpaid =
      ['pending', 'unpaid', 'city_ledger', 'partial'].includes(status) ||
      (method === 'city_ledger' && status !== 'paid') ||
      (status === '' && amt > 0)

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
  const fromFolioNet = folioPositiveOutstandingSum(folioCharges ?? [])
  const fromFolio = Math.max(0, fromFolioNet)
  if (!booking) return fromFolio
  const bookingBal = Number(booking.balance ?? 0)
  const fallbackOwed = Math.max(0, Number(booking.total_amount ?? 0) - Number(booking.deposit ?? 0))
  return Math.max(fromFolio, bookingBal, fallbackOwed)
}

/** True when the same rules as the folio “Bill balance” show nothing left to collect — DB `payment_status` should usually be `paid`. */
export function billIsFullySettled(
  booking: Parameters<typeof bookingDisplayBillBalance>[0],
  charges: FolioLineForBalance[],
): boolean {
  const folioOwedNet = folioPositiveOutstandingSum(charges ?? [])
  return Math.max(0, folioOwedNet) <= 0
}

/** Positive when folio nets to money in favour of guest (overage / credit within this folio). */
export function folioGuestCreditAmount(charges: FolioLineForBalance[]): number {
  const net = folioPositiveOutstandingSum(charges ?? [])
  return net < 0 ? -net : 0
}

/**
 * When to PATCH `bookings.payment_status` to `paid`: full bill math says settled, or booking balance and
 * folio outstanding are both clear even if `total_amount`/`deposit` are stale (avoids stuck “pending” on lists).
 */
export function shouldReconcileBookingPaymentPaid(
  booking: Parameters<typeof bookingDisplayBillBalance>[0],
  folioCharges: FolioLineForBalance[],
): boolean {
  if (String(booking?.payment_status ?? '').toLowerCase() === 'paid') return false
  const folioOwedNet = folioPositiveOutstandingSum(folioCharges ?? [])
  return Math.max(0, folioOwedNet) <= 0
}
