export const CASHBACK_EARN_SOURCE_TYPES = new Set([
  "booking_payment",
  "reservation_payment",
  "bulk_booking_payment",
  "folio_payment",
]);

export type CashbackEarnFolioRow = {
  amount?: number | string | null;
  charge_type?: string | null;
  payment_method?: string | null;
};

export type CashbackEarnTransactionRow = {
  amount?: number | string | null;
  earn_rate_percent?: number | string | null;
};

function normalizePaymentMethod(value: string | null | undefined) {
  return String(value || "").trim().toLowerCase();
}

export function isSupportedCashbackEarnSourceType(sourceType: string) {
  return CASHBACK_EARN_SOURCE_TYPES.has(sourceType.trim());
}

export function eligibleCashbackPaymentBaseFromFolioRows(
  rows: CashbackEarnFolioRow[],
  paymentMethod: string,
) {
  const method = normalizePaymentMethod(paymentMethod);
  if (!method || method === "cashback") return 0;

  return rows.reduce((sum, row) => {
    const chargeType = String(row.charge_type || "").trim().toLowerCase();
    const rowMethod = normalizePaymentMethod(row.payment_method);
    const amount = Number(row.amount);

    if (chargeType !== "payment") return sum;
    if (rowMethod !== method || rowMethod === "cashback") return sum;
    if (!Number.isFinite(amount) || amount >= 0) return sum;

    return sum + Math.abs(amount);
  }, 0);
}

export function earnedPaymentBaseFromCashbackTransactions(
  rows: CashbackEarnTransactionRow[],
) {
  let total = 0;
  for (const row of rows) {
    const earned = Number(row.amount);
    const ratePercent = Number(row.earn_rate_percent);

    if (!Number.isFinite(earned) || earned <= 0) continue;
    if (!Number.isFinite(ratePercent) || ratePercent <= 0) {
      return Number.POSITIVE_INFINITY;
    }

    total += earned / (ratePercent / 100);
  }

  return total;
}

export function remainingCashbackEarnPaymentBase(input: {
  folioRows: CashbackEarnFolioRow[];
  cashbackTransactions: CashbackEarnTransactionRow[];
  paymentMethod: string;
}) {
  const eligiblePaid = eligibleCashbackPaymentBaseFromFolioRows(
    input.folioRows,
    input.paymentMethod,
  );
  const alreadyEarnedBase = earnedPaymentBaseFromCashbackTransactions(
    input.cashbackTransactions,
  );

  if (!Number.isFinite(alreadyEarnedBase)) return 0;
  return Math.max(0, eligiblePaid - alreadyEarnedBase);
}
