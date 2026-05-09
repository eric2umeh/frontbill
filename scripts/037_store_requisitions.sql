-- ═══════════════════════════════════════════════════════════════════════════
-- Store requisitions (digital “STORE ISSUES REQUISITION” form)
-- Run in Supabase SQL Editor: copy the ENTIRE file and click Run once.
-- Do NOT run a highlighted selection only (that causes “syntax error at uuid”).
-- Requires: public.organizations, public.profiles (same as rest of FrontBill).
-- Run after scripts 029/031 store migrations if you use those.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE TABLE IF NOT EXISTS public.store_requisitions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  reference TEXT NOT NULL,
  store_section TEXT NOT NULL,
  department TEXT NOT NULL,
  request_date DATE NOT NULL DEFAULT (CURRENT_DATE AT TIME ZONE 'Africa/Lagos')::date,
  status TEXT NOT NULL DEFAULT 'submitted'
    CHECK (status IN ('submitted', 'processing', 'fulfilled', 'cancelled')),
  requested_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  fulfilled_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  fulfilled_at TIMESTAMPTZ,
  received_by_name TEXT,
  notes TEXT,
  debit_account TEXT,
  credit_account TEXT,
  accountant_notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (organization_id, reference)
);

CREATE TABLE IF NOT EXISTS public.store_requisition_lines (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  requisition_id UUID NOT NULL REFERENCES public.store_requisitions(id) ON DELETE CASCADE,
  line_no INT NOT NULL,
  item_description TEXT NOT NULL,
  unit TEXT NOT NULL DEFAULT 'pcs',
  qty_required NUMERIC(14, 3) NOT NULL CHECK (qty_required > 0),
  qty_issued NUMERIC(14, 3),
  unit_cost NUMERIC(14, 2),
  total_cost NUMERIC(14, 2),
  remark TEXT,
  UNIQUE (requisition_id, line_no)
);

CREATE INDEX IF NOT EXISTS idx_store_req_org ON public.store_requisitions(organization_id);
CREATE INDEX IF NOT EXISTS idx_store_req_status ON public.store_requisitions(organization_id, status);
CREATE INDEX IF NOT EXISTS idx_store_req_created ON public.store_requisitions(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_store_req_lines_req ON public.store_requisition_lines(requisition_id);

ALTER TABLE public.store_requisitions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.store_requisition_lines ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS store_requisitions_org ON public.store_requisitions;
CREATE POLICY store_requisitions_org ON public.store_requisitions
  FOR ALL TO authenticated
  USING (
    organization_id IN (SELECT organization_id FROM public.profiles WHERE id = auth.uid())
  )
  WITH CHECK (
    organization_id IN (SELECT organization_id FROM public.profiles WHERE id = auth.uid())
  );

DROP POLICY IF EXISTS store_requisition_lines_org ON public.store_requisition_lines;
CREATE POLICY store_requisition_lines_org ON public.store_requisition_lines
  FOR ALL TO authenticated
  USING (
    requisition_id IN (
      SELECT id FROM public.store_requisitions
      WHERE organization_id IN (SELECT organization_id FROM public.profiles WHERE id = auth.uid())
    )
  )
  WITH CHECK (
    requisition_id IN (
      SELECT id FROM public.store_requisitions
      WHERE organization_id IN (SELECT organization_id FROM public.profiles WHERE id = auth.uid())
    )
  );

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'store_requisitions_set_updated_at') THEN
    CREATE OR REPLACE FUNCTION public.touch_store_requisitions_updated_at()
    RETURNS TRIGGER AS $f$
    BEGIN
      NEW.updated_at = now();
      RETURN NEW;
    END;
    $f$ LANGUAGE plpgsql;

    CREATE TRIGGER store_requisitions_set_updated_at
      BEFORE UPDATE ON public.store_requisitions
      FOR EACH ROW EXECUTE PROCEDURE public.touch_store_requisitions_updated_at();
  END IF;
END $$;

COMMENT ON TABLE public.store_requisitions IS 'Department store issues requisition header (replaces paper REQ forms).';
COMMENT ON TABLE public.store_requisition_lines IS 'Line items: qty required vs qty issued, costs for accounts.';
