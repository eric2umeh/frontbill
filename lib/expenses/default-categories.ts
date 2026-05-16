/** Default expense columns from typical Nigerian hotel expenditure sheets. */
export const DEFAULT_EXPENSE_CATEGORIES: {
  code: string
  name: string
  sort_order: number
  department_hint?: string
  store_outlet?: string
}[] = [
  { code: 'gen_maintenance', name: 'General maintenance', sort_order: 10 },
  { code: 'housekeepers', name: 'Housekeepers', sort_order: 20, department_hint: 'accommodation' },
  { code: 'plates', name: 'Plates', sort_order: 30 },
  { code: 'staff_welfare', name: 'Staff welfare', sort_order: 40 },
  { code: 'amac', name: 'AMAC / local levies', sort_order: 50 },
  { code: 'salary', name: 'Salary', sort_order: 60 },
  { code: 'other_maintenance', name: 'Other maintenance', sort_order: 70 },
  { code: 'internet', name: 'Internet', sort_order: 80 },
  { code: 'bar_purchases', name: 'Bar purchases', sort_order: 90, department_hint: 'bar', store_outlet: 'bar' },
  { code: 'marketing', name: 'Marketing / advert', sort_order: 100 },
  { code: 'aedc', name: 'AEDC (electricity)', sort_order: 110 },
  { code: 'kitchen_purchases', name: 'Kitchen purchases', sort_order: 120, department_hint: 'restaurant', store_outlet: 'kitchen' },
  { code: 'airtime', name: 'Airtime', sort_order: 130 },
  { code: 'car_maintenance', name: 'Car maintenance', sort_order: 140 },
  { code: 'dstv', name: 'DSTV', sort_order: 150 },
  { code: 'transportation', name: 'Transportation', sort_order: 160 },
  { code: 'sales_commission', name: 'Sales commission', sort_order: 170 },
  { code: 'stationeries', name: 'Stationeries', sort_order: 180 },
  { code: 'driver_commission', name: 'Driver commission', sort_order: 190 },
  { code: 'staff_food', name: 'Staff food', sort_order: 200 },
  { code: 'gas', name: 'Gas', sort_order: 210 },
  { code: 'complimentary', name: 'Complimentary items', sort_order: 220 },
  { code: 'other', name: 'Other', sort_order: 230 },
  { code: 'police_stipend', name: 'Police / DM stipend', sort_order: 240 },
  { code: 'ac', name: 'AC', sort_order: 250 },
  { code: 'laundry_maint', name: 'Laundry / maintenance', sort_order: 260, department_hint: 'laundry' },
  { code: 'electricals', name: 'Electricals', sort_order: 270 },
  { code: 'plumbing', name: 'Plumbing', sort_order: 280 },
  { code: 'fuel', name: 'Fuel', sort_order: 290 },
  { code: 'diesel', name: 'Diesel', sort_order: 300 },
]

export function slugifyExpenseCode(name: string): string {
  return String(name || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '')
    .slice(0, 48) || 'category'
}
