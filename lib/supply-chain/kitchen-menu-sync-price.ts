/**
 * Kitchen batch / production / count syncs must not clobber POS selling prices.
 * Incoming prices only seed new or unpriced (≤ 0) restaurant / Main Bar rows.
 */
export function kitchenMenuUnitPriceForSync(
  existingUnitPrice: number | null | undefined,
  incomingUnitPrice: number,
): number | undefined {
  const existing = Number(existingUnitPrice)
  if (Number.isFinite(existing) && existing > 0) return undefined
  const incoming = Number(incomingUnitPrice)
  if (Number.isFinite(incoming) && incoming > 0) return incoming
  return undefined
}

/**
 * Physical Finished Menu counts persist kitchen_stock only.
 * POS listing and price belong to batch save / the Menu tab.
 */
export function shouldSyncOutletMenuForKitchenStockCount(): boolean {
  return false
}
