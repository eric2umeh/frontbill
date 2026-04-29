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
  | 'night_audit:view' | 'night_audit:run'
  | 'reconciliation:view' | 'reconciliation:manage'
  | 'users:view' | 'users:create' | 'users:edit' | 'users:delete'
  | 'roles:view' | 'roles:manage'
  | 'settings:view' | 'settings:manage'
  | 'housekeeping:view' | 'housekeeping:create' | 'housekeeping:edit' | 'housekeeping:assign' | 'housekeeping:report'
  | 'maintenance:view' | 'maintenance:create' | 'maintenance:edit' | 'maintenance:assign' | 'maintenance:report'

export type RoleKey = 'admin' | 'manager' | 'front_desk' | 'receptionist' | 'accountant' | 'staff' | 'housekeeping' | 'maintenance'

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
  { key: 'reservations:create', label: 'Create Reservations & Bulk Reservations', group: 'Reservations' },
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
  { key: 'rooms:create', label: 'Create Rooms (Admin Only)', group: 'Rooms' },
  { key: 'rooms:edit', label: 'Edit Rooms (Admin Only)', group: 'Rooms' },
  { key: 'rooms:delete', label: 'Delete Rooms (Admin Only)', group: 'Rooms' },
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
]

const ALL: Permission[] = ALL_PERMISSIONS.map(p => p.key)

export const ROLE_DEFINITIONS: RoleDefinition[] = [
  {
    key: 'admin',
    label: 'Administrator',
    description: 'Full access to all features including user and role management.',
    color: 'bg-red-100 text-red-800',
    permissions: ALL,
  },
  {
    key: 'manager',
    label: 'Manager',
    description: 'Broad operational access across bookings, reservations, reports, payments and analytics. Room creation, editing and deletion remain admin-only.',
    color: 'bg-purple-100 text-purple-800',
    permissions: ALL.filter(p => ![
      'roles:manage',
      'users:delete',
      'settings:manage',
      'rooms:create',
      'rooms:edit',
      'rooms:delete',
    ].includes(p)),
  },
  {
    key: 'accountant',
    label: 'Accountant',
    description: 'Financial access for payments, transactions, city ledger, reports, analytics, reconciliation and room folio review.',
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
    description: 'Can create bookings, bulk bookings and reservations, manage guest check-in/out, add charges, extend stays, record payments, create organizations, and run night audit. Room CRUD is admin-only.',
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
      'night_audit:view', 'night_audit:run',
      'settings:view',
    ],
  },
  {
    key: 'receptionist',
    label: 'Receptionist',
    description: 'Front-office view access for bookings, reservations, rooms, guests, payments and transactions, with check-in/check-out support.',
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
    description: 'Basic view access for operational context only.',
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
    description: 'Housekeeping access without dashboard access. Can view assigned work, update room status with comments, and submit daily reports.',
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
    description: 'Maintenance access without dashboard access. Can view work orders, update room status with comments, and submit maintenance reports.',
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
    return userRole === 'admin'
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
