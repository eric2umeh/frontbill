import type { FolioLineForBalance } from "@/lib/utils/booking-bill-balance";

export type FolioLineForDelete = FolioLineForBalance & {
  id?: string | null;
};

export type BookingMoneyAfterFolioDelete = {
  deposit: number;
  balance: number;
  payment_status: "paid" | "partial" | "pending";
  /** Remaining positive charges must be reopened so folio math shows the debt. */
  reopenPositiveCharges: boolean;
  /** Void a matching Daily book PAY-* row when a cash/POS/transfer payment line was removed. */
  voidMatchingPaymentTransaction: boolean;
  removedPaymentAmount: number;
};

function roundMoney(n: number): number {
  return Math.round(n * 100) / 100;
}

function lineStatus(raw: FolioLineForBalance): string {
  return String(raw.paymentStatus ?? raw.payment_status ?? "").toLowerCase();
}

function lineMethod(raw: FolioLineForBalance): string {
  return String(raw.paymentMethod ?? raw.payment_method ?? "").toLowerCase();
}

function lineType(raw: FolioLineForBalance): string {
  return String(raw.type ?? raw.charge_type ?? "").trim().toLowerCase();
}

export function isRemovedFolioPaymentLine(raw: FolioLineForBalance): boolean {
  const amt = Number(raw.amount ?? 0);
  if (lineType(raw) === "payment") return true;
  return amt < 0;
}

function isPostedToLedger(raw: FolioLineForBalance): boolean {
  return lineStatus(raw) === "posted_to_ledger";
}

function isCollectablePositiveCharge(raw: FolioLineForBalance): boolean {
  const amt = Number(raw.amount ?? 0);
  if (amt <= 0) return false;
  if (isRemovedFolioPaymentLine(raw)) return false;
  if (isPostedToLedger(raw)) return false;
  return true;
}

function paidPaymentTotal(charges: FolioLineForBalance[]): number {
  let total = 0;
  for (const raw of charges) {
    if (!isRemovedFolioPaymentLine(raw)) continue;
    const status = lineStatus(raw);
    if (status === "paid" || status === "posted_to_ledger") {
      total += Math.abs(Number(raw.amount ?? 0));
    }
  }
  return roundMoney(total);
}

function collectablePositiveTotal(charges: FolioLineForBalance[]): number {
  let total = 0;
  for (const raw of charges) {
    if (!isCollectablePositiveCharge(raw)) continue;
    total += Number(raw.amount ?? 0);
  }
  return roundMoney(total);
}

/**
 * After a folio row is deleted, recompute deposit / balance / payment_status.
 *
 * Payment lines (negative / charge_type=payment) previously skipped the booking
 * money update because they are stored as payment_status=paid. That left the
 * stay marked paid with deposit still counted, so checkout and Record Payment
 * could skip or double-collect.
 */
export function reconcileBookingAfterRemovedFolioLine(args: {
  deposit: number;
  removed: FolioLineForBalance;
  remaining: FolioLineForBalance[];
}): BookingMoneyAfterFolioDelete {
  const removedIsPayment = isRemovedFolioPaymentLine(args.removed);
  const removedAmt = roundMoney(Math.abs(Number(args.removed.amount ?? 0)));
  const removedMethod = lineMethod(args.removed);

  let deposit = roundMoney(Math.max(0, Number(args.deposit) || 0));
  if (removedIsPayment) {
    deposit = roundMoney(Math.max(0, deposit - removedAmt));
  }

  const charges = collectablePositiveTotal(args.remaining);
  const payments = paidPaymentTotal(args.remaining);
  const balance = roundMoney(Math.max(0, charges - payments));

  let payment_status: BookingMoneyAfterFolioDelete["payment_status"] = "pending";
  if (balance <= 0.005) payment_status = "paid";
  else if (deposit > 0.005 || payments > 0.005) payment_status = "partial";

  return {
    deposit,
    balance,
    payment_status,
    reopenPositiveCharges: balance > 0.005,
    voidMatchingPaymentTransaction:
      removedIsPayment && removedAmt > 0.005 && removedMethod !== "cashback",
    removedPaymentAmount: removedIsPayment ? removedAmt : 0,
  };
}

export function reopenPositiveChargeIds(
  remaining: FolioLineForDelete[],
): string[] {
  const ids: string[] = [];
  for (const row of remaining) {
    if (!isCollectablePositiveCharge(row)) continue;
    const id = String(row.id ?? "").trim();
    if (id) ids.push(id);
  }
  return ids;
}

export function pickMatchingPaymentTransaction(
  rows: Array<{
    id?: unknown;
    amount?: unknown;
    description?: string | null;
    transaction_id?: string | null;
    status?: string | null;
  }>,
  paymentAmount: number,
): { id: string } | null {
  const want = roundMoney(paymentAmount);
  if (want <= 0.005) return null;
  for (const row of rows) {
    const st = String(row.status || "").toLowerCase();
    if (st === "void" || st === "cancelled") continue;
    const amt = roundMoney(Number(row.amount) || 0);
    if (Math.abs(amt - want) > 0.009) continue;
    const desc = String(row.description || "").toLowerCase();
    const tid = String(row.transaction_id || "");
    if (!desc.includes("payment received") && !tid.startsWith("PAY-")) continue;
    const id = String(row.id ?? "").trim();
    if (id) return { id };
  }
  return null;
}
