/**
 * Matches guest account / enriched booking balance logic:
 * unpaid positive folio charges minus recorded payment rows,
 * counting city_ledger payment_method rows that are still outstanding.
 */

export type FolioLineForBalance = {
  amount?: unknown;
  type?: string | null;
  charge_type?: string | null;
  paymentStatus?: string | null;
  payment_status?: string | null;
  paymentMethod?: string | null;
  payment_method?: string | null;
};

function isFolioPaymentLine(ctype: string, amt: number): boolean {
  if (ctype.toLowerCase() === "payment") return true;
  return amt < 0;
}

function isPositiveChargeUnpaid(
  status: string,
  method: string,
  amt: number,
): boolean {
  if (amt <= 0) return false;
  if (status === "posted_to_ledger") return false;
  return (
    ["pending", "unpaid", "city_ledger", "partial"].includes(status) ||
    (method === "city_ledger" && status !== "paid") ||
    (status === "" && amt > 0)
  );
}

type FolioBalanceParts = {
  totalPositiveCharges: number;
  unpaidPositiveCharges: number;
  totalPayments: number;
};

function summarizeFolioBalance(
  charges: FolioLineForBalance[],
): FolioBalanceParts {
  let totalPositiveCharges = 0;
  let unpaidPositiveCharges = 0;
  let totalPayments = 0;

  for (const raw of charges) {
    const ctype = String(raw.type ?? raw.charge_type ?? "").trim();
    const amt = Number(raw.amount ?? 0);
    const status = String(
      raw.paymentStatus ?? raw.payment_status ?? "",
    ).toLowerCase();
    const method = String(
      raw.paymentMethod ?? raw.payment_method ?? "",
    ).toLowerCase();

    if (isFolioPaymentLine(ctype, amt)) {
      if (status === "paid" || status === "posted_to_ledger") {
        totalPayments += Math.abs(amt);
      }
      continue;
    }

    if (amt <= 0) continue;
    totalPositiveCharges += amt;
    if (isPositiveChargeUnpaid(status, method, amt)) {
      unpaidPositiveCharges += amt;
    }
  }

  return { totalPositiveCharges, unpaidPositiveCharges, totalPayments };
}

/** Amount the guest still owes on this folio (never negative). */
export function folioPositiveOutstandingSum(
  charges: FolioLineForBalance[],
): number {
  const { unpaidPositiveCharges, totalPayments } =
    summarizeFolioBalance(charges);
  return Math.max(0, unpaidPositiveCharges - totalPayments);
}

/** Bill Balance (Unpaid) for the payment summary card.
 * When folio lines exist, folio outstanding is the source of truth — do not inflate
 * with a stale `total_amount − deposit` (common after city-ledger extensions).
 */
export function bookingDisplayBillBalance(
  booking:
    | {
        total_amount?: unknown;
        deposit?: unknown;
        balance?: unknown;
        payment_status?: string | null;
      }
    | null
    | undefined,
  folioCharges: FolioLineForBalance[],
): number {
  const fromFolio = folioPositiveOutstandingSum(folioCharges ?? []);
  if ((folioCharges?.length ?? 0) > 0) {
    return fromFolio;
  }
  if (!booking) return fromFolio;
  const bookingBal = Math.max(0, Number(booking.balance ?? 0));
  const fallbackOwed = Math.max(
    0,
    Number(booking.total_amount ?? 0) - Number(booking.deposit ?? 0),
  );
  return Math.max(bookingBal, fallbackOwed);
}

/** True when the same rules as the folio “Bill balance” show nothing left to collect — DB `payment_status` should usually be `paid`. */
export function billIsFullySettled(
  booking: Parameters<typeof bookingDisplayBillBalance>[0],
  charges: FolioLineForBalance[],
): boolean {
  return folioPositiveOutstandingSum(charges ?? []) <= 0;
}

/** True overpayment on folio (guest prepaid more than total charges). */
export function folioGuestCreditAmount(charges: FolioLineForBalance[]): number {
  const { totalPositiveCharges, totalPayments } =
    summarizeFolioBalance(charges);
  return Math.max(0, totalPayments - totalPositiveCharges);
}

/**
 * When to PATCH `bookings.payment_status` to `paid`: full bill math says settled, or booking balance and
 * folio outstanding are both clear even if `total_amount`/`deposit` are stale (avoids stuck “pending” on lists).
 */
export function shouldReconcileBookingPaymentPaid(
  booking: Parameters<typeof bookingDisplayBillBalance>[0],
  folioCharges: FolioLineForBalance[],
): boolean {
  if (String(booking?.payment_status ?? "").toLowerCase() === "paid")
    return false;
  return folioPositiveOutstandingSum(folioCharges ?? []) <= 0;
}

/**
 * After `sync-outlet-folio`, the first paint's charge list is stale.
 * Heal `payment_status` only from post-sync rows; if backfill ran but reload
 * failed, skip the paid heal so we cannot mark a folio paid while restaurant
 * lines were just posted.
 */
export function folioChargesForPaidHeal<T>(
  initialCharges: T[],
  refreshedCharges: T[] | null,
  outletSyncRan: boolean,
): { charges: T[]; allowPaidHeal: boolean } {
  if (!outletSyncRan) {
    return { charges: initialCharges, allowPaidHeal: true };
  }
  if (!Array.isArray(refreshedCharges)) {
    return { charges: initialCharges, allowPaidHeal: false };
  }
  return { charges: refreshedCharges, allowPaidHeal: true };
}
