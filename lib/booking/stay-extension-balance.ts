/**
 * Stored outstanding, or room total − deposit when balance was never written.
 * An explicit 0 stays 0 so a cleared folio is not rebuilt from stale totals.
 */
export function outstandingBeforeStayExtension(
  balance: unknown,
  total: number,
  deposit: number,
): number {
  if (balance == null || balance === '') {
    return roundMoney(Math.max(0, finiteNumber(total) - finiteNumber(deposit)))
  }
  const n = Number(balance)
  if (!Number.isFinite(n)) {
    return roundMoney(Math.max(0, finiteNumber(total) - finiteNumber(deposit)))
  }
  return n
}

/**
 * Outstanding after an extension changes the room total and the deposit.
 *
 * `bookings.balance` is the amount still owed, including unpaid extras
 * (minibar, deferred add-charge, restaurant room charge) on top of
 * room total − deposit. A cash/POS/transfer extension adds the same
 * amount to both total and deposit, so that outstanding must stay.
 * Replacing it with total − deposit drops the extras: the bookings list
 * and Payments screen then show nothing left to collect.
 *
 * A city-ledger extension adds the night to the total only, so the
 * outstanding grows by that charge.
 */
export function balanceAfterStayExtension(input: {
  previousBalance: number
  addedToTotal: number
  addedToDeposit: number
}): number {
  const previousBalance = finiteNumber(input.previousBalance)
  const addedToTotal = finiteNumber(input.addedToTotal)
  const addedToDeposit = finiteNumber(input.addedToDeposit)
  return roundMoney(previousBalance + addedToTotal - addedToDeposit)
}

function finiteNumber(value: number): number {
  const n = Number(value)
  return Number.isFinite(n) ? n : 0
}

function roundMoney(n: number): number {
  return Math.round(n * 100) / 100
}
