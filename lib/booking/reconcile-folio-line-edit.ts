import type { FolioLineForBalance } from "@/lib/utils/booking-bill-balance";

export type FolioLineForEdit = FolioLineForBalance & {
  id?: string | null;
};

export type BookingMoneyAfterFolioEdit = {
  deposit: number;
  balance: number;
  payment_status: "paid" | "partial" | "pending";
  /** Remaining positive charges must be pending so Bill Balance shows the debt. */
  reopenPositiveCharges: boolean;
  /** Remaining positive charges are fully covered and should be marked paid. */
  settlePositiveCharges: boolean;
  /** Payment line amount changed — update the matching Daily book PAY-* row. */
  updateMatchingPaymentTransaction: boolean;
  previousPaymentAmount: number;
  nextPaymentAmount: number;
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
  return String(raw.type ?? raw.charge_type ?? "")
    .trim()
    .toLowerCase();
}

export function isEditedFolioPaymentLine(raw: FolioLineForBalance): boolean {
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
  if (isEditedFolioPaymentLine(raw)) return false;
  if (isPostedToLedger(raw)) return false;
  return true;
}

function paidPaymentTotal(charges: FolioLineForBalance[]): number {
  let total = 0;
  for (const raw of charges) {
    if (!isEditedFolioPaymentLine(raw)) continue;
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
 * After a folio row amount is edited, recompute deposit / balance / payment_status.
 *
 * `handleUpdateCharge` previously summed only `payment_status !== "paid"` rows.
 * Payment lines and fully-settled room charges are stored as paid, so raising a
 * room rate or lowering a Payment Received line left Bill Balance at ₦0 and
 * checkout collected nothing extra.
 */
export function reconcileBookingAfterEditedFolioLine(args: {
  previous: FolioLineForBalance;
  nextAmount: number;
  remaining: FolioLineForBalance[];
}): BookingMoneyAfterFolioEdit {
  const previousIsPayment = isEditedFolioPaymentLine(args.previous);
  const previousAmt = roundMoney(Math.abs(Number(args.previous.amount ?? 0)));
  const previousMethod = lineMethod(args.previous);
  const nextAmt = roundMoney(Math.abs(Number(args.nextAmount) || 0));

  const charges = collectablePositiveTotal(args.remaining);
  const payments = paidPaymentTotal(args.remaining);
  const balance = roundMoney(Math.max(0, charges - payments));
  const deposit = payments;

  let payment_status: BookingMoneyAfterFolioEdit["payment_status"] = "pending";
  if (balance <= 0.005) payment_status = "paid";
  else if (deposit > 0.005) payment_status = "partial";

  const paymentAmountChanged =
    previousIsPayment && Math.abs(nextAmt - previousAmt) > 0.009;

  return {
    deposit,
    balance,
    payment_status,
    reopenPositiveCharges: balance > 0.005,
    settlePositiveCharges: balance <= 0.005 && charges > 0.005,
    updateMatchingPaymentTransaction:
      paymentAmountChanged && previousMethod !== "cashback",
    previousPaymentAmount: previousIsPayment ? previousAmt : 0,
    nextPaymentAmount: previousIsPayment ? nextAmt : 0,
  };
}

export function reopenPositiveChargeIds(remaining: FolioLineForEdit[]): string[] {
  const ids: string[] = [];
  for (const row of remaining) {
    if (!isCollectablePositiveCharge(row)) continue;
    const id = String(row.id ?? "").trim();
    if (id) ids.push(id);
  }
  return ids;
}

export function settlePositiveChargeIds(remaining: FolioLineForEdit[]): string[] {
  return reopenPositiveChargeIds(remaining);
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
