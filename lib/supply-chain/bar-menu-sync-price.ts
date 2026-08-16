/**
 * F&B Store → Main Bar menu sync often sends unitPrice 0 when the F&B row
 * has no selling price yet. That must not wipe a priced POS item (staff would
 * sell the drink at ₦0 until someone notices).
 *
 * Returns `undefined` when the patch should omit `unit_price` and keep the
 * existing menu price.
 */
export function barMenuUnitPriceForSync(
  incomingPrice: number,
  existingPrice?: number | null,
): number | undefined {
  const incoming = Number(incomingPrice)
  if (Number.isFinite(incoming) && incoming > 0) {
    return Math.round(incoming * 100) / 100
  }
  const existing = existingPrice == null ? null : Number(existingPrice)
  if (existing != null && Number.isFinite(existing) && existing > 0) {
    return undefined
  }
  return 0
}
