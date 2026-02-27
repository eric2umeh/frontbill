import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('[v0] Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseServiceKey)

async function runMigration() {
  console.log('[v0] Starting roles & permissions migration...')

  // 1. Create permissions table
  const { error: e1 } = await supabase.rpc('exec_sql', {
    sql: `CREATE TABLE IF NOT EXISTS permissions (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      resource TEXT NOT NULL,
      action TEXT NOT NULL,
      description TEXT,
      UNIQUE(resource, action)
    );`
  })
  if (e1) console.log('[v0] permissions table (may already exist):', e1.message)
  else console.log('[v0] permissions table ready')

  // 2. Create roles table
  const { error: e2 } = await supabase.rpc('exec_sql', {
    sql: `CREATE TABLE IF NOT EXISTS roles (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      description TEXT,
      is_system BOOLEAN DEFAULT false,
      color TEXT DEFAULT '#6366f1',
      created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
      updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
      UNIQUE(organization_id, name)
    );`
  })
  if (e2) console.log('[v0] roles table (may already exist):', e2.message)
  else console.log('[v0] roles table ready')

  // 3. Create role_permissions table
  const { error: e3 } = await supabase.rpc('exec_sql', {
    sql: `CREATE TABLE IF NOT EXISTS role_permissions (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      role_id UUID NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
      permission_id UUID NOT NULL REFERENCES permissions(id) ON DELETE CASCADE,
      UNIQUE(role_id, permission_id)
    );`
  })
  if (e3) console.log('[v0] role_permissions table (may already exist):', e3.message)
  else console.log('[v0] role_permissions table ready')

  // 4. Create user_roles table
  const { error: e4 } = await supabase.rpc('exec_sql', {
    sql: `CREATE TABLE IF NOT EXISTS user_roles (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
      role_id UUID NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
      assigned_by UUID REFERENCES auth.users(id),
      assigned_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
      UNIQUE(user_id, role_id)
    );`
  })
  if (e4) console.log('[v0] user_roles table (may already exist):', e4.message)
  else console.log('[v0] user_roles table ready')

  // 5. Create indexes
  const indexes = [
    `CREATE INDEX IF NOT EXISTS idx_roles_org ON roles(organization_id)`,
    `CREATE INDEX IF NOT EXISTS idx_role_permissions_role ON role_permissions(role_id)`,
    `CREATE INDEX IF NOT EXISTS idx_user_roles_user ON user_roles(user_id)`,
    `CREATE INDEX IF NOT EXISTS idx_user_roles_role ON user_roles(role_id)`,
  ]
  for (const idx of indexes) {
    const { error } = await supabase.rpc('exec_sql', { sql: idx })
    if (error) console.log('[v0] index (may exist):', error.message)
  }
  console.log('[v0] Indexes created')

  // 6. Seed permissions
  const permissions = [
    ['dashboard',      'view',    'View dashboard overview'],
    ['bookings',       'view',    'View bookings'],
    ['bookings',       'create',  'Create new bookings'],
    ['bookings',       'edit',    'Edit bookings'],
    ['bookings',       'delete',  'Cancel bookings'],
    ['bookings',       'checkout','Process check-out'],
    ['reservations',   'view',    'View reservations'],
    ['reservations',   'create',  'Create reservations'],
    ['reservations',   'edit',    'Edit reservations'],
    ['reservations',   'delete',  'Cancel reservations'],
    ['rooms',          'view',    'View rooms'],
    ['rooms',          'create',  'Add rooms'],
    ['rooms',          'edit',    'Edit rooms'],
    ['rooms',          'delete',  'Delete rooms'],
    ['guests',         'view',    'View guest database'],
    ['guests',         'create',  'Add guests'],
    ['guests',         'edit',    'Edit guests'],
    ['guests',         'delete',  'Delete guests'],
    ['transactions',   'view',    'View transactions'],
    ['transactions',   'create',  'Record payments'],
    ['transactions',   'void',    'Void transactions'],
    ['analytics',      'view',    'View analytics'],
    ['analytics',      'export',  'Export analytics'],
    ['organizations',  'view',    'View organizations'],
    ['organizations',  'create',  'Create organizations'],
    ['organizations',  'edit',    'Edit organizations'],
    ['organizations',  'delete',  'Delete organizations'],
    ['ledger',         'view',    'View city ledger'],
    ['ledger',         'create',  'Create ledger accounts'],
    ['ledger',         'edit',    'Edit ledger balances'],
    ['night_audit',    'view',    'View night audit'],
    ['night_audit',    'run',     'Run night audit'],
    ['reconciliation', 'view',    'View reconciliation'],
    ['reconciliation', 'run',     'Run reconciliation'],
    ['reports',        'view',    'View reports'],
    ['reports',        'export',  'Export reports'],
    ['settings',       'view',    'View settings'],
    ['settings',       'edit',    'Edit settings'],
    ['roles',          'view',    'View roles'],
    ['roles',          'create',  'Create roles'],
    ['roles',          'edit',    'Edit roles'],
    ['roles',          'delete',  'Delete roles'],
    ['users',          'view',    'View staff users'],
    ['users',          'invite',  'Invite staff'],
    ['users',          'edit',    'Edit user roles'],
    ['users',          'delete',  'Remove staff users'],
    ['payments',       'view',    'View payment details'],
  ]

  const { data: insertedPerms, error: permErr } = await supabase
    .from('permissions')
    .upsert(
      permissions.map(([resource, action, description]) => ({ resource, action, description })),
      { onConflict: 'resource,action', ignoreDuplicates: true }
    )
    .select()

  if (permErr) {
    console.error('[v0] Error seeding permissions:', permErr.message)
  } else {
    console.log('[v0] Permissions seeded successfully')
  }

  // 7. Verify by reading back permissions count
  const { count } = await supabase
    .from('permissions')
    .select('*', { count: 'exact', head: true })
  console.log(`[v0] Total permissions in DB: ${count}`)

  console.log('[v0] Migration complete!')
}

runMigration().catch(err => {
  console.error('[v0] Migration failed:', err)
  process.exit(1)
})
