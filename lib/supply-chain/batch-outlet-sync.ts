/** Which outlet POS menu(s) a kitchen batch standard is listed on. */
export type BatchOutletMenuSync = 'none' | 'restaurant' | 'restaurant_fnb'

export function normalizeBatchOutletMenuSync(
  value: BatchOutletMenuSync | boolean | undefined | null,
): BatchOutletMenuSync {
  if (value === true) return 'restaurant_fnb'
  if (value === false || value == null) return 'none'
  if (value === 'restaurant' || value === 'restaurant_fnb' || value === 'none') return value
  return 'none'
}

export function batchOutletMenuSyncLabel(sync: BatchOutletMenuSync): string {
  if (sync === 'restaurant') return 'Restaurant outlet'
  if (sync === 'restaurant_fnb') return 'Restaurant / F&B outlet'
  return 'Not on outlet POS'
}

export function shouldSyncBatchToOutlet(sync: BatchOutletMenuSync): boolean {
  return sync === 'restaurant' || sync === 'restaurant_fnb'
}
