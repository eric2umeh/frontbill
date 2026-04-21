import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing Supabase environment variables')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseKey)

async function run() {
  console.log('Starting roles & permissions migration...')

  // 1. Create roles table
  const { error: rolesTableErr } = await supabase.rpc('exec_sql', {
    sql: `
      CREATE TABLE IF NOT EXISTS roles (
        id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
        organization_id uuid REFERENCES organizations(id) ON DELETE CASCADE,
        name text NOT NULL,
        description text,
        is_system boolean DEFAULT false,
        created_at timestamptz DEFAULT now(),
        UNIQUE(organization_id, name)
      );
    `
  })
  if (rolesTableErr) console.log('roles table:', rolesTableErr.message)
  else console.log('roles table ready')

  // 2. Create permissions table
  const { error: permTableErr } = await supabase.rpc('exec_sql', {
    sql: `
      CREATE TABLE IF NOT EXISTS permissions (
        id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
        resource text NOT NULL,
        action text NOT NULL,
        description text,
        UNIQUE(resource, action)
      );
    `
  })
  if (permTableErr) console.log('permissions table:', permTableErr.message)
  else console.log('permissions table ready')

  // 3. Create role_permissions join table
  const { error: rpTableErr } = await supabase.rpc('exec_sql', {
    sql: `
      CREATE TABLE IF NOT EXISTS role_permissions (
        id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
        role_id uuid REFERENCES roles(id) ON DELETE CASCADE,
        permission_id uuid REFERENCES permissions(id) ON DELETE CASCADE,
        UNIQUE(role_id, permission_id)
      );
    `
  })
  if (rpTableErr) console.log('role_permissions table:', rpTableErr.message)
  else console.log('role_permissions table ready')

  // 4. Create user_roles join table
  const { error: urTableErr } = await supabase.rpc('exec_sql', {
    sql: `
      CREATE TABLE IF NOT EXISTS user_roles (
        id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
        user_id uuid REFERENCES profiles(id) ON DELETE CASCADE,
        role_id uuid REFERENCES roles(id) ON DELETE CASCADE,
        organization_id uuid REFERENCES organizations(id) ON DELETE CASCADE,
        assigned_by uuid REFERENCES profiles(id),
        assigned_at timestamptz DEFAULT now(),
        UNIQUE(user_id, role_id, organization_id)
      );
    `
  })
  if (urTableErr) console.log('user_roles table:', urTableErr.message)
  else console.log('user_roles table ready')

  // 5. Seed permissions
  const permissions = [
    // Dashboard
    { resource: 'dashboard', action: 'view', description: 'View dashboard' },
    // Bookings
    { resource: 'bookings', action: 'view', description: 'View bookings' },
    { resource: 'bookings', action: 'create', description: 'Create bookings' },
    { resource: 'bookings', action: 'edit', description: 'Edit bookings' },
    { resource: 'bookings', action: 'delete', description: 'Delete bookings' },
    { resource: 'bookings', action: 'checkin', description: 'Check in guests' },
    { resource: 'bookings', action: 'checkout', description: 'Check out guests' },
    // Reservations
    { resource: 'reservations', action: 'view', description: 'View reservations' },
    { resource: 'reservations', action: 'create', description: 'Create reservations' },
    { resource: 'reservations', action: 'edit', description: 'Edit reservations' },
    { resource: 'reservations', action: 'delete', description: 'Delete reservations' },
    // Rooms
    { resource: 'rooms', action: 'view', description: 'View rooms' },
    { resource: 'rooms', action: 'create', description: 'Add rooms' },
    { resource: 'rooms', action: 'edit', description: 'Edit rooms' },
    { resource: 'rooms', action: 'delete', description: 'Delete rooms' },
    // Guests
    { resource: 'guests', action: 'view', description: 'View guest database' },
    { resource: 'guests', action: 'create', description: 'Add guests' },
    { resource: 'guests', action: 'edit', description: 'Edit guests' },
    { resource: 'guests', action: 'delete', description: 'Delete guests' },
    // Transactions
    { resource: 'transactions', action: 'view', description: 'View transactions' },
    { resource: 'transactions', action: 'create', description: 'Record transactions' },
    { resource: 'transactions', action: 'edit', description: 'Edit transactions' },
    { resource: 'transactions', action: 'delete', description: 'Delete transactions' },
    { resource: 'transactions', action: 'export', description: 'Export transactions' },
    // Analytics
    { resource: 'analytics', action: 'view', description: 'View analytics' },
    { resource: 'analytics', action: 'export', description: 'Export analytics' },
    // Payments
    { resource: 'payments', action: 'view', description: 'View payments' },
    { resource: 'payments', action: 'create', description: 'Record payments' },
    { resource: 'payments', action: 'refund', description: 'Process refunds' },
    // Organizations
    { resource: 'organizations', action: 'view', description: 'View organizations' },
    { resource: 'organizations', action: 'create', description: 'Add organizations' },
    { resource: 'organizations', action: 'edit', description: 'Edit organizations' },
    { resource: 'organizations', action: 'delete', description: 'Delete organizations' },
    // Ledger
    { resource: 'ledger', action: 'view', description: 'View city ledger' },
    { resource: 'ledger', action: 'manage', description: 'Manage city ledger accounts' },
    // Night Audit
    { resource: 'night_audit', action: 'view', description: 'View night audit' },
    { resource: 'night_audit', action: 'run', description: 'Run night audit' },
    // Reconciliation
    { resource: 'reconciliation', action: 'view', description: 'View reconciliation' },
    { resource: 'reconciliation', action: 'run', description: 'Run reconciliation' },
    // Users & Roles
    { resource: 'users', action: 'view', description: 'View users' },
    { resource: 'users', action: 'invite', description: 'Invite users' },
    { resource: 'users', action: 'edit', description: 'Edit users' },
    { resource: 'users', action: 'delete', description: 'Remove users' },
    { resource: 'roles', action: 'view', description: 'View roles' },
    { resource: 'roles', action: 'manage', description: 'Create/edit/delete roles' },
    // Settings
    { resource: 'settings', action: 'view', description: 'View settings' },
    { resource: 'settings', action: 'edit', description: 'Edit settings' },
  ]

  for (const perm of permissions) {
    const { error } = await supabase
      .from('permissions')
      .upsert(perm, { onConflict: 'resource,action' })
    if (error) console.log(`perm ${perm.resource}:${perm.action}:`, error.message)
  }
  console.log(`${permissions.length} permissions seeded`)
  console.log('Migration complete!')
}

run().catch(err => {
  console.error('Fatal:', err.message)
  process.exit(1)
})
