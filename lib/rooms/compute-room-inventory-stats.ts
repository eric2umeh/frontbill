export type RoomInventoryStats = {
  total: number
  available: number
  occupied: number
  outOfOrder: number
}

function normStatus(s: string | null | undefined): string {
  return String(s || '').toLowerCase().replace(/-/g, '_')
}

/** Count rooms by housekeeping/PMS status (view-only dashboard strip). */
export function computeRoomInventoryStats(
  rows: { status?: string | null }[],
): RoomInventoryStats {
  let available = 0
  let occupied = 0
  let outOfOrder = 0
  for (const r of rows) {
    const s = normStatus(r.status)
    if (s === 'occupied') occupied += 1
    else if (s === 'out_of_order') outOfOrder += 1
    else if (s === 'available') available += 1
  }
  return {
    total: rows.length,
    available,
    occupied,
    outOfOrder,
  }
}
