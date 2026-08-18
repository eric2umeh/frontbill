import { getOutletDepartment } from '@/lib/outlets/departments'

const TITLE_SUFFIX = 'FrontBill'

const EXACT: Record<string, string> = {
  '/dashboard': 'Dashboard',
  '/bookings': 'Bookings',
  '/reservations': 'Reservations',
  '/reservations/events': 'Events',
  '/accounts': 'Guests',
  '/guest-database': 'Guest database',
  '/organizations': 'Organizations',
  '/outlets': 'Outlets',
  '/payments': 'Payments',
  '/analytics': 'Analytics',
  '/analytics/revenue': 'Revenue',
  '/analytics/profitability': 'Profitability',
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
  '/supply': 'Supply',
  '/supply/store': 'Central Store',
  '/supply/kitchen': 'Kitchen',
  '/supply/purchasing': 'Retirement',
  '/supply/purchase-orders': 'Purchase Orders',
  '/supply/activity': 'Supply Log',
  '/supply/fnb': 'F&B Store',
  '/store': 'Store',
  '/store/requisitions': 'Requisitions',
  '/bulk-bookings': 'Group booking',
}

const PREFIX: Array<[string, string]> = [
  ['/bookings/', 'Booking'],
  ['/bulk-bookings/', 'Group booking'],
  ['/reservations/', 'Reservation'],
  ['/accounts/', 'Guest'],
  ['/guest-database/', 'Guest'],
  ['/organizations/', 'Organization'],
  ['/rooms/', 'Room'],
  ['/transactions/', 'Transactions'],
  ['/reports/', 'Reports'],
  ['/expenses/', 'Expenses'],
  ['/night-audit/', 'Night Audit'],
  ['/supply/store', 'Central Store'],
  ['/supply/kitchen', 'Kitchen'],
  ['/supply/purchasing', 'Retirement'],
  ['/store/', 'Store'],
]

/** Segment used with the root metadata template (`%s · FrontBill`). */
export function pageTitleSegmentForPath(pathname: string): string {
  const path = (pathname || '/').split('?')[0].replace(/\/+$/, '') || '/'
  if (path.startsWith('/outlets/')) {
    const key = path.slice('/outlets/'.length).split('/')[0]
    return getOutletDepartment(key)?.label ?? 'Outlet'
  }
  if (EXACT[path]) return EXACT[path]
  for (const [prefix, label] of PREFIX) {
    if (path.startsWith(prefix)) return label
  }
  return 'Hotel Management'
}

/** Tab / browser-history label for a dashboard path (Chrome long-press back). */
export function documentTitleForPath(pathname: string): string {
  return `${pageTitleSegmentForPath(pathname)} · ${TITLE_SUFFIX}`
}
