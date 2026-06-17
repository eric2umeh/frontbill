-- FrontBill: Supply chain persistence (Central Store, Kitchen, PO pipeline)
-- Run in Supabase SQL Editor AFTER 029_store_inventory.sql (organizations must exist).
-- Run on staging first, then production after deploy.

-- ── Central store catalogue (Supply → Central Store) ─────────────────

CREATE TABLE IF NOT EXISTS public.supply_catalog_items (
  id TEXT PRIMARY KEY,
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  unit TEXT NOT NULL DEFAULT 'kg',
  dept TEXT NOT NULL,
  depts TEXT[] NULL,
  quantity_in_store NUMERIC(14, 3) NOT NULL DEFAULT 0 CHECK (quantity_in_store >= 0),
  reorder_level NUMERIC(14, 3) NOT NULL DEFAULT 0,
  last_price NUMERIC(14, 2) NOT NULL DEFAULT 0,
  benchmark_price NUMERIC(14, 2) NOT NULL DEFAULT 0,
  kitchen_category TEXT NULL,
  unit_factors JSONB NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID REFERENCES auth.users(id),
  updated_by UUID REFERENCES auth.users(id)
);

CREATE INDEX IF NOT EXISTS idx_supply_catalog_items_org
  ON public.supply_catalog_items(organization_id);

CREATE INDEX IF NOT EXISTS idx_supply_catalog_items_dept
  ON public.supply_catalog_items(organization_id, dept);

-- ── JSON snapshots for kitchen, PO, bar, activity, etc. ─────────────

CREATE TABLE IF NOT EXISTS public.supply_chain_snapshots (
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  snapshot_key TEXT NOT NULL,
  data JSONB NOT NULL DEFAULT '[]'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (organization_id, snapshot_key)
);

CREATE INDEX IF NOT EXISTS idx_supply_chain_snapshots_org
  ON public.supply_chain_snapshots(organization_id);

-- ── RLS ─────────────────────────────────────────────────────────────

ALTER TABLE public.supply_catalog_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.supply_chain_snapshots ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS supply_catalog_items_org ON public.supply_catalog_items;
CREATE POLICY supply_catalog_items_org ON public.supply_catalog_items
  FOR ALL TO authenticated
  USING (organization_id = public.current_user_org_id())
  WITH CHECK (organization_id = public.current_user_org_id());

DROP POLICY IF EXISTS supply_chain_snapshots_org ON public.supply_chain_snapshots;
CREATE POLICY supply_chain_snapshots_org ON public.supply_chain_snapshots
  FOR ALL TO authenticated
  USING (organization_id = public.current_user_org_id())
  WITH CHECK (organization_id = public.current_user_org_id());

-- Touch updated_at on catalogue edits
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'supply_catalog_items_set_updated_at'
  ) THEN
    CREATE OR REPLACE FUNCTION public.touch_supply_catalog_items_updated_at()
    RETURNS TRIGGER AS $f$
    BEGIN
      NEW.updated_at = now();
      RETURN NEW;
    END;
    $f$ LANGUAGE plpgsql;

    CREATE TRIGGER supply_catalog_items_set_updated_at
      BEFORE UPDATE ON public.supply_catalog_items
      FOR EACH ROW EXECUTE PROCEDURE public.touch_supply_catalog_items_updated_at();
  END IF;
END $$;

COMMENT ON TABLE public.supply_catalog_items IS
  'Central Store (Supply module) catalogue — dept-based items with shared qty across depts.';

COMMENT ON TABLE public.supply_chain_snapshots IS
  'Org-scoped JSON blobs for supply kitchen, PO, bar stock, issue log, etc.';
