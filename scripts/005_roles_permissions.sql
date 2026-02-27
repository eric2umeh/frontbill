-- Roles & Permissions Schema
-- Dynamic role-based access control for hotel staff

-- Roles table: stores role definitions per hotel
CREATE TABLE IF NOT EXISTS roles (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  is_system BOOLEAN DEFAULT false, -- system roles cannot be deleted
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(organization_id, name)
);

-- Permissions table: all available permissions in the system
CREATE TABLE IF NOT EXISTS permissions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  resource TEXT NOT NULL,    -- e.g. 'bookings', 'rooms', 'analytics'
  action TEXT NOT NULL,      -- e.g. 'view', 'create', 'edit', 'delete'
  description TEXT,
  UNIQUE(resource, action)
);

-- Role permissions: maps roles to permissions
CREATE TABLE IF NOT EXISTS role_permissions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  role_id UUID NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
  permission_id UUID NOT NULL REFERENCES permissions(id) ON DELETE CASCADE,
  UNIQUE(role_id, permission_id)
);

-- User roles: maps users to roles within an organization
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

-- ─── Seed all system permissions ────────────────────────────────────────────
INSERT INTO permissions (resource, action, description) VALUES
  -- Dashboard
  ('dashboard', 'view', 'View dashboard and overview stats'),
  -- Bookings
  ('bookings', 'view', 'View all bookings and folios'),
  ('bookings', 'create', 'Create new bookings'),
  ('bookings', 'edit', 'Edit existing bookings'),
  ('bookings', 'delete', 'Delete / cancel bookings'),
  ('bookings', 'checkout', 'Process guest check-out'),
  -- Reservations
  ('reservations', 'view', 'View reservations'),
  ('reservations', 'create', 'Create reservations'),
  ('reservations', 'edit', 'Edit reservations'),
  ('reservations', 'delete', 'Cancel reservations'),
  -- Rooms
  ('rooms', 'view', 'View room listing and status'),
  ('rooms', 'create', 'Add new rooms'),
  ('rooms', 'edit', 'Edit room details and status'),
  ('rooms', 'delete', 'Remove rooms'),
  -- Guests
  ('guests', 'view', 'View guest database'),
  ('guests', 'create', 'Add new guests'),
  ('guests', 'edit', 'Edit guest profiles'),
  ('guests', 'delete', 'Delete guest records'),
  -- Transactions
  ('transactions', 'view', 'View transaction history'),
  ('transactions', 'create', 'Record new payments'),
  ('transactions', 'void', 'Void/reverse transactions'),
  -- Analytics
  ('analytics', 'view', 'View revenue analytics and reports'),
  ('analytics', 'export', 'Export analytics data'),
  -- Organizations
  ('organizations', 'view', 'View organization accounts'),
  ('organizations', 'create', 'Create organization accounts'),
  ('organizations', 'edit', 'Edit organization accounts'),
  ('organizations', 'delete', 'Delete organization accounts'),
  -- City Ledger
  ('ledger', 'view', 'View city ledger accounts'),
  ('ledger', 'create', 'Create ledger accounts'),
  ('ledger', 'edit', 'Edit ledger balances'),
  -- Night Audit
  ('night_audit', 'view', 'View night audit reports'),
  ('night_audit', 'run', 'Run and close night audit'),
  -- Reconciliation
  ('reconciliation', 'view', 'View reconciliation reports'),
  ('reconciliation', 'run', 'Run reconciliation'),
  -- Reports
  ('reports', 'view', 'View all reports'),
  ('reports', 'export', 'Export reports'),
  -- Settings
  ('settings', 'view', 'View hotel settings'),
  ('settings', 'edit', 'Edit hotel settings'),
  -- Roles & Users
  ('roles', 'view', 'View roles and permissions'),
  ('roles', 'create', 'Create new roles'),
  ('roles', 'edit', 'Edit role permissions'),
  ('roles', 'delete', 'Delete custom roles'),
  ('users', 'view', 'View staff user list'),
  ('users', 'invite', 'Invite new staff users'),
  ('users', 'edit', 'Edit user roles and details'),
  ('users', 'delete', 'Remove staff users')
ON CONFLICT (resource, action) DO NOTHING;

-- ─── Seed default system role templates ─────────────────────────────────────
-- These are templates. Real roles are created per-organization on first setup.
-- The application code seeds org-specific roles when an org is created.
