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

function isPositiveChargeUnpaid(
  status: string,
  method: string,
  amt: number,
): boolean {
  if (amt <= 0) return false
  if (status === 'posted_to_ledger') return false
  return (
    ['pending', 'unpaid', 'city_ledger', 'partial'].includes(status) ||
    (method === 'city_ledger' && status !== 'paid') ||
    (status === '' && amt > 0)
  )
}

type FolioBalanceParts = {
  totalPositiveCharges: number
  unpaidPositiveCharges: number
  totalPayments: number
}

function summarizeFolioBalance(charges: FolioLineForBalance[]): FolioBalanceParts {
  let totalPositiveCharges = 0
  let unpaidPositiveCharges = 0
  let totalPayments = 0

  for (const raw of charges) {
    const ctype = String(raw.type ?? raw.charge_type ?? '').trim()
    const amt = Number(raw.amount ?? 0)
    const status = String(raw.paymentStatus ?? raw.payment_status ?? '').toLowerCase()
    const method = String(raw.paymentMethod ?? raw.payment_method ?? '').toLowerCase()

    if (isFolioPaymentLine(ctype, amt)) {
      if (status === 'paid' || status === 'posted_to_ledger') {
        totalPayments += Math.abs(amt)
      }
      continue
    }

    if (amt <= 0) continue
    totalPositiveCharges += amt
    if (isPositiveChargeUnpaid(status, method, amt)) {
      unpaidPositiveCharges += amt
    }
  }

  return { totalPositiveCharges, unpaidPositiveCharges, totalPayments }
}

/** Amount the guest still owes on this folio (never negative). */
export function folioPositiveOutstandingSum(charges: FolioLineForBalance[]): number {
  const { unpaidPositiveCharges, totalPayments } = summarizeFolioBalance(charges)
  return Math.max(0, unpaidPositiveCharges - totalPayments)
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
  if (!booking) return fromFolio
  const bookingBal = Math.max(0, Number(booking.balance ?? 0))
  const fallbackOwed = Math.max(
    0,
    Number(booking.total_amount ?? 0) - Number(booking.deposit ?? 0),
  )
  return Math.max(fromFolio, bookingBal, fallbackOwed)
}

/** True when the same rules as the folio “Bill balance” show nothing left to collect — DB `payment_status` should usually be `paid`. */
export function billIsFullySettled(
  booking: Parameters<typeof bookingDisplayBillBalance>[0],
  charges: FolioLineForBalance[],
): boolean {
  return folioPositiveOutstandingSum(charges ?? []) <= 0
}

/** True overpayment on folio (guest prepaid more than total charges). */
export function folioGuestCreditAmount(charges: FolioLineForBalance[]): number {
  const { totalPositiveCharges, totalPayments } = summarizeFolioBalance(charges)
  return Math.max(0, totalPayments - totalPositiveCharges)
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
  return folioPositiveOutstandingSum(folioCharges ?? []) <= 0
}
