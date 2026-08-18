-- =============================================================
-- 078 — Housekeeping / maintenance tables, RLS, room HK status
-- Run in Supabase SQL Editor (staging first, then prod after deploy)
-- =============================================================

-- 1. Housekeeping tasks (cleaning board + status-change log)
CREATE TABLE IF NOT EXISTS public.housekeeping_tasks (
  id                UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id   UUID    NOT NULL,
  room_id           UUID    NOT NULL REFERENCES public.rooms(id) ON DELETE CASCADE,
  room_number       TEXT,
  task_type         TEXT    NOT NULL DEFAULT 'Full Clean',
  status            TEXT    NOT NULL DEFAULT 'pending'
                    CHECK (status IN ('pending','in_progress','done','skipped')),
  priority          TEXT    NOT NULL DEFAULT 'normal'
                    CHECK (priority IN ('low','normal','high','urgent')),
  notes             TEXT,
  assigned_to       UUID    REFERENCES public.profiles(id) ON DELETE SET NULL,
  assigned_name     TEXT,
  created_by        UUID    REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_by_name   TEXT,
  scheduled_date    DATE    NOT NULL DEFAULT CURRENT_DATE,
  completed_at      TIMESTAMPTZ,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.housekeeping_reports (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id     UUID NOT NULL,
  submitted_by        UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  submitted_by_name   TEXT,
  report_date         DATE NOT NULL DEFAULT CURRENT_DATE,
  rooms_cleaned       INTEGER,
  summary             TEXT NOT NULL,
  issues              TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.maintenance_tasks (
  id                UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id   UUID    NOT NULL,
  room_id           UUID    NOT NULL REFERENCES public.rooms(id) ON DELETE CASCADE,
  room_number       TEXT,
  issue_type        TEXT    NOT NULL DEFAULT 'general',
  description       TEXT,
  status            TEXT    NOT NULL DEFAULT 'open'
                    CHECK (status IN ('open','in_progress','resolved','deferred')),
  priority          TEXT    NOT NULL DEFAULT 'normal'
                    CHECK (priority IN ('low','normal','high','critical')),
  notes             TEXT,
  assigned_to       UUID    REFERENCES public.profiles(id) ON DELETE SET NULL,
  assigned_name     TEXT,
  created_by        UUID    REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_by_name   TEXT,
  scheduled_date    DATE    NOT NULL DEFAULT CURRENT_DATE,
  estimated_cost    NUMERIC(12,2),
  resolved_at       TIMESTAMPTZ,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.maintenance_reports (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id     UUID NOT NULL,
  submitted_by        UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  submitted_by_name   TEXT,
  report_date         DATE NOT NULL DEFAULT CURRENT_DATE,
  summary             TEXT NOT NULL,
  issues_resolved     TEXT,
  parts_used          TEXT,
  notes               TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_hk_tasks_org      ON public.housekeeping_tasks(organization_id);
CREATE INDEX IF NOT EXISTS idx_hk_tasks_room     ON public.housekeeping_tasks(room_id);
CREATE INDEX IF NOT EXISTS idx_hk_tasks_date     ON public.housekeeping_tasks(scheduled_date);
CREATE INDEX IF NOT EXISTS idx_hk_tasks_assigned ON public.housekeeping_tasks(assigned_to);
CREATE INDEX IF NOT EXISTS idx_hk_reports_org    ON public.housekeeping_reports(organization_id);
CREATE INDEX IF NOT EXISTS idx_hk_reports_date   ON public.housekeeping_reports(report_date);
CREATE INDEX IF NOT EXISTS idx_mt_tasks_org      ON public.maintenance_tasks(organization_id);
CREATE INDEX IF NOT EXISTS idx_mt_tasks_room     ON public.maintenance_tasks(room_id);
CREATE INDEX IF NOT EXISTS idx_mt_tasks_date     ON public.maintenance_tasks(scheduled_date);
CREATE INDEX IF NOT EXISTS idx_mt_tasks_assigned ON public.maintenance_tasks(assigned_to);
CREATE INDEX IF NOT EXISTS idx_mt_reports_org    ON public.maintenance_reports(organization_id);
CREATE INDEX IF NOT EXISTS idx_mt_reports_date   ON public.maintenance_reports(report_date);

-- 2. Housekeeping floor status on rooms (visible hotel-wide; set by housekeepers only in app)
ALTER TABLE public.rooms
  ADD COLUMN IF NOT EXISTS housekeeping_status TEXT
  CHECK (
    housekeeping_status IS NULL
    OR housekeeping_status IN (
      'out_of_order',
      'occupied',
      'vacant',
      'complimentary',
      'long_stay',
      'reservation',
      'checkout',
      'sleep_out'
    )
  );

CREATE INDEX IF NOT EXISTS idx_rooms_hk_status ON public.rooms(organization_id, housekeeping_status)
  WHERE housekeeping_status IS NOT NULL;

-- 3. RLS — org-scoped read/write for hotel staff
ALTER TABLE public.housekeeping_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.housekeeping_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.maintenance_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.maintenance_reports ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS hk_tasks_select ON public.housekeeping_tasks;
DROP POLICY IF EXISTS hk_tasks_insert ON public.housekeeping_tasks;
DROP POLICY IF EXISTS hk_tasks_update ON public.housekeeping_tasks;
DROP POLICY IF EXISTS hk_reports_select ON public.housekeeping_reports;
DROP POLICY IF EXISTS hk_reports_insert ON public.housekeeping_reports;
DROP POLICY IF EXISTS mt_tasks_select ON public.maintenance_tasks;
DROP POLICY IF EXISTS mt_tasks_insert ON public.maintenance_tasks;
DROP POLICY IF EXISTS mt_tasks_update ON public.maintenance_tasks;
DROP POLICY IF EXISTS mt_reports_select ON public.maintenance_reports;
DROP POLICY IF EXISTS mt_reports_insert ON public.maintenance_reports;

CREATE POLICY hk_tasks_select ON public.housekeeping_tasks
  FOR SELECT USING (organization_id = public.current_user_org_id());

CREATE POLICY hk_tasks_insert ON public.housekeeping_tasks
  FOR INSERT WITH CHECK (organization_id = public.current_user_org_id());

CREATE POLICY hk_tasks_update ON public.housekeeping_tasks
  FOR UPDATE USING (organization_id = public.current_user_org_id());

CREATE POLICY hk_reports_select ON public.housekeeping_reports
  FOR SELECT USING (organization_id = public.current_user_org_id());

CREATE POLICY hk_reports_insert ON public.housekeeping_reports
  FOR INSERT WITH CHECK (organization_id = public.current_user_org_id());

CREATE POLICY mt_tasks_select ON public.maintenance_tasks
  FOR SELECT USING (organization_id = public.current_user_org_id());

CREATE POLICY mt_tasks_insert ON public.maintenance_tasks
  FOR INSERT WITH CHECK (organization_id = public.current_user_org_id());

CREATE POLICY mt_tasks_update ON public.maintenance_tasks
  FOR UPDATE USING (organization_id = public.current_user_org_id());

CREATE POLICY mt_reports_select ON public.maintenance_reports
  FOR SELECT USING (organization_id = public.current_user_org_id());

CREATE POLICY mt_reports_insert ON public.maintenance_reports
  FOR INSERT WITH CHECK (organization_id = public.current_user_org_id());
