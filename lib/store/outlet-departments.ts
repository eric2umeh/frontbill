/** Outlets / departments items can be issued or sold to — shown in store movements & reports. */
export const OUTLET_DEPARTMENTS = [
  'Restaurant',
  'Main Bar',
  'Beverages / Mini-bar',
  'Housekeeping',
  'Laundry',
  'Kitchen',
  'Front Office',
  'Staff Cafeteria',
  'Engineering / Maintenance',
  'Banquet / Events',
  'General Store (Retail)',
  'Other',
] as const

export type OutletDepartment = (typeof OUTLET_DEPARTMENTS)[number]
