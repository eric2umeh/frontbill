/**
 * Room sold to a city-ledger account at check-in / new booking.
 *
 * The receivable lives on `city_ledger_accounts`. The guest folio must not
 * stay unpaid, or Bill Balance / Record Payment collects the room charge
 * again after the organization is billed (or after that account is settled).
 *
 * `posted_to_ledger` is excluded from folio outstanding. Script 023 used the
 * same status and zeroed `bookings.balance` for organization bills.
 */
export function cityLedgerStayPosting(roomTotal: number): {
  deposit: number
  balance: number
  paymentStatus: 'city_ledger'
  folioPaymentStatus: 'posted_to_ledger'
  /** No cash was received, so do not insert a payments row. */
  recordPaymentRow: false
  ledgerAmount: number
} {
  const ledgerAmount = Math.max(0, Number(roomTotal) || 0)
  return {
    deposit: 0,
    balance: 0,
    paymentStatus: 'city_ledger',
    folioPaymentStatus: 'posted_to_ledger',
    recordPaymentRow: false,
    ledgerAmount,
  }
}
