import {
  folioGuestCreditAmount,
  folioPositiveOutstandingSum,
  type FolioLineForBalance,
} from "@/lib/utils/booking-bill-balance";

function roundMoney(n: number): number {
  return Math.round(n * 100) / 100;
}

export type RefundBookingCandidate = {
  id: string;
  checkIn: string;
  /** Unpaid folio amount still collected at checkout. */
  outstanding: number;
  /** Room or extras were posted to city ledger, so the folio no longer shows them as due. */
  postedToLedger: boolean;
};

export type GuestRefundCreditPlan =
  | { action: "folio"; bookingId: string }
  | { action: "ledger" }
  | { action: "none" };

function latestBooking(bookings: RefundBookingCandidate[]): RefundBookingCandidate | null {
  if (!bookings.length) return null;
  return [...bookings].sort((a, b) => {
    if (a.checkIn !== b.checkIn) return a.checkIn < b.checkIn ? 1 : -1;
    return a.id < b.id ? 1 : -1;
  })[0];
}

function highestOutstanding(bookings: RefundBookingCandidate[]): RefundBookingCandidate | null {
  const open = bookings.filter((b) => b.outstanding > 0.005);
  if (!open.length) return null;
  return [...open].sort((a, b) => {
    if (Math.abs(a.outstanding - b.outstanding) > 0.005) return b.outstanding - a.outstanding;
    if (a.checkIn !== b.checkIn) return a.checkIn < b.checkIn ? 1 : -1;
    return a.id < b.id ? 1 : -1;
  })[0];
}

function ledgerHoldsThisStay(
  booking: RefundBookingCandidate | undefined,
  ledgerBalance: number | null,
): boolean {
  if (!booking) return false;
  return (
    booking.outstanding <= 0.005 &&
    booking.postedToLedger &&
    (ledgerBalance ?? 0) > 0.005
  );
}

/**
 * Where a guest refund should reduce what the hotel still collects.
 * Folio Bill Balance is the checkout number. City ledger is used only when the
 * stay was posted there and the folio no longer shows it as unpaid.
 * Deposit is never reduced — shrinking it reopens `total − deposit` on stays
 * that were already paid.
 */
export function planGuestRefundCredit(input: {
  explicitBookingId?: string | null;
  bookings: RefundBookingCandidate[];
  /** null when the guest has no city-ledger account. */
  ledgerBalance: number | null;
}): GuestRefundCreditPlan {
  const explicitId = String(input.explicitBookingId || "").trim();
  const bookings = input.bookings;
  const ledgerBalance = input.ledgerBalance;

  if (explicitId) {
    const chosen = bookings.find((b) => b.id === explicitId);
    if (ledgerHoldsThisStay(chosen, ledgerBalance)) return { action: "ledger" };
    return { action: "folio", bookingId: explicitId };
  }

  const open = highestOutstanding(bookings);
  if (open) return { action: "folio", bookingId: open.id };

  if ((ledgerBalance ?? 0) > 0.005) return { action: "ledger" };

  const latest = latestBooking(bookings);
  if (latest) return { action: "folio", bookingId: latest.id };

  if (ledgerBalance != null) return { action: "ledger" };
  return { action: "none" };
}

export function refundFolioCreditLine(refundAmount: number): FolioLineForBalance {
  return {
    amount: -roundMoney(refundAmount),
    charge_type: "payment",
    payment_status: "paid",
    payment_method: "refund",
  };
}

/** Booking balance after the refund credit line. Positive owes; negative is credit. */
export function bookingBalanceAfterRefundCredit(
  lines: FolioLineForBalance[],
  refundAmount: number,
): number {
  const withCredit = [...lines, refundFolioCreditLine(refundAmount)];
  const owed = folioPositiveOutstandingSum(withCredit);
  if (owed > 0.005) return roundMoney(owed);
  const credit = folioGuestCreditAmount(withCredit);
  if (credit > 0.005) return roundMoney(-credit);
  return 0;
}

export function ledgerBalanceAfterRefund(
  currentBalance: number,
  refundAmount: number,
): number {
  return roundMoney((Number(currentBalance) || 0) - refundAmount);
}

/**
 * Stays with no folio lines still bill `max(balance, total − deposit)`.
 * Lower both balance and total so the refund is not collected again.
 * Deposit is left unchanged: cutting it reopens a stay that was already paid.
 */
export function bookingColumnsAfterRefundWithoutFolio(input: {
  balance: number;
  totalAmount: number;
  deposit: number;
  refundAmount: number;
}): { balance: number; totalAmount: number } {
  const deposit = Number(input.deposit) || 0;
  const totalAmount = Number(input.totalAmount) || 0;
  return {
    balance: roundMoney((Number(input.balance) || 0) - input.refundAmount),
    totalAmount: roundMoney(Math.max(0, deposit, totalAmount - input.refundAmount)),
  };
}
