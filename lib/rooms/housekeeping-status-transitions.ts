import type { HousekeepingStatusKey } from '@/lib/rooms/housekeeping-status'

/** Statuses housekeepers may set as the next step (never set by system on their behalf). */
export const HOUSEKEEPER_MANAGED_STATUSES: readonly HousekeepingStatusKey[] = [
  'vacant',
  'out_of_order',
]

/**
 * Allowed housekeeping floor transitions for the Housekeeper role.
 * All other statuses (occupied, reservation, checkout, etc.) are set by the system.
 */
const HOUSEKEEPER_TRANSITIONS: Readonly<
  Record<HousekeepingStatusKey, readonly HousekeepingStatusKey[]>
> = {
  checkout: ['vacant', 'out_of_order'],
  vacant: ['out_of_order'],
  out_of_order: ['vacant'],
  occupied: [],
  complimentary: [],
  long_stay: [],
  reservation: [],
  sleep_out: [],
}

export function housekeeperAllowedNextStatuses(
  current: string | null | undefined,
): HousekeepingStatusKey[] {
  const norm = normalizeHousekeepingStatusKey(current)
  if (!norm) return []
  return [...(HOUSEKEEPER_TRANSITIONS[norm] ?? [])]
}

export function isHousekeeperTransitionAllowed(
  from: string | null | undefined,
  to: HousekeepingStatusKey,
): boolean {
  const norm = normalizeHousekeepingStatusKey(from)
  if (!norm) return false
  return housekeeperAllowedNextStatuses(norm).includes(to)
}

export function housekeeperTransitionError(
  from: string | null | undefined,
  to: HousekeepingStatusKey,
): string {
  const norm = normalizeHousekeepingStatusKey(from)
  if (!norm) {
    return 'This room has no housekeeping status yet. Wait for front desk checkout or system sync.'
  }
  const allowed = housekeeperAllowedNextStatuses(norm)
  if (allowed.length === 0) {
    return `Housekeeping cannot change a room marked ${norm.replace(/_/g, ' ')}. Only front desk / system updates that status.`
  }
  if (!allowed.includes(to)) {
    const opts = allowed.map((k) => k.replace(/_/g, ' ')).join(' or ')
    return `From ${norm.replace(/_/g, ' ')}, you can only set the room to ${opts}.`
  }
  return 'That status change is not allowed.'
}

function normalizeHousekeepingStatusKey(
  value: string | null | undefined,
): HousekeepingStatusKey | null {
  const norm = String(value || '')
    .trim()
    .toLowerCase()
    .replace(/-/g, '_')
  if (!norm) return null
  if (norm in HOUSEKEEPER_TRANSITIONS) return norm as HousekeepingStatusKey
  return null
}
