/** Outlets / departments items can be issued or sold to — shown in store movements & reports. */
export const OUTLET_DEPARTMENTS = [
  'Main Bar',
  'Housekeeping',
  'Laundry',
  'Kitchen',
  'Maintenance',
] as const

export type OutletDepartment = (typeof OUTLET_DEPARTMENTS)[number]

/** Outlets highlighted in Store: switch context & issue totals (main stock still lives in central). */
export const STORE_FOCUS_OUTLETS = [
  'Main Bar',
  'Kitchen',
  'Housekeeping',
  'Laundry',
  'Maintenance',
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

export type StoreIssueDestinationKey = 'main_bar' | 'housekeeping' | 'laundry' | 'maintenance'

export function storeIssueDestinationLabel(key: StoreIssueDestinationKey): string {
  if (key === 'main_bar') return 'Main Bar'
  if (key === 'housekeeping') return 'Housekeeping'
  if (key === 'laundry') return 'Laundry'
  return 'Maintenance'
}

export function isStoreIssueDestination(
  destination: string,
  key: StoreIssueDestinationKey,
): boolean {
  if (key === 'main_bar') return isMainBarIssueDestination(destination)
  const d = destNorm(destination)
  const label = storeIssueDestinationLabel(key).toLowerCase()
  return d === label || d.startsWith(`${label} `)
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
