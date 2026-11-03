import { computeCashbackDiscount } from "@/lib/cashback/cashback-payment-math";

function roundMoney(n: number): number {
  return Math.round((Number(n) || 0) * 100) / 100;
}

export type RoomPrepaySplit = {
  cashbackDiscount: number;
  dueAfterDiscount: number;
  /** Cash/POS/transfer applied to this stay (never above the discounted bill). */
  cashTowardBill: number;
  /** Tendered cash above the discounted bill. Stored as city-ledger credit. */
  excessCredit: number;
  /** Physical cash/POS/transfer to write on payments and transactions. */
  cashDrawer: number;
  /** Stay deposit: discount plus cash applied to the bill. Excludes credit. */
  depositApplied: number;
  balanceRemaining: number;
};

/**
 * Split a new stay's tender into bill, drawer, and prepaid credit.
 * `computeCashbackDiscount` caps cash at the amount due, so excess must be
 * taken from the tendered amount before that cap or it is never posted.
 */
export function splitRoomPrepay(input: {
  roomTotal: number;
  cashTendered: number;
  cashbackBalance?: number;
  applyCashback?: boolean;
  payAboveRoomTotal?: boolean;
}): RoomPrepaySplit {
  const roomTotal = roundMoney(Math.max(0, Number(input.roomTotal) || 0));
  const cashTendered = roundMoney(Math.max(0, Number(input.cashTendered) || 0));
  const payAbove = input.payAboveRoomTotal === true;

  const breakdown = computeCashbackDiscount({
    totalDue: roomTotal,
    cashbackBalance: input.cashbackBalance ?? 0,
    cashPaying: cashTendered,
    applyCashback: input.applyCashback === true,
  });

  const cashbackDiscount = roundMoney(breakdown.cashbackDiscount);
  const dueAfterDiscount = roundMoney(breakdown.dueAfterDiscount);
  const cashTowardBill = roundMoney(breakdown.cashToCollect);
  const excessCredit = payAbove
    ? roundMoney(Math.max(0, cashTendered - dueAfterDiscount))
    : 0;
  const cashDrawer = roundMoney(cashTowardBill + excessCredit);
  const depositApplied = roundMoney(cashbackDiscount + cashTowardBill);
  const balanceRemaining = roundMoney(breakdown.balanceRemaining);

  return {
    cashbackDiscount,
    dueAfterDiscount,
    cashTowardBill,
    excessCredit,
    cashDrawer,
    depositApplied,
    balanceRemaining,
  };
}
