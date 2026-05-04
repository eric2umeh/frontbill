/** Outlets / departments items can be issued or sold to — shown in store movements & reports. */
export const OUTLET_DEPARTMENTS = [
  'Restaurant',
  'Main Bar',
  'Beverages / Mini-bar',
  'Housekeeping',
  'Laundry',
  'Kitchen',
  'Swimming Pool',
  'Front Office',
  'Staff Cafeteria',
  'Engineering / Maintenance',
  'Banquet / Events',
  'General Store (Retail)',
  'Other',
] as const

export type OutletDepartment = (typeof OUTLET_DEPARTMENTS)[number]

/** Outlets highlighted in Store: switch context & issue totals (main stock still lives in central). */
export const STORE_FOCUS_OUTLETS = [
  'Restaurant',
  'Main Bar',
  'Kitchen',
  'Housekeeping',
  'Laundry',
  'Swimming Pool',
] as const

/** Select value for “central store” in the outlet context switcher. */
export const CENTRAL_STORE_VIEW = '__central_store__'

export type StoreOutletContext = typeof CENTRAL_STORE_VIEW | string

/** Issue / destination dropdown: focus outlets first, then any other departments (deduped). */
export function issueOutletPickerOptions(): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const label of [...STORE_FOCUS_OUTLETS, ...OUTLET_DEPARTMENTS]) {
    const k = label.trim().toLowerCase()
    if (!k || seen.has(k)) continue
    seen.add(k)
    out.push(label)
  }
  return out
}
