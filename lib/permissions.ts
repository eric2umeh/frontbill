// Hotel Roles & Permissions configuration
// All roles and their permissions are defined here in code
// No DB tables needed - uses profiles.role column

export type Permission =
  | 'dashboard:view'
  | 'bookings:view' | 'bookings:create' | 'bookings:edit' | 'bookings:delete' | 'bookings:checkin' | 'bookings:checkout'
  | 'reservations:view' | 'reservations:create' | 'reservations:edit' | 'reservations:delete'
  | 'rooms:view' | 'rooms:create' | 'rooms:edit' | 'rooms:delete' | 'rooms:update_status'
  | 'guests:view' | 'guests:create' | 'guests:edit' | 'guests:delete'
  | 'transactions:view' | 'transactions:create' | 'transactions:edit' | 'transactions:delete' | 'transactions:export'
  | 'analytics:view' | 'analytics:export'
  | 'payments:view' | 'payments:create' | 'payments:refund'
  | 'reports:view' | 'reports:export'
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

export type RoleKey = 'superadmin' | 'admin' | 'manager' | 'front_desk' | 'receptionist' | 'accountant' | 'staff' | 'housekeeping' | 'maintenance'

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

  { key: 'reservations:view', label: 'View Reservations', group: 'Reservations' },
  { key: 'reservations:create', label: 'Create Reservations & Bulk Booking', group: 'Reservations' },
  { key: 'reservations:edit', label: 'Edit Reservations', group: 'Reservations' },
  { key: 'reservations:delete', label: 'Cancel/Delete Reservations', group: 'Reservations' },

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

  { key: 'analytics:view', label: 'View Analytics', group: 'Analytics' },
  { key: 'analytics:export', label: 'Export Analytics', group: 'Analytics' },

  { key: 'rooms:view', label: 'View Rooms', group: 'Rooms' },
  { key: 'rooms:create', label: 'Create Rooms (Superadmin Only)', group: 'Rooms' },
  { key: 'rooms:edit', label: 'Edit Rooms (Superadmin Only)', group: 'Rooms' },
  { key: 'rooms:delete', label: 'Delete Rooms (Superadmin Only)', group: 'Rooms' },
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
  { key: 'backdate:approve', label: 'Approve Backdated Booking/Reservation', group: 'Night Audit' },
]

const ALL: Permission[] = ALL_PERMISSIONS.map(p => p.key)

export const ROLE_DEFINITIONS: RoleDefinition[] = [
  {
    key: 'superadmin',
    label: 'Superadmin',
    description: 'Full system access—including Night Audit approvals for backdates, unrestricted user/role management, and superadmin-only code paths such as destructive guest/organization edits and room inventory changes.',
    color: 'bg-black text-white',
    permissions: ALL,
  },
  {
    key: 'admin',
    label: 'Administrator',
    description: 'Runs the property day-to-day: same breadth as superadmin for operations except backdate approval (superadmin-only in Night Audit), role management, deleting users, editing core guest or organization profiles, and room create/edit/delete.',
    color: 'bg-red-100 text-red-800',
    permissions: ALL.filter(p => !['backdate:approve'].includes(p)),
  },
  {
    key: 'manager',
    label: 'Manager',
    description: 'Operations lead: dashboards, bookings and reservations including bulk/group flows, reserve check-in/cancel from lists, checkout, payments, ledger view, analytics, exports, housekeeping/maintenance oversight, night audit visibility and audit trails—and financial views accountants use except reconciliation management. Editing existing booking/reservation records themselves (not day-to-day front-desk actions), managing users/roles, destructive guest or organization profile edits, and physical room inventory changes stay superadmin-only.',
    color: 'bg-purple-100 text-purple-800',
    permissions: ALL.filter(p => ![
      'roles:manage',
      'users:delete',
      'settings:manage',
      'rooms:create',
      'rooms:edit',
      'rooms:delete',
      'backdate:approve',
    ].includes(p)),
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
      'ledger:view', 'ledger:manage',
      'reconciliation:view', 'reconciliation:manage',
      'night_audit:view',
      'bookings:view',
      'reservations:view',
      'guests:view',
      'organizations:view',
      'rooms:view',
      'settings:view',
    ],
  },
  {
    key: 'front_desk',
    label: 'Front Desk',
    description: 'Front office: new walk-ins and group/bulk bookings, reserve workflows and reserve check-ins from the operational lists, check-out, folio charges and extensions where policy allows, payments, city ledger posting, organization creation for corporates, night audit run plus audit trail review, and backdate requests. Editing an existing booking or reservation record and master guest/organization profiles is superadmin-only in this build; room inventory is superadmin-only.',
    color: 'bg-green-100 text-green-800',
    permissions: [
      'dashboard:view',
      'bookings:view', 'bookings:create', 'bookings:edit', 'bookings:checkin', 'bookings:checkout',
      'reservations:view', 'reservations:create', 'reservations:edit',
      'rooms:view',
      'guests:view', 'guests:create', 'guests:edit',
      'transactions:view', 'transactions:create',
      'payments:view', 'payments:create',
      'organizations:view', 'organizations:create',
      'ledger:view',
      'night_audit:view', 'night_audit:run', 'audit_trails:view',
      'backdate:request',
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
      'rooms:view',
      'guests:view', 'guests:create',
      'payments:view',
      'transactions:view',
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
      'settings:view',
    ],
  },
  {
    key: 'housekeeping',
    label: 'Housekeeper',
    description: 'Housekeeping board, room status updates with notes, and daily housekeeping reporting. Can see bookings/reservations only for coordination—no dashboards, billing, or front-office edits.',
    color: 'bg-teal-100 text-teal-800',
    permissions: [
      'housekeeping:view', 'housekeeping:create', 'housekeeping:edit', 'housekeeping:report',
      'rooms:view', 'rooms:update_status',
      'bookings:view',
      'reservations:view',
      'settings:view',
    ],
  },
  {
    key: 'maintenance',
    label: 'Maintenance',
    description: 'Maintenance queue, updating linked room statuses with notes, and maintenance reporting. Shares the same read-only booking/reservation context as housekeeping without billing access.',
    color: 'bg-orange-100 text-orange-800',
    permissions: [
      'maintenance:view', 'maintenance:create', 'maintenance:edit', 'maintenance:report',
      'rooms:view', 'rooms:update_status',
      'bookings:view',
      'reservations:view',
      'settings:view',
    ],
  },
]

export function getRoleDefinition(roleKey: string): RoleDefinition | undefined {
  return ROLE_DEFINITIONS.find(r => r.key === roleKey)
}

export function hasPermission(userRole: string | null | undefined, permission: Permission): boolean {
  if (!userRole) return false
  if (['rooms:create', 'rooms:edit', 'rooms:delete'].includes(permission)) {
    return userRole === 'superadmin'
  }
  if (['bookings:edit', 'reservations:edit'].includes(permission)) {
    return userRole === 'superadmin'
  }
  if (['guests:edit', 'guests:delete', 'organizations:edit', 'organizations:delete'].includes(permission)) {
    return userRole === 'superadmin'
  }
  const role = getRoleDefinition(userRole)
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
