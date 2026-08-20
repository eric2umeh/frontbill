/** Housekeeping floor statuses — set by housekeepers only; visible hotel-wide. */
export type HousekeepingStatusKey =
  | 'out_of_order'
  | 'occupied'
  | 'vacant'
  | 'complimentary'
  | 'long_stay'
  | 'reservation'
  | 'checkout'
  | 'sleep_out'

export type HousekeepingStatusDef = {
  key: HousekeepingStatusKey
  label: string
  abbr: string
  color: string
  description?: string
}

export const HOUSEKEEPING_STATUS_OPTIONS: HousekeepingStatusDef[] = [
  {
    key: 'out_of_order',
    label: 'Out of Order',
    abbr: 'OOO',
    color: 'bg-gray-200 text-gray-800 border-gray-300',
    description: 'Room unavailable — not for sale or guest use.',
  },
  {
    key: 'occupied',
    label: 'Occupied',
    abbr: 'O',
    color: 'bg-blue-100 text-blue-800 border-blue-200',
  },
  {
    key: 'vacant',
    label: 'Vacant',
    abbr: 'V',
    color: 'bg-green-100 text-green-800 border-green-200',
  },
  {
    key: 'complimentary',
    label: 'Complementary',
    abbr: 'Compl',
    color: 'bg-purple-100 text-purple-800 border-purple-200',
  },
  {
    key: 'long_stay',
    label: 'Long stay',
    abbr: 'L/in',
    color: 'bg-indigo-100 text-indigo-800 border-indigo-200',
    description: 'Guest staying one week or longer.',
  },
  {
    key: 'reservation',
    label: 'Reservation',
    abbr: 'R/s',
    color: 'bg-amber-100 text-amber-900 border-amber-200',
  },
  {
    key: 'checkout',
    label: 'Check-out',
    abbr: 'C/O',
    color: 'bg-orange-100 text-orange-800 border-orange-200',
  },
  {
    key: 'sleep_out',
    label: 'Sleep-out',
    abbr: 'S/O',
    color: 'bg-slate-100 text-slate-800 border-slate-300',
    description: 'Guest did not sleep in the room during their stay.',
  },
]

const BY_KEY = new Map(HOUSEKEEPING_STATUS_OPTIONS.map((d) => [d.key, d]))

export function isHousekeepingStatusKey(value: string): value is HousekeepingStatusKey {
  return BY_KEY.has(value as HousekeepingStatusKey)
}

export function getHousekeepingStatusDef(
  key: string | null | undefined,
): HousekeepingStatusDef | undefined {
  if (!key) return undefined
  const norm = String(key).trim().toLowerCase().replace(/-/g, '_')
  return BY_KEY.get(norm as HousekeepingStatusKey)
}

export function housekeepingStatusLabel(key: string | null | undefined): string {
  return getHousekeepingStatusDef(key)?.label ?? (key ? String(key).replace(/_/g, ' ') : '—')
}

export function housekeepingStatusAbbr(key: string | null | undefined): string {
  return getHousekeepingStatusDef(key)?.abbr ?? '—'
}

/** HK floor statuses that block new bookings / reservations (room hidden from pickers). */
export const HOUSEKEEPING_STATUSES_BLOCKING_BOOKINGS: readonly HousekeepingStatusKey[] = [
  'out_of_order',
  'occupied',
  'complimentary',
  'long_stay',
  'reservation',
  'sleep_out',
]

export function isHousekeepingStatusBlockingBookings(key: string | null | undefined): boolean {
  if (!key) return false
  const norm = String(key).trim().toLowerCase().replace(/-/g, '_')
  return (HOUSEKEEPING_STATUSES_BLOCKING_BOOKINGS as readonly string[]).includes(norm)
}

function normPmsStatus(s: string | null | undefined): string {
  return String(s ?? '')
    .toLowerCase()
    .trim()
    .replace(/-/g, '_')
}

/**
 * Sync PMS `rooms.status` from HK floor status.
 * Only OOO may rewrite front-office occupancy. Vacant / occupied / reservation are
 * housekeeping labels — they must not flip a live stay to available or lock a vacant
 * room as occupied/reserved.
 */
export function pmsStatusForHousekeepingStatus(hkStatus: HousekeepingStatusKey): string | null {
  if (hkStatus === 'out_of_order') return 'out_of_order'
  return null
}

/**
 * PMS `rooms.status` to write for an HK floor-status change, or null to leave occupancy alone.
 * Clearing OOO restores occupied/reserved from the active folio, otherwise available.
 */
export function pmsStatusPatchForHousekeepingChange(params: {
  hkStatus: HousekeepingStatusKey
  currentPmsStatus: string | null | undefined
  occupyingPmsStatus?: 'occupied' | 'reserved' | null
}): string | null {
  if (params.hkStatus === 'out_of_order') return 'out_of_order'
  if (normPmsStatus(params.currentPmsStatus) === 'out_of_order') {
    return params.occupyingPmsStatus ?? 'available'
  }
  return null
}
