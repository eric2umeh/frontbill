/** Round to kobo. */
export function roundLedgerMoney(n: number): number {
  return Math.round(n * 100) / 100
}

/**
 * City-ledger balance is signed: positive means the account owes the hotel,
 * negative is prepaid credit. Reversing a posted charge subtracts that charge.
 * Clamping at zero deletes credit when the account was prepaid or already paid.
 */
export function cityLedgerBalanceAfterChargeReversal(
  current: number,
  chargeAmount: number,
): number {
  const balance = Number(current)
  const charge = Number(chargeAmount)
  return roundLedgerMoney((Number.isFinite(balance) ? balance : 0) - (Number.isFinite(charge) ? charge : 0))
}
