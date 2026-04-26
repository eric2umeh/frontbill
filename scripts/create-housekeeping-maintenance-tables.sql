-- ============================================================
-- Housekeeping & Maintenance Tables Migration
-- ============================================================

-- Housekeeping Tasks
-- Tracks cleaning tasks assigned to housekeeper staff per room.
CREATE TABLE IF NOT EXISTS housekeeping_tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  room_id UUID NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
  assigned_to UUID REFERENCES profiles(id) ON DELETE SET NULL,    -- housekeeper user
  assigned_by UUID REFERENCES profiles(id) ON DELETE SET NULL,    -- manager/admin who assigned
  task_type TEXT NOT NULL DEFAULT 'cleaning',                      -- cleaning | deep_clean | turnover | inspection
  status TEXT NOT NULL DEFAULT 'pending',                          -- pending | in_progress | done | skipped | flagged
  priority TEXT NOT NULL DEFAULT 'normal',                         -- low | normal | high | urgent
  notes TEXT,                                                      -- instructions or notes from manager
  completion_notes TEXT,                                           -- notes from housekeeper on completion
  scheduled_date DATE NOT NULL DEFAULT CURRENT_DATE,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Maintenance Work Orders
-- Tracks maintenance issues reported and work orders created per room.
CREATE TABLE IF NOT EXISTS maintenance_tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  room_id UUID NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
  assigned_to UUID REFERENCES profiles(id) ON DELETE SET NULL,    -- maintenance staff
  assigned_by UUID REFERENCES profiles(id) ON DELETE SET NULL,    -- manager/admin who assigned
  reported_by UUID REFERENCES profiles(id) ON DELETE SET NULL,    -- who reported the issue (any role)
  issue_type TEXT NOT NULL DEFAULT 'general',                      -- plumbing | electrical | hvac | furniture | amenities | structural | general
  title TEXT NOT NULL,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'open',                             -- open | in_progress | on_hold | resolved | closed
  priority TEXT NOT NULL DEFAULT 'normal',                         -- low | normal | high | urgent | emergency
  resolution_notes TEXT,                                           -- what was done to fix it
  estimated_cost NUMERIC(12, 2),
  actual_cost NUMERIC(12, 2),
  scheduled_date DATE,
  started_at TIMESTAMPTZ,
  resolved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Housekeeping Daily Reports
-- One report per housekeeper per day summarising their work.
CREATE TABLE IF NOT EXISTS housekeeping_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  submitted_by UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  report_date DATE NOT NULL DEFAULT CURRENT_DATE,
  rooms_cleaned INTEGER NOT NULL DEFAULT 0,
  rooms_inspected INTEGER NOT NULL DEFAULT 0,
  issues_found INTEGER NOT NULL DEFAULT 0,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(submitted_by, report_date)
);

-- Maintenance Daily Reports
-- One report per maintenance staff per day.
CREATE TABLE IF NOT EXISTS maintenance_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  submitted_by UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  report_date DATE NOT NULL DEFAULT CURRENT_DATE,
  orders_completed INTEGER NOT NULL DEFAULT 0,
  orders_in_progress INTEGER NOT NULL DEFAULT 0,
  issues_escalated INTEGER NOT NULL DEFAULT 0,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(submitted_by, report_date)
);

-- Indexes for fast lookups by room and date
CREATE INDEX IF NOT EXISTS idx_housekeeping_tasks_room_id ON housekeeping_tasks(room_id);
CREATE INDEX IF NOT EXISTS idx_housekeeping_tasks_org_date ON housekeeping_tasks(organization_id, scheduled_date);
CREATE INDEX IF NOT EXISTS idx_housekeeping_tasks_assigned ON housekeeping_tasks(assigned_to);
CREATE INDEX IF NOT EXISTS idx_maintenance_tasks_room_id ON maintenance_tasks(room_id);
CREATE INDEX IF NOT EXISTS idx_maintenance_tasks_org_date ON maintenance_tasks(organization_id, scheduled_date);
CREATE INDEX IF NOT EXISTS idx_maintenance_tasks_assigned ON maintenance_tasks(assigned_to);
