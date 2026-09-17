export const OUTLET_SETTLEMENT_CASHBACK_SOURCE = "outlet_settlement";

export function cashbackVoidSourceType(earnSourceType: string): string {
  return `${earnSourceType}_void`;
}

export type CashbackEarnRow = {
  guest_id?: string | null;
  amount?: number | null;
};

function roundMoney(n: number): number {
  return Math.round(n * 100) / 100;
}

/** Sum earn rows per guest so a void claws back one total per balance row. */
export function groupEarnAmountsByGuest(
  earns: CashbackEarnRow[],
): { guestId: string; amount: number }[] {
  const byGuest = new Map<string, number>();
  for (const row of earns) {
    const guestId = String(row.guest_id || "").trim();
    const amount = roundMoney(Number(row.amount) || 0);
    if (!guestId || amount <= 0) continue;
    byGuest.set(guestId, roundMoney((byGuest.get(guestId) || 0) + amount));
  }
  return [...byGuest.entries()].map(([guestId, amount]) => ({ guestId, amount }));
}

export function shouldReverseCashbackEarns(opts: {
  earnCount: number;
  alreadyReversed: boolean;
}): boolean {
  return opts.earnCount > 0 && !opts.alreadyReversed;
}

/**
 * Undo an earn: drop earned_total and spendable balance.
 * Floor at 0 if the guest already redeemed part of the award.
 */
export function nextCashbackTotalsAfterEarnVoid(
  current: { earned: number; balance: number },
  earnAmount: number,
): { earnedTotal: number; balance: number } {
  const amount = roundMoney(Number(earnAmount) || 0);
  if (amount <= 0) {
    return {
      earnedTotal: roundMoney(current.earned),
      balance: roundMoney(current.balance),
    };
  }
  return {
    earnedTotal: Math.max(0, roundMoney(current.earned - amount)),
    balance: Math.max(0, roundMoney(current.balance - amount)),
  };
}
