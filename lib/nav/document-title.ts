import { getOutletDepartment } from '@/lib/outlets/departments'

const TITLE_SUFFIX = 'FrontBill'

const EXACT: Record<string, string> = {
  '/dashboard': 'Dashboard',
  '/bookings': 'Bookings',
  '/reservations': 'Reservations',
  '/accounts': 'Guests',
  '/organizations': 'Organizations',
  '/outlets': 'Outlets',
  '/transactions': 'Transactions',
  '/transactions/daily-book': 'Daily book',
  '/transactions/analytics': 'Analytics',
  '/transactions/analytics/revenue': 'Revenue',
  '/transactions/analytics/profitability': 'Profitability',
  '/reports': 'Reports',
  '/expenses': 'Expenses',
  '/night-audit': 'Night Audit',
  '/refunds': 'Refunds',
  '/cashback': 'Cashback',
  '/reconciliation': 'Reconciliation',
  '/ledger': 'City ledger',
  '/housekeeping': 'Housekeeping',
  '/maintenance': 'Maintenance',
  '/rooms': 'Rooms',
  '/users-roles': 'Users & Roles',
  '/settings': 'Settings',
  '/supply/store': 'Central Store',
  '/supply/kitchen': 'Kitchen',
  '/supply/purchasing': 'Purchasing',
  '/supply/purchase-orders': 'Purchase Orders',
  '/supply/activity': 'Supply Log',
  '/supply/fnb': 'F&B Store',
  '/store': 'Store',
  '/store/requisitions': 'Requisitions',
}

const PREFIX: Array<[string, string]> = [
  ['/bookings/', 'Booking'],
  ['/bulk-bookings/', 'Group booking'],
  ['/reservations/', 'Reservation'],
  ['/accounts/', 'Guest'],
  ['/organizations/', 'Organization'],
  ['/rooms/', 'Room'],
  ['/transactions/', 'Transactions'],
  ['/reports/', 'Reports'],
  ['/expenses/', 'Expenses'],
  ['/night-audit/', 'Night Audit'],
  ['/supply/store', 'Central Store'],
  ['/supply/kitchen', 'Kitchen'],
  ['/supply/purchasing', 'Purchasing'],
  ['/store/', 'Store'],
]

/** Tab / browser-history label for a dashboard path (Chrome long-press back). */
export function documentTitleForPath(pathname: string): string {
  const path = (pathname || '/').split('?')[0].replace(/\/+$/, '') || '/'
  if (path.startsWith('/outlets/')) {
    const key = path.slice('/outlets/'.length).split('/')[0]
    const def = getOutletDepartment(key)
    return `${def?.label ?? 'Outlet'} · ${TITLE_SUFFIX}`
  }
  if (EXACT[path]) return `${EXACT[path]} · ${TITLE_SUFFIX}`
  for (const [prefix, label] of PREFIX) {
    if (path.startsWith(prefix)) return `${label} · ${TITLE_SUFFIX}`
  }
  return `Hotel Management · ${TITLE_SUFFIX}`
}
