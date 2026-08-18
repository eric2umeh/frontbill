/** Outlets / departments items can be issued or sold to — shown in store movements & reports. */
export const OUTLET_DEPARTMENTS = [
  'Main Bar',
  'Housekeeping',
  'Laundry',
  'Kitchen',
  'Maintenance',
  'Gym & Wellness',
] as const

export type OutletDepartment = (typeof OUTLET_DEPARTMENTS)[number]

/** Outlets highlighted in Store: switch context & issue totals (main stock still lives in central). */
export const STORE_FOCUS_OUTLETS = [
  'Main Bar',
  'Kitchen',
  'Housekeeping',
  'Laundry',
  'Maintenance',
  'Gym & Wellness',
] as const

/** Select value for “central store” in the outlet context switcher. */
export const CENTRAL_STORE_VIEW = '__central_store__'

export type StoreOutletContext = typeof CENTRAL_STORE_VIEW | string

export function isMainBarIssueDestination(destination: string): boolean {
  const d = destNorm(destination)
  return (
    d === 'main bar' ||
    d === 'bar' ||
    d === 'beverages / mini-bar'
  )
}

function destNorm(destination: string): string {
  return destination.trim().toLowerCase().replace(/[_-]+/g, ' ').replace(/\s+/g, ' ')
}

export type StoreIssueDestinationKey =
  | 'main_bar'
  | 'housekeeping'
  | 'laundry'
  | 'maintenance'
  | 'gym'

export function storeIssueDestinationLabel(key: StoreIssueDestinationKey): string {
  if (key === 'main_bar') return 'Main Bar'
  if (key === 'housekeeping') return 'Housekeeping'
  if (key === 'laundry') return 'Laundry'
  if (key === 'gym') return 'Gym & Wellness'
  return 'Maintenance'
}

export function isGymIssueDestination(destination: string): boolean {
  const d = destNorm(destination)
  return (
    d === 'gym' ||
    d === 'gym & wellness' ||
    d === 'gym and wellness' ||
    d.startsWith('gym ')
  )
}

export function isStoreIssueDestination(
  destination: string,
  key: StoreIssueDestinationKey,
): boolean {
  if (key === 'main_bar') return isMainBarIssueDestination(destination)
  if (key === 'gym') return isGymIssueDestination(destination)
  const d = destNorm(destination)
  const label = storeIssueDestinationLabel(key).toLowerCase()
  return d === label || d.startsWith(`${label} `)
}

/** Outlet POS department → store issue filter key (Items from Store tab). */
export function storeIssueDestinationForOutletDepartment(
  department: string,
): StoreIssueDestinationKey | null {
  if (department === 'main_bar') return 'main_bar'
  if (department === 'laundry') return 'laundry'
  if (department === 'gym') return 'gym'
  return null
}

/** Issue / destination dropdown: focus outlets first, then any other departments (deduped). */
export function issueOutletPickerOptions(): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const label of [...STORE_FOCUS_OUTLETS, ...OUTLET_DEPARTMENTS]) {
    const k = label.trim().toLowerCase()
    if (!k || seen.has(k)) continue
    if (k.includes('f&b') || k === 'fnb store' || k === 'food & beverage') continue
    seen.add(k)
    out.push(label)
  }
  return out
}
