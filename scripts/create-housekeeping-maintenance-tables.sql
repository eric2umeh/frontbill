-- =============================================================
-- Housekeeping & Maintenance Tables Migration
-- Run this entire script in your Supabase SQL Editor
-- =============================================================

-- 1. Housekeeping Tasks
--    Tracks cleaning tasks assigned to housekeeper staff per room.
CREATE TABLE IF NOT EXISTS housekeeping_tasks (
  id                UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id   UUID    NOT NULL,
  room_id           UUID    NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
  room_number       TEXT,
  task_type         TEXT    NOT NULL DEFAULT 'Full Clean',
  status            TEXT    NOT NULL DEFAULT 'pending'
                    CHECK (status IN ('pending','in_progress','done','skipped')),
  priority          TEXT    NOT NULL DEFAULT 'normal'
                    CHECK (priority IN ('low','normal','high','urgent')),
  notes             TEXT,
  assigned_to       UUID    REFERENCES profiles(id) ON DELETE SET NULL,
  assigned_name     TEXT,
  created_by        UUID    REFERENCES profiles(id) ON DELETE SET NULL,
  created_by_name   TEXT,
  scheduled_date    DATE    NOT NULL DEFAULT CURRENT_DATE,
  completed_at      TIMESTAMPTZ,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. Housekeeping Daily Reports
CREATE TABLE IF NOT EXISTS housekeeping_reports (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id     UUID NOT NULL,
  submitted_by        UUID REFERENCES profiles(id) ON DELETE SET NULL,
  submitted_by_name   TEXT,
  report_date         DATE NOT NULL DEFAULT CURRENT_DATE,
  rooms_cleaned       INTEGER,
  summary             TEXT NOT NULL,
  issues              TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3. Maintenance Work Orders
--    Tracks maintenance issues and work orders per room.
CREATE TABLE IF NOT EXISTS maintenance_tasks (
  id                UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id   UUID    NOT NULL,
  room_id           UUID    NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
  room_number       TEXT,
  issue_type        TEXT    NOT NULL DEFAULT 'general',
  description       TEXT,
  status            TEXT    NOT NULL DEFAULT 'open'
                    CHECK (status IN ('open','in_progress','resolved','deferred')),
  priority          TEXT    NOT NULL DEFAULT 'normal'
                    CHECK (priority IN ('low','normal','high','critical')),
  notes             TEXT,
  assigned_to       UUID    REFERENCES profiles(id) ON DELETE SET NULL,
  assigned_name     TEXT,
  created_by        UUID    REFERENCES profiles(id) ON DELETE SET NULL,
  created_by_name   TEXT,
  scheduled_date    DATE    NOT NULL DEFAULT CURRENT_DATE,
  estimated_cost    NUMERIC(12,2),
  resolved_at       TIMESTAMPTZ,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 4. Maintenance Daily Reports
CREATE TABLE IF NOT EXISTS maintenance_reports (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id     UUID NOT NULL,
  submitted_by        UUID REFERENCES profiles(id) ON DELETE SET NULL,
  submitted_by_name   TEXT,
  report_date         DATE NOT NULL DEFAULT CURRENT_DATE,
  summary             TEXT NOT NULL,
  issues_resolved     TEXT,
  parts_used          TEXT,
  notes               TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for fast lookups by org, room and date
CREATE INDEX IF NOT EXISTS idx_hk_tasks_org      ON housekeeping_tasks(organization_id);
CREATE INDEX IF NOT EXISTS idx_hk_tasks_room     ON housekeeping_tasks(room_id);
CREATE INDEX IF NOT EXISTS idx_hk_tasks_date     ON housekeeping_tasks(scheduled_date);
CREATE INDEX IF NOT EXISTS idx_hk_tasks_assigned ON housekeeping_tasks(assigned_to);
CREATE INDEX IF NOT EXISTS idx_hk_reports_org    ON housekeeping_reports(organization_id);
CREATE INDEX IF NOT EXISTS idx_hk_reports_date   ON housekeeping_reports(report_date);
CREATE INDEX IF NOT EXISTS idx_mt_tasks_org      ON maintenance_tasks(organization_id);
CREATE INDEX IF NOT EXISTS idx_mt_tasks_room     ON maintenance_tasks(room_id);
CREATE INDEX IF NOT EXISTS idx_mt_tasks_date     ON maintenance_tasks(scheduled_date);
CREATE INDEX IF NOT EXISTS idx_mt_tasks_assigned ON maintenance_tasks(assigned_to);
CREATE INDEX IF NOT EXISTS idx_mt_reports_org    ON maintenance_reports(organization_id);
CREATE INDEX IF NOT EXISTS idx_mt_reports_date   ON maintenance_reports(report_date);
