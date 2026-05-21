// Hotel Roles & Permissions configuration
// All roles and their permissions are defined here in code
// No DB tables needed - uses profiles.role column
//
// When you add/change a permission or role: update ROLE_DEFINITIONS descriptions, hasPermission() gates,
// any hardcoded role checks in the app/API, and the in-app copy on Users & Roles → Roles & Permissions.

export type Permission =
  | 'dashboard:view'
  | 'bookings:view' | 'bookings:create' | 'bookings:edit' | 'bookings:delete' | 'bookings:checkin' | 'bookings:checkout'
  | 'room_change:request' | 'room_change:approve'
  | 'reschedule_stay:request' | 'reschedule_stay:approve'
  | 'reservations:view' | 'reservations:create' | 'reservations:edit' | 'reservations:delete'
  | 'events:view' | 'events:create' | 'events:edit' | 'events:delete'
  | 'rooms:view' | 'rooms:create' | 'rooms:edit' | 'rooms:delete' | 'rooms:update_status'
  | 'guests:view' | 'guests:create' | 'guests:edit' | 'guests:delete'
  | 'transactions:view' | 'transactions:create' | 'transactions:edit' | 'transactions:delete' | 'transactions:export'
  | 'analytics:view' | 'analytics:export'
  | 'payments:view' | 'payments:create' | 'payments:refund'
  | 'reports:view' | 'reports:export'
  | 'expenses:view' | 'expenses:create' | 'expenses:edit' | 'expenses:export' | 'expenses:budget'
  | 'organizations:view' | 'organizations:create' | 'organizations:edit' | 'organizations:delete'
  | 'ledger:view' | 'ledger:manage'
  | 'night_audit:view' | 'night_audit:run' | 'audit_trails:view'
  | 'reconciliation:view' | 'reconciliation:manage'
  | 'users:view' | 'users:create' | 'users:edit' | 'users:delete'
  | 'roles:view' | 'roles:manage'
  | 'settings:view' | 'settings:manage'
  | 'backdate:request' | 'backdate:approve'
  | 'housekeeping:view' | 'housekeeping:create' | 'housekeeping:edit' | 'housekeeping:assign' | 'housekeeping:report'
  | 'maintenance:view' | 'maintenance:create' | 'maintenance:edit' | 'maintenance:assign' | 'maintenance:report'
  | 'store:view' | 'store:create' | 'store:edit' | 'store:delete' | 'store:adjust'
  | 'store:issue' | 'store:reports' | 'store:audit'
  /** Submit / view store requisitions (department staff); fulfillment still uses store:issue / store:view */
  | 'store:requisition'
  /** FnB, laundry, gym POS — view outlet hub and assigned departments */
  | 'outlet:view'
  | 'outlet:menu'
  | 'outlet:sell'
  | 'outlet:void'
  | 'outlet:reports'
  | 'outlet:receipt'

export type RoleKey =
  | 'superadmin'
  | 'admin'
  | 'manager'
  | 'front_desk'
  | 'receptionist'
  | 'accountant'
  | 'auditor'
  | 'staff'
  | 'housekeeping'
  | 'maintenance'
  | 'store'
  | 'cashier'
  | 'food_beverage'
  | 'laundry'
  | 'gym'

export interface RoleDefinition {
  key: RoleKey
  label: string
  description: string
  color: string
  permissions: Permission[]
}

export const ALL_PERMISSIONS: { key: Permission; label: string; group: string }[] = [
  { key: 'dashboard:view', label: 'View Dashboard Widgets', group: 'Dashboard' },

  { key: 'bookings:view', label: 'View Bookings', group: 'Bookings' },
  { key: 'bookings:create', label: 'Create Bookings & Bulk Bookings', group: 'Bookings' },
  { key: 'bookings:edit', label: 'Edit Booking Details', group: 'Bookings' },
  { key: 'bookings:delete', label: 'Delete Bookings', group: 'Bookings' },
  { key: 'bookings:checkin', label: 'Check In Guests', group: 'Bookings' },
  { key: 'bookings:checkout', label: 'Check Out Folios', group: 'Bookings' },
  { key: 'room_change:request', label: 'Request guest room change (approval)', group: 'Bookings' },
  { key: 'room_change:approve', label: 'Approve Room Change Requests', group: 'Bookings' },
  { key: 'reschedule_stay:request', label: 'Request move stay dates (approval)', group: 'Bookings' },
  { key: 'reschedule_stay:approve', label: 'Approve Move Stay Dates Requests', group: 'Bookings' },

  { key: 'reservations:view', label: 'View Reservations', group: 'Reservations' },
  { key: 'reservations:create', label: 'Create Reservations & Bulk Reservation', group: 'Reservations' },
  { key: 'reservations:edit', label: 'Edit Reservations', group: 'Reservations' },
  { key: 'reservations:delete', label: 'Cancel/Delete Reservations', group: 'Reservations' },

  { key: 'events:view', label: 'View Events', group: 'Reservations' },
  { key: 'events:create', label: 'Create Events', group: 'Reservations' },
  { key: 'events:edit', label: 'Edit Events', group: 'Reservations' },
  { key: 'events:delete', label: 'Delete Events', group: 'Reservations' },

  { key: 'guests:view', label: 'View Guests', group: 'Guests' },
  { key: 'guests:create', label: 'Create Guest Profiles', group: 'Guests' },
  { key: 'guests:edit', label: 'Edit Guest Profiles', group: 'Guests' },
  { key: 'guests:delete', label: 'Delete Guest Profiles', group: 'Guests' },

  { key: 'organizations:view', label: 'View Organizations', group: 'Organizations' },
  { key: 'organizations:create', label: 'Create Organizations', group: 'Organizations' },
  { key: 'organizations:edit', label: 'Edit Organizations', group: 'Organizations' },
  { key: 'organizations:delete', label: 'Delete Organizations', group: 'Organizations' },

  { key: 'transactions:view', label: 'View Transactions', group: 'Transactions' },
  { key: 'transactions:create', label: 'Record Transactions', group: 'Transactions' },
  { key: 'transactions:edit', label: 'Edit Transactions', group: 'Transactions' },
  { key: 'transactions:delete', label: 'Delete Transactions', group: 'Transactions' },
  { key: 'transactions:export', label: 'Export Transactions', group: 'Transactions' },

  { key: 'payments:view', label: 'View Payments', group: 'Payments' },
  { key: 'payments:create', label: 'Record Payments', group: 'Payments' },
  { key: 'payments:refund', label: 'Process Refunds/Credits', group: 'Payments' },

  { key: 'reports:view', label: 'View Reports', group: 'Reports' },
  { key: 'reports:export', label: 'Export/Print Reports', group: 'Reports' },

  { key: 'expenses:view', label: 'View Operating Expenses', group: 'Expenses' },
  { key: 'expenses:create', label: 'Record Operating Expenses', group: 'Expenses' },
  { key: 'expenses:edit', label: 'Edit Operating Expenses', group: 'Expenses' },
  { key: 'expenses:export', label: 'Import/Export Expenses', group: 'Expenses' },
  { key: 'expenses:budget', label: 'Manage Expense Budgets', group: 'Expenses' },

  { key: 'night_audit:view', label: 'View Night Audit', group: 'Night Audit' },
  { key: 'night_audit:run', label: 'Run Night Audit', group: 'Night Audit' },
  { key: 'audit_trails:view', label: 'View Audit Trails', group: 'Night Audit' },

  { key: 'housekeeping:view', label: 'View Housekeeping', group: 'Housekeeping' },
  { key: 'housekeeping:create', label: 'Create Housekeeping Log Entries', group: 'Housekeeping' },
  { key: 'housekeeping:edit', label: 'Update Housekeeping Tasks', group: 'Housekeeping' },
  { key: 'housekeeping:assign', label: 'Assign Housekeeping Work', group: 'Housekeeping' },
  { key: 'housekeeping:report', label: 'Submit Housekeeping Daily Reports', group: 'Housekeeping' },

  { key: 'maintenance:view', label: 'View Maintenance', group: 'Maintenance' },
  { key: 'maintenance:create', label: 'Create Maintenance Log Entries', group: 'Maintenance' },
  { key: 'maintenance:edit', label: 'Update Maintenance Work', group: 'Maintenance' },
  { key: 'maintenance:assign', label: 'Assign Maintenance Work', group: 'Maintenance' },
  { key: 'maintenance:report', label: 'Submit Maintenance Daily Reports', group: 'Maintenance' },

  { key: 'store:view', label: 'View Store & Inventory', group: 'Store' },
  { key: 'store:create', label: 'Add Store Items', group: 'Store' },
  { key: 'store:edit', label: 'Edit Store Items', group: 'Store' },
  { key: 'store:delete', label: 'Delete Store Items', group: 'Store' },
  { key: 'store:adjust', label: 'Stock In / Out & Adjustments', group: 'Store' },
  { key: 'store:issue', label: 'Issue Stock to Outlets / Departments', group: 'Store' },
  { key: 'store:reports', label: 'Store reports (daily closing & monthly management report)', group: 'Store' },
  { key: 'store:audit', label: 'Store Movement Audit Trail (Full Detail)', group: 'Store' },
  { key: 'store:requisition', label: 'Store Requisitions (request items from store)', group: 'Store' },

  { key: 'outlet:view', label: 'View Outlets (FnB / Laundry / Gym)', group: 'Outlets' },
  { key: 'outlet:menu', label: 'Manage Outlet Menu (categories & items)', group: 'Outlets' },
  { key: 'outlet:sell', label: 'Take Orders & Sell (POS)', group: 'Outlets' },
  { key: 'outlet:void', label: 'Void Outlet Orders', group: 'Outlets' },
  { key: 'outlet:reports', label: 'Outlet Sales Reports & Night Audit', group: 'Outlets' },
  { key: 'outlet:receipt', label: 'Print / View Outlet Receipts', group: 'Outlets' },

  { key: 'analytics:view', label: 'View Analytics', group: 'Analytics' },
  { key: 'analytics:export', label: 'Export Analytics', group: 'Analytics' },

  { key: 'rooms:view', label: 'View Rooms', group: 'Rooms' },
  { key: 'rooms:create', label: 'Create Rooms', group: 'Rooms' },
  { key: 'rooms:edit', label: 'Edit Rooms', group: 'Rooms' },
  { key: 'rooms:delete', label: 'Delete Rooms', group: 'Rooms' },
  { key: 'rooms:update_status', label: 'Update Room Status', group: 'Rooms' },

  { key: 'ledger:view', label: 'View City Ledger', group: 'City Ledger' },
  { key: 'ledger:manage', label: 'Manage City Ledger Balances', group: 'City Ledger' },

  { key: 'reconciliation:view', label: 'View Reconciliation', group: 'Reconciliation' },
  { key: 'reconciliation:manage', label: 'Manage Reconciliation', group: 'Reconciliation' },

  { key: 'users:view', label: 'View Users & Roles', group: 'Users & Roles' },
  { key: 'users:create', label: 'Add Staff Users', group: 'Users & Roles' },
  { key: 'users:edit', label: 'Edit Staff Users', group: 'Users & Roles' },
  { key: 'users:delete', label: 'Delete Staff Users', group: 'Users & Roles' },
  { key: 'roles:view', label: 'View Permission Sets', group: 'Users & Roles' },
  { key: 'roles:manage', label: 'Manage Role Assignments', group: 'Users & Roles' },

  { key: 'settings:view', label: 'View Profile & Settings', group: 'Settings' },
  { key: 'settings:manage', label: 'Manage Hotel/System Settings', group: 'Settings' },

  { key: 'backdate:request', label: 'Request Backdated Booking/Reservation', group: 'Night Audit' },
  { key: 'backdate:approve', label: 'Approve/Reject Backdates (Night Audit)', group: 'Night Audit' },
]

const ALL: Permission[] = ALL_PERMISSIONS.map(p => p.key)

export const ROLE_DEFINITIONS: RoleDefinition[] = [
  {
    key: 'superadmin',
    label: 'Superadmin',
    description:
      'Full product access identical to Administrator, plus the only role that may create, edit, or remove another Superadmin account (enforced in the Users API). Use for platform owners.',
    color: 'bg-black text-white',
    permissions: ALL,
  },
  {
    key: 'admin',
    label: 'Administrator',
    description:
      'Full hotel operations: same permission bundle as Superadmin—rooms, guests, organizations, bookings, reservations, backdate approvals, Night Audit, settings, and staff management. Cannot add, edit, or delete a Superadmin user (only a Superadmin can).',
    color: 'bg-red-100 text-red-800',
    permissions: ALL,
  },
  {
    key: 'manager',
    label: 'Manager',
    description: 'Operations lead: dashboards, bookings and reservations including bulk/group flows, reserve check-in/cancel from lists, checkout, payments, ledger view, analytics, exports, housekeeping/maintenance oversight, night audit visibility and audit trails—and financial views accountants use except reconciliation management. May edit or delete guest profiles alongside Administrator / Superadmin. Master edits to existing booking records, reservation record edits, organization profile edits, room inventory changes, backdate approvals, and full user/role administration stay with Administrator / Superadmin.',
    color: 'bg-purple-100 text-purple-800',
    permissions: ALL.filter(p => ![
      'roles:manage',
      'users:delete',
      'settings:manage',
      'rooms:create',
      'rooms:edit',
      'rooms:delete',
      'backdate:approve',
      'bookings:edit',
      'bookings:delete',
      'reservations:edit',
      'outlet:void',
    ].includes(p)),
  },
  {
    key: 'store',
    label: 'Store',
    description:
      'General store and inventory only: catalogue, stock counts, and movements — no dashboard or front-office menus. Profile/settings only.',
    color: 'bg-amber-100 text-amber-950 dark:bg-amber-950/30 dark:text-amber-100',
    permissions: [
      'store:view',
      'store:requisition',
      'store:create',
      'store:edit',
      'store:delete',
      'store:adjust',
      'store:issue',
      'store:reports',
      'settings:view',
    ],
  },
  {
    key: 'auditor',
    label: 'Auditor',
    description:
      'Internal audit: read-only view of the hotel store, daily movement summaries, and detailed stock audit trail; may also open system audit trails elsewhere.',
    color: 'bg-slate-200 text-slate-900 dark:bg-slate-800 dark:text-slate-100',
    permissions: [
      'store:view',
      'store:requisition',
      'store:reports',
      'store:audit',
      'night_audit:view',
      'audit_trails:view',
      'settings:view',
    ],
  },
  {
    key: 'cashier',
    label: 'Cashier',
    description:
      'Cash control and daily treasury: view dashboard, today’s transactions, payments, and reports; take orders (POS) at all outlets, print receipts, and outlet daily reports; record cash received from front desk; post operating expenses and refunds; read-only on bookings, reservations/events, guests, and organizations (no menu edits). Cannot create, edit, or delete bookings, reservations, events, guests, or organizations. No Night Audit menu, user administration, analytics, or ledger settlement.',
    color: 'bg-lime-100 text-lime-950 dark:bg-lime-950/35 dark:text-lime-100',
    permissions: [
      'dashboard:view',
      'bookings:view',
      'reservations:view',
      'events:view',
      'guests:view',
      'organizations:view',
      'transactions:view',
      'transactions:create',
      'transactions:export',
      'payments:view',
      'payments:create',
      'payments:refund',
      'reports:view',
      'reports:export',
      'expenses:view',
      'expenses:create',
      'expenses:edit',
      'reconciliation:view',
      'ledger:view',
      'outlet:view',
      'outlet:sell',
      'outlet:reports',
      'outlet:receipt',
      'settings:view',
    ],
  },
  {
    key: 'accountant',
    label: 'Accountant',
    description: 'Finance: transactions view and export (no transaction entry from this role configuration), reconciliation, refunds, ledger management and settlement tools, analytics, recording payments/receipts against folios opened by front office, bookings and reservations read-only, guests and organizations read-only. Opens Night Audit for review but cannot run audits or approve backdates.',
    color: 'bg-blue-100 text-blue-800',
    permissions: [
      'dashboard:view',
      'transactions:view', 'transactions:export',
      'analytics:view', 'analytics:export',
      'payments:view', 'payments:create', 'payments:refund',
      'reports:view', 'reports:export',
      'expenses:view', 'expenses:create', 'expenses:edit', 'expenses:export', 'expenses:budget',
      'ledger:view', 'ledger:manage',
      'reconciliation:view', 'reconciliation:manage',
      'night_audit:view',
      'audit_trails:view',
      'bookings:view',
      'reservations:view',
      'events:view',
      'guests:view',
      'organizations:view',
      'rooms:view',
      'store:view',
      'store:requisition',
      'store:reports',
      'store:audit',
      'outlet:view',
      'outlet:reports',
      'outlet:receipt',
      'settings:view',
    ],
  },
  {
    key: 'front_desk',
    label: 'Front Desk',
    description: 'Front office: new walk-ins and group/bulk bookings, reserve workflows and reserve check-ins from operational lists, check-out, folio charges and extensions where policy allows, payments, city ledger posting, organization creation for corporates, night audit run plus audit trail review, and backdate requests. Creating guest profiles is allowed; editing or deleting guest profiles is reserved for Manager, Administrator, or Superadmin. Master edits to bookings, reservations, organizations, or room inventory are reserved for Administrators.',
    color: 'bg-green-100 text-green-800',
    permissions: [
      'dashboard:view',
      'bookings:view', 'bookings:create', 'bookings:checkin', 'bookings:checkout',
      'reservations:view', 'reservations:create',
      'events:view', 'events:create', 'events:edit', 'events:delete',
      'rooms:view',
      'guests:view', 'guests:create',
      'transactions:view', 'transactions:create',
      'payments:view', 'payments:create',
      'organizations:view', 'organizations:create',
      'ledger:view',
      'night_audit:view', 'night_audit:run', 'audit_trails:view',
      'backdate:request',
      'room_change:request',
      'reschedule_stay:request',
      'store:requisition',
      'settings:view',
    ],
  },
  {
    key: 'receptionist',
    label: 'Receptionist',
    description: 'Lobby team: monitors live bookings and arrivals, executes check-ins/check-outs, verifies payments on folios that are unlocked for their role, and keeps guest lookups current. Creating new bookings or reservations happens through front desk supervisors; housekeeping status is read-only from this persona.',
    color: 'bg-yellow-100 text-yellow-800',
    permissions: [
      'dashboard:view',
      'bookings:view', 'bookings:checkin', 'bookings:checkout',
      'reservations:view',
      'events:view',
      'rooms:view',
      'guests:view', 'guests:create',
      'payments:view',
      'transactions:view',
      'room_change:request',
      'reschedule_stay:request',
      'store:requisition',
      'settings:view',
    ],
  },
  {
    key: 'staff',
    label: 'Staff',
    description: 'Lightweight oversight: confirms room states on the housekeeping board plus upcoming reservations/bookings for scheduling; used by operations floaters.',
    color: 'bg-gray-100 text-gray-800',
    permissions: [
      'rooms:view',
      'bookings:view',
      'store:requisition',
      'settings:view',
    ],
  },
  {
    key: 'housekeeping',
    label: 'Housekeeper',
    description:
      'Housekeeping board, room status updates with notes, and daily housekeeping reporting. Administrator, Superadmin, or Housekeeping may mark a room out of order; Occupied and Reserved are set from bookings only. No Bookings, Reservations, Store, dashboards, billing, or front-office edits.',
    color: 'bg-teal-100 text-teal-800',
    permissions: [
      'housekeeping:view', 'housekeeping:create', 'housekeeping:edit', 'housekeeping:report',
      'rooms:view', 'rooms:update_status',
      'settings:view',
    ],
  },
  {
    key: 'maintenance',
    label: 'Maintenance',
    description:
      'Maintenance queue, work orders, notes, and maintenance reporting. From the maintenance screen only Available or Maintenance room status may be set; cleaning, out of order, occupied, and reserved are handled elsewhere. No Bookings, Reservations, Store, or billing access.',
    color: 'bg-orange-100 text-orange-800',
    permissions: [
      'maintenance:view', 'maintenance:create', 'maintenance:edit', 'maintenance:report',
      'rooms:view',
      'settings:view',
    ],
  },
  {
    key: 'food_beverage',
    label: 'Food & Beverage',
    description:
      'Food & Beverage department: Restaurant, Main Bar, Pool Bar, and Banquets & Events POS — take orders, print receipts, and daily outlet reports. Menu changes are done by Superadmin, Administrator, or Manager. No front desk, store, laundry, or gym.',
    color: 'bg-rose-100 text-rose-900 dark:bg-rose-950/40 dark:text-rose-100',
    permissions: [
      'outlet:view',
      'outlet:sell',
      'outlet:reports',
      'outlet:receipt',
      'settings:view',
    ],
  },
  {
    key: 'laundry',
    label: 'Laundry',
    description:
      'Laundry POS: guest laundry tickets, receipts, and daily reports. Menu changes are done by Superadmin, Administrator, or Manager.',
    color: 'bg-sky-100 text-sky-900 dark:bg-sky-950/40 dark:text-sky-100',
    permissions: [
      'outlet:view',
      'outlet:sell',
      'outlet:reports',
      'outlet:receipt',
      'settings:view',
    ],
  },
  {
    key: 'gym',
    label: 'Gym',
    description:
      'Gym & wellness payments: memberships, day passes, and retail at the gym desk. Receipts and outlet reports for gym only.',
    color: 'bg-emerald-100 text-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-100',
    permissions: [
      'outlet:view',
      'outlet:sell',
      'outlet:reports',
      'outlet:receipt',
      'settings:view',
    ],
  },
]

export function getRoleDefinition(roleKey: string): RoleDefinition | undefined {
  return ROLE_DEFINITIONS.find(r => r.key === roleKey)
}

/**
 * Legacy / import / shorthand values for `profiles.role` that are not exact keys or labels.
 * Keys are normalized like `canonicalRoleKey` (`trim`, lower, spaces/hyphens → `_`).
 */
const PROFILE_ROLE_ALIASES: Record<string, RoleKey> = {
  frontdesk: 'front_desk',
  front_office: 'front_desk',
  frontoffice: 'front_desk',
  reception: 'receptionist',
  reception_staff: 'receptionist',
  housekeeper: 'housekeeping',
  housekeeping_staff: 'housekeeping',
  maint: 'maintenance',
  maintenance_staff: 'maintenance',
  restaurant: 'food_beverage',
  bar: 'food_beverage',
  waiter: 'food_beverage',
  restaurant_staff: 'food_beverage',
  bartender: 'food_beverage',
  bar_staff: 'food_beverage',
  pool_bar: 'food_beverage',
  food_and_beverage: 'food_beverage',
  'food_&_beverage': 'food_beverage',
  fnb: 'food_beverage',
  banquets_staff: 'food_beverage',
  events_staff: 'food_beverage',
  laundry_staff: 'laundry',
  gym_staff: 'gym',
  cash: 'cashier',
  cashiers: 'cashier',
  cashier_staff: 'cashier',
  treasury: 'cashier',
}

/** Every role that may use the signed-in hotel app shell (same set as `ROLE_DEFINITIONS`). */
export const APP_LOGIN_ROLE_KEYS: readonly RoleKey[] = ROLE_DEFINITIONS.map((r) => r.key)

/**
 * Maps `profiles.role` to a canonical RoleKey. Values may be stored as the key (`admin`)
 * or as the display label (`Administrator`, `Front Desk`, etc.).
 */
export function canonicalRoleKey(userRole: string | null | undefined): RoleKey | null {
  if (!userRole) return null
  const s = String(userRole).trim().toLowerCase().replace(/[\s-]+/g, '_')
  if (!s) return null
  const byKey = ROLE_DEFINITIONS.find((r) => r.key === (s as RoleKey))
  if (byKey) return byKey.key
  const labelNorm = (label: string) =>
    label.trim().toLowerCase().replace(/[\s-]+/g, '_')
  const byLabel = ROLE_DEFINITIONS.find((r) => labelNorm(r.label) === s)
  if (byLabel) return byLabel.key
  if (s === 'administrator') return 'admin'
  if (s === 'super_admin') return 'superadmin'
  const fromAlias = PROFILE_ROLE_ALIASES[s]
  if (fromAlias) return fromAlias
  return null
}

/** Roles that may open the Expenses menu and use expense APIs. */
export const EXPENSE_MENU_ROLE_KEYS: readonly RoleKey[] = [
  'superadmin',
  'admin',
  'manager',
  'accountant',
  'cashier',
]

export function canAccessExpenseMenu(userRole: string | null | undefined): boolean {
  const roleKey = canonicalRoleKey(userRole)
  return roleKey != null && EXPENSE_MENU_ROLE_KEYS.includes(roleKey)
}

export function hasPermission(userRole: string | null | undefined, permission: Permission): boolean {
  const roleKey = canonicalRoleKey(userRole)
  if (!roleKey) return false
  if (permission.startsWith('expenses:') && !canAccessExpenseMenu(userRole)) {
    return false
  }
  if (['rooms:create', 'rooms:edit', 'rooms:delete'].includes(permission)) {
    return roleKey === 'superadmin' || roleKey === 'admin'
  }
  if (permission === 'bookings:edit' || permission === 'bookings:delete') {
    return roleKey === 'superadmin' || roleKey === 'admin'
  }
  if (permission === 'reservations:edit') {
    return roleKey === 'superadmin' || roleKey === 'admin'
  }
  if (permission === 'guests:edit' || permission === 'guests:delete') {
    return roleKey === 'superadmin' || roleKey === 'admin' || roleKey === 'manager'
  }
  if (permission === 'organizations:edit' || permission === 'organizations:delete') {
    return roleKey === 'superadmin' || roleKey === 'admin'
  }
  if (permission === 'outlet:void') {
    return roleKey === 'superadmin' || roleKey === 'admin'
  }
  if (['events:create', 'events:edit', 'events:delete'].includes(permission)) {
    return (
      roleKey === 'superadmin' ||
      roleKey === 'admin' ||
      roleKey === 'manager' ||
      roleKey === 'front_desk'
    )
  }
  const role = getRoleDefinition(roleKey)
  if (!role) return false
  return role.permissions.includes(permission)
}

export function getPermissionGroups() {
  const groups: Record<string, { key: Permission; label: string }[]> = {}
  ALL_PERMISSIONS.forEach(p => {
    if (!groups[p.group]) groups[p.group] = []
    groups[p.group].push({ key: p.key, label: p.label })
  })
  return groups
}
