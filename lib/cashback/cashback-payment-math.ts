/**
 * Cashback is an automatic discount — guest still pays via cash / POS / transfer only.
 */

export function computeCashbackDiscount(input: {
  totalDue: number;
  cashbackBalance: number;
  /** Cash/POS/transfer amount guest is paying now (after discount). */
  cashPaying?: number;
  applyCashback?: boolean;
}): {
  cashbackDiscount: number;
  dueAfterDiscount: number;
  cashToCollect: number;
  balanceRemaining: number;
} {
  const totalDue = Math.max(0, Number(input.totalDue) || 0);
  const balance = Math.max(0, Number(input.cashbackBalance) || 0);
  const apply = input.applyCashback === true;

  const cashbackDiscount =
    apply && balance > 0 ? Math.min(balance, totalDue) : 0;
  const dueAfterDiscount = Math.max(0, totalDue - cashbackDiscount);

  const cashPaying =
    input.cashPaying != null && Number.isFinite(Number(input.cashPaying))
      ? Math.max(0, Number(input.cashPaying))
      : dueAfterDiscount;

  const cashToCollect = Math.min(cashPaying, dueAfterDiscount);
  const balanceRemaining = Math.max(0, dueAfterDiscount - cashToCollect);

  return {
    cashbackDiscount,
    dueAfterDiscount,
    cashToCollect,
    balanceRemaining,
  };
}

/** @deprecated Use computeCashbackDiscount — cashback is a discount, not a payment method. */
export function computeCashbackRedemption(input: {
  paymentMethod: string;
  totalDue: number;
  amountPaying: number;
  cashbackBalance: number;
  applyCashback?: boolean;
}) {
  const d = computeCashbackDiscount({
    totalDue: input.totalDue,
    cashbackBalance: input.cashbackBalance,
    cashPaying: input.amountPaying,
    applyCashback: input.applyCashback,
  });
  return {
    cashbackApplied: d.cashbackDiscount,
    guestPaysNow: d.cashToCollect,
    balanceRemaining: d.balanceRemaining,
  };
}
