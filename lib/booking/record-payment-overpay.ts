/**
 * Split a folio "Record Payment" amount into bill application vs prepaid credit.
 *
 * `computeCashbackDiscount` caps `cashToCollect` at the remaining bill. The
 * Record Payment checkbox promises any cash above that bill becomes city-ledger
 * (and folio) prepaid credit — callers must use `ledgerPaymentAmount` and
 * `transactionAmount`, not the capped collect amount.
 */

export function recordPaymentApplication(input: {
  cashEntered: number;
  cashbackDiscount: number;
  dueAfterDiscount: number;
  applyOverpaymentAsCredit: boolean;
}): {
  cashToCollect: number;
  totalAppliedToBill: number;
  excessCredit: number;
  ledgerPaymentAmount: number;
  transactionAmount: number;
} {
  const cashEntered = Math.max(0, Number(input.cashEntered) || 0);
  const cashbackDiscount = Math.max(0, Number(input.cashbackDiscount) || 0);
  const dueAfterDiscount = Math.max(0, Number(input.dueAfterDiscount) || 0);
  const cashToCollect = Math.min(cashEntered, dueAfterDiscount);
  const totalAppliedToBill = cashbackDiscount + cashToCollect;
  const excessCredit = input.applyOverpaymentAsCredit
    ? Math.max(0, cashEntered - dueAfterDiscount)
    : 0;

  return {
    cashToCollect,
    totalAppliedToBill,
    excessCredit,
    ledgerPaymentAmount: totalAppliedToBill + excessCredit,
    transactionAmount: cashToCollect + excessCredit,
  };
}
