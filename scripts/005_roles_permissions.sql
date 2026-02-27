-- Roles & Permissions Schema (MVP)
-- Run AFTER 001_create_schema.sql

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Permissions table: global, not per-org
CREATE TABLE IF NOT EXISTS permissions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  resource TEXT NOT NULL,
  action TEXT NOT NULL,
  description TEXT,
  UNIQUE(resource, action)
);

-- Roles table: per hotel/org
CREATE TABLE IF NOT EXISTS roles (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  is_system BOOLEAN DEFAULT false,
  color TEXT DEFAULT '#6366f1',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(organization_id, name)
);

-- Role permissions: which permissions each role has
CREATE TABLE IF NOT EXISTS role_permissions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  role_id UUID NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
  permission_id UUID NOT NULL REFERENCES permissions(id) ON DELETE CASCADE,
  UNIQUE(role_id, permission_id)
);

-- User roles: which role each staff member has
CREATE TABLE IF NOT EXISTS user_roles (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role_id UUID NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
  assigned_by UUID REFERENCES auth.users(id),
  assigned_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(user_id, role_id)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_roles_org ON roles(organization_id);
CREATE INDEX IF NOT EXISTS idx_role_permissions_role ON role_permissions(role_id);
CREATE INDEX IF NOT EXISTS idx_user_roles_user ON user_roles(user_id);
CREATE INDEX IF NOT EXISTS idx_user_roles_role ON user_roles(role_id);

-- ── Seed all system permissions ─────────────────────────────────────────────
INSERT INTO permissions (resource, action, description) VALUES
  ('dashboard',      'view',    'View dashboard overview'),
  ('bookings',       'view',    'View bookings'),
  ('bookings',       'create',  'Create new bookings'),
  ('bookings',       'edit',    'Edit bookings'),
  ('bookings',       'delete',  'Cancel bookings'),
  ('bookings',       'checkout','Process check-out'),
  ('reservations',   'view',    'View reservations'),
  ('reservations',   'create',  'Create reservations'),
  ('reservations',   'edit',    'Edit reservations'),
  ('reservations',   'delete',  'Cancel reservations'),
  ('rooms',          'view',    'View rooms'),
  ('rooms',          'create',  'Add rooms'),
  ('rooms',          'edit',    'Edit rooms'),
  ('rooms',          'delete',  'Delete rooms'),
  ('guests',         'view',    'View guest database'),
  ('guests',         'create',  'Add guests'),
  ('guests',         'edit',    'Edit guests'),
  ('guests',         'delete',  'Delete guests'),
  ('transactions',   'view',    'View transactions'),
  ('transactions',   'create',  'Record payments'),
  ('transactions',   'void',    'Void transactions'),
  ('analytics',      'view',    'View analytics'),
  ('analytics',      'export',  'Export analytics'),
  ('organizations',  'view',    'View organizations'),
  ('organizations',  'create',  'Create organizations'),
  ('organizations',  'edit',    'Edit organizations'),
  ('organizations',  'delete',  'Delete organizations'),
  ('ledger',         'view',    'View city ledger'),
  ('ledger',         'create',  'Create ledger accounts'),
  ('ledger',         'edit',    'Edit ledger balances'),
  ('night_audit',    'view',    'View night audit'),
  ('night_audit',    'run',     'Run night audit'),
  ('reconciliation', 'view',    'View reconciliation'),
  ('reconciliation', 'run',     'Run reconciliation'),
  ('reports',        'view',    'View reports'),
  ('reports',        'export',  'Export reports'),
  ('settings',       'view',    'View settings'),
  ('settings',       'edit',    'Edit settings'),
  ('roles',          'view',    'View roles'),
  ('roles',          'create',  'Create roles'),
  ('roles',          'edit',    'Edit roles'),
  ('roles',          'delete',  'Delete roles'),
  ('users',          'view',    'View staff users'),
  ('users',          'invite',  'Invite staff'),
  ('users',          'edit',    'Edit user roles'),
  ('users',          'delete',  'Remove staff users'),
  ('payments',       'view',    'View payment details')
ON CONFLICT (resource, action) DO NOTHING;
