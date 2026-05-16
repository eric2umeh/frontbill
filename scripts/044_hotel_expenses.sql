-- Hotel operating expenses (daily matrix), budgets, audit trail, optional store link.
-- Run in Supabase SQL Editor after prior migrations.

-- ── Categories (per hotel; seeded from app on first use) ─────────────────
CREATE TABLE IF NOT EXISTS public.expense_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  sort_order INT NOT NULL DEFAULT 0,
  department_hint TEXT,
  store_outlet TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (organization_id, code)
);

CREATE INDEX IF NOT EXISTS idx_expense_categories_org ON public.expense_categories (organization_id, sort_order);

-- ── Day-level description (column B in accountant sheet) ───────────────────
CREATE TABLE IF NOT EXISTS public.expense_day_notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  expense_date DATE NOT NULL,
  description TEXT,
  updated_by UUID REFERENCES auth.users(id),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (organization_id, expense_date)
);

CREATE INDEX IF NOT EXISTS idx_expense_day_notes_org_date ON public.expense_day_notes (organization_id, expense_date);

-- ── One amount per date + category (spreadsheet cell) ─────────────────────
CREATE TABLE IF NOT EXISTS public.expense_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  expense_date DATE NOT NULL,
  category_id UUID NOT NULL REFERENCES public.expense_categories(id) ON DELETE RESTRICT,
  amount NUMERIC(14, 2) NOT NULL CHECK (amount > 0),
  description TEXT,
  payment_method TEXT CHECK (payment_method IN ('cash', 'transfer', 'pos', 'cheque', 'other')),
  reference TEXT,
  receipt_url TEXT,
  store_movement_id UUID REFERENCES public.store_stock_movements(id) ON DELETE SET NULL,
  recorded_by UUID NOT NULL REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (organization_id, expense_date, category_id)
);

CREATE INDEX IF NOT EXISTS idx_expense_entries_org_date ON public.expense_entries (organization_id, expense_date);
CREATE INDEX IF NOT EXISTS idx_expense_entries_category ON public.expense_entries (category_id);

-- ── Monthly budget per category (phase 4) ────────────────────────────────
CREATE TABLE IF NOT EXISTS public.expense_budgets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  category_id UUID NOT NULL REFERENCES public.expense_categories(id) ON DELETE CASCADE,
  budget_year INT NOT NULL,
  budget_month INT NOT NULL CHECK (budget_month BETWEEN 1 AND 12),
  amount_limit NUMERIC(14, 2) NOT NULL CHECK (amount_limit >= 0),
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (organization_id, category_id, budget_year, budget_month)
);

CREATE INDEX IF NOT EXISTS idx_expense_budgets_org_period ON public.expense_budgets (organization_id, budget_year, budget_month);

-- ── Audit log (phase 3) ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.expense_audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  expense_entry_id UUID REFERENCES public.expense_entries(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  payload JSONB,
  actor_id UUID NOT NULL REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_expense_audit_org_created ON public.expense_audit_log (organization_id, created_at DESC);

-- ── RLS ───────────────────────────────────────────────────────────────────
ALTER TABLE public.expense_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.expense_day_notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.expense_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.expense_budgets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.expense_audit_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS expense_categories_org ON public.expense_categories;
CREATE POLICY expense_categories_org ON public.expense_categories
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.organization_id = expense_categories.organization_id
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.organization_id = expense_categories.organization_id
        AND p.role IN ('superadmin', 'admin', 'manager', 'accountant')
    )
  );

DROP POLICY IF EXISTS expense_day_notes_org ON public.expense_day_notes;
CREATE POLICY expense_day_notes_org ON public.expense_day_notes
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.organization_id = expense_day_notes.organization_id
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.organization_id = expense_day_notes.organization_id
        AND p.role IN ('superadmin', 'admin', 'manager', 'accountant')
    )
  );

DROP POLICY IF EXISTS expense_entries_select ON public.expense_entries;
CREATE POLICY expense_entries_select ON public.expense_entries
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.organization_id = expense_entries.organization_id
    )
  );

DROP POLICY IF EXISTS expense_entries_write ON public.expense_entries;
CREATE POLICY expense_entries_write ON public.expense_entries
  FOR INSERT TO authenticated
  WITH CHECK (
    recorded_by = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.organization_id = expense_entries.organization_id
        AND p.role IN ('superadmin', 'admin', 'manager', 'accountant')
    )
  );

DROP POLICY IF EXISTS expense_entries_update ON public.expense_entries;
CREATE POLICY expense_entries_update ON public.expense_entries
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.organization_id = expense_entries.organization_id
        AND p.role IN ('superadmin', 'admin', 'manager', 'accountant')
    )
  );

DROP POLICY IF EXISTS expense_entries_delete ON public.expense_entries;
CREATE POLICY expense_entries_delete ON public.expense_entries
  FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.organization_id = expense_entries.organization_id
        AND p.role IN ('superadmin', 'admin', 'manager', 'accountant')
    )
  );

DROP POLICY IF EXISTS expense_budgets_org ON public.expense_budgets;
CREATE POLICY expense_budgets_org ON public.expense_budgets
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.organization_id = expense_budgets.organization_id
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.organization_id = expense_budgets.organization_id
        AND p.role IN ('superadmin', 'admin', 'manager', 'accountant')
    )
  );

DROP POLICY IF EXISTS expense_audit_select ON public.expense_audit_log;
CREATE POLICY expense_audit_select ON public.expense_audit_log
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.organization_id = expense_audit_log.organization_id
    )
  );

DROP POLICY IF EXISTS expense_audit_insert ON public.expense_audit_log;
CREATE POLICY expense_audit_insert ON public.expense_audit_log
  FOR INSERT TO authenticated
  WITH CHECK (actor_id = auth.uid());

COMMENT ON TABLE public.expense_entries IS 'Daily operating expenses — one row per date and category (hotel spreadsheet cell).';
COMMENT ON TABLE public.expense_budgets IS 'Monthly spending cap per category; reports flag over-budget categories.';
