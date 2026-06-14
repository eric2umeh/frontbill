/** Parse `service_code` from restaurant menu rows synced from kitchen (`ks:ks-jollof`). */
export function kitchenStockIdFromServiceCode(serviceCode: string | null | undefined): string | null {
  if (!serviceCode?.startsWith('ks:')) return null
  const id = serviceCode.slice(3).trim()
  return id || null
}

export function isKitchenSyncedMenuItem(serviceCode: string | null | undefined): boolean {
  return Boolean(kitchenStockIdFromServiceCode(serviceCode))
}
