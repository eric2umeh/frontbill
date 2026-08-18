/**
 * Central Store Issue Out and F&B → Main Bar menu sync are stock-link writes.
 * They must not clobber a priced POS item:
 * - Issue Out sends store `lastPrice` (purchase cost), e.g. ₦800 over ₦2500.
 * - Unpriced F&B rows send 0, which would make drinks sell at ₦0.
 *
 * Returns `undefined` when the patch should omit `unit_price`.
 */
export function barMenuUnitPriceForSync(
  incomingPrice: number,
  existingPrice?: number | null,
): number | undefined {
  const existing = existingPrice == null ? null : Number(existingPrice)
  if (existing != null && Number.isFinite(existing) && existing > 0) {
    return undefined
  }
  const incoming = Number(incomingPrice)
  if (Number.isFinite(incoming) && incoming > 0) {
    return Math.round(incoming * 100) / 100
  }
  return 0
}
