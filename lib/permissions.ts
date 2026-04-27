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
  // Dashboard
  { key: 'dashboard:view', label: 'View Dashboard', group: 'Dashboard' },
  // Bookings
  { key: 'bookings:view', label: 'View Bookings', group: 'Bookings' },
  { key: 'bookings:create', label: 'Create Bookings', group: 'Bookings' },
  { key: 'bookings:edit', label: 'Edit Bookings', group: 'Bookings' },
  { key: 'bookings:delete', label: 'Delete Bookings', group: 'Bookings' },
  { key: 'bookings:checkin', label: 'Check In Guests', group: 'Bookings' },
  { key: 'bookings:checkout', label: 'Check Out Guests', group: 'Bookings' },
  // Reservations
  { key: 'reservations:view', label: 'View Reservations', group: 'Reservations' },
  { key: 'reservations:create', label: 'Create Reservations', group: 'Reservations' },
  { key: 'reservations:edit', label: 'Edit Reservations', group: 'Reservations' },
  { key: 'reservations:delete', label: 'Delete Reservations', group: 'Reservations' },
  // Rooms
  { key: 'rooms:view', label: 'View Rooms', group: 'Rooms' },
  { key: 'rooms:create', label: 'Add Rooms', group: 'Rooms' },
  { key: 'rooms:edit', label: 'Edit Rooms', group: 'Rooms' },
  { key: 'rooms:delete', label: 'Delete Rooms', group: 'Rooms' },
  // Guests
  { key: 'guests:view', label: 'View Guests', group: 'Guest Database' },
  { key: 'guests:create', label: 'Add Guests', group: 'Guest Database' },
  { key: 'guests:edit', label: 'Edit Guests', group: 'Guest Database' },
  { key: 'guests:delete', label: 'Delete Guests', group: 'Guest Database' },
  // Transactions
  { key: 'transactions:view', label: 'View Transactions', group: 'Transactions' },
  { key: 'transactions:create', label: 'Create Transactions', group: 'Transactions' },
  { key: 'transactions:edit', label: 'Edit Transactions', group: 'Transactions' },
  { key: 'transactions:delete', label: 'Delete Transactions', group: 'Transactions' },
  { key: 'transactions:export', label: 'Export Transactions', group: 'Transactions' },
  // Analytics
  { key: 'analytics:view', label: 'View Analytics', group: 'Analytics' },
  { key: 'analytics:export', label: 'Export Analytics', group: 'Analytics' },
  // Payments
  { key: 'payments:view', label: 'View Payments', group: 'Payments' },
  { key: 'payments:create', label: 'Record Payments', group: 'Payments' },
  { key: 'payments:refund', label: 'Process Refunds', group: 'Payments' },
  // Organizations
  { key: 'organizations:view', label: 'View Organizations', group: 'Organizations' },
  { key: 'organizations:create', label: 'Add Organizations', group: 'Organizations' },
  { key: 'organizations:edit', label: 'Edit Organizations', group: 'Organizations' },
  { key: 'organizations:delete', label: 'Delete Organizations', group: 'Organizations' },
  // Ledger
  { key: 'ledger:view', label: 'View City Ledger', group: 'City Ledger' },
  { key: 'ledger:manage', label: 'Manage City Ledger', group: 'City Ledger' },
  // Night Audit
  { key: 'night_audit:view', label: 'View Night Audit', group: 'Night Audit' },
  { key: 'night_audit:run', label: 'Run Night Audit', group: 'Night Audit' },
  // Reconciliation
  { key: 'reconciliation:view', label: 'View Reconciliation', group: 'Reconciliation' },
  { key: 'reconciliation:manage', label: 'Manage Reconciliation', group: 'Reconciliation' },
  // Users
  { key: 'users:view', label: 'View Users', group: 'User Management' },
  { key: 'users:create', label: 'Invite Users', group: 'User Management' },
  { key: 'users:edit', label: 'Edit Users', group: 'User Management' },
  { key: 'users:delete', label: 'Remove Users', group: 'User Management' },
  // Roles
  { key: 'roles:view', label: 'View Roles', group: 'Roles & Permissions' },
  { key: 'roles:manage', label: 'Manage Roles', group: 'Roles & Permissions' },
  // Settings
  { key: 'settings:view', label: 'View Settings', group: 'Settings' },
  { key: 'settings:manage', label: 'Manage Settings', group: 'Settings' },
  // Housekeeping
  { key: 'housekeeping:view', label: 'View Housekeeping', group: 'Housekeeping' },
  { key: 'housekeeping:create', label: 'Create Housekeeping Tasks', group: 'Housekeeping' },
  { key: 'housekeeping:edit', label: 'Edit Housekeeping Tasks', group: 'Housekeeping' },
  { key: 'housekeeping:assign', label: 'Assign Housekeeping Tasks', group: 'Housekeeping' },
  { key: 'housekeeping:report', label: 'Submit Daily Reports', group: 'Housekeeping' },
  // Maintenance
  { key: 'maintenance:view', label: 'View Maintenance', group: 'Maintenance' },
  { key: 'maintenance:create', label: 'Create Work Orders', group: 'Maintenance' },
  { key: 'maintenance:edit', label: 'Edit Work Orders', group: 'Maintenance' },
  { key: 'maintenance:assign', label: 'Assign Work Orders', group: 'Maintenance' },
  { key: 'maintenance:report', label: 'Submit Maintenance Reports', group: 'Maintenance' },
  // Rooms status update (for housekeeping/maintenance)
  { key: 'rooms:update_status', label: 'Update Room Status', group: 'Rooms' },
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
    description: 'Full operational access. Can view analytics, manage bookings, rooms, guests, and transactions. Cannot manage roles.',
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
    description: 'Financial access only. Can view and export transactions, analytics, payments, city ledger and reconciliation.',
    color: 'bg-blue-100 text-blue-800',
    permissions: [
      'dashboard:view',
      'transactions:view', 'transactions:export',
      'analytics:view', 'analytics:export',
      'payments:view', 'payments:create', 'payments:refund',
      'ledger:view', 'ledger:manage',
      'reconciliation:view', 'reconciliation:manage',
      'night_audit:view',
      'bookings:view',
      'reservations:view',
      'guests:view',
      'organizations:view',
    ],
  },
  {
    key: 'front_desk',
    label: 'Front Desk',
    description: 'Can manage bookings, check-ins/outs, reservations, guests and payments. No access to analytics or admin settings.',
    color: 'bg-green-100 text-green-800',
    permissions: [
      'dashboard:view',
      'bookings:view', 'bookings:create', 'bookings:edit', 'bookings:checkin', 'bookings:checkout',
      'reservations:view', 'reservations:create', 'reservations:edit',
      'rooms:view',
      'guests:view', 'guests:create', 'guests:edit',
      'transactions:view', 'transactions:create',
      'payments:view', 'payments:create',
      'organizations:view',
      'ledger:view',
      'night_audit:view', 'night_audit:run',
    ],
  },
  {
    key: 'receptionist',
    label: 'Receptionist',
    description: 'View-only access to bookings, reservations, rooms and guests. Can perform check-in and check-out.',
    color: 'bg-yellow-100 text-yellow-800',
    permissions: [
      'dashboard:view',
      'bookings:view', 'bookings:checkin', 'bookings:checkout',
      'reservations:view',
      'rooms:view',
      'guests:view', 'guests:create',
      'payments:view',
      'transactions:view',
    ],
  },
  {
    key: 'staff',
    label: 'Staff',
    description: 'Basic access. Can view dashboard, rooms and their own assigned tasks only.',
    color: 'bg-gray-100 text-gray-800',
    permissions: [
      'rooms:view',
      'bookings:view',
    ],
  },
  {
    key: 'housekeeping',
    label: 'Housekeeper',
    description: 'Can manage housekeeping tasks, update room cleaning status, view bookings/reservations and submit daily reports.',
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
    description: 'Can manage maintenance work orders, update room maintenance status, view bookings/reservations and submit reports.',
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
