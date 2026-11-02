/**
 * Cash, POS, or transfer that should be written to `payments` and `transactions`.
 *
 * Daily book and Night Audit treat those rows as money received. Do not substitute
 * the stay total or a cashback discount when nothing was collected.
 */
export function drawerCollectionAmount(cashToCollect: number): number {
  const cash = Number(cashToCollect)
  if (!Number.isFinite(cash) || cash <= 0) return 0
  return Math.round(cash * 100) / 100
}
