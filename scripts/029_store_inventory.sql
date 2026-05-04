-- FrontBill: Hotel Store — categories, stock items, movements (Supabase SQL Editor)
--
-- Run the WHOLE file from the next line down (Cmd/Ctrl+A, paste). If Supabase runs only
-- the highlighted selection, a partial copy starting at "id UUID ..." causes:
--   ERROR: syntax error at or near "UUID"  (because CREATE TABLE ... is missing)
--
-- Run after verifying organizations(id) exists for your hotel tenant.
-- Optional: after this migration, run 030_store_monthly_report_seed.sql (set org_id in the DECLARE block)
-- to load opening stock lines from scripts/data/monthly-report-store-september.csv.
-- Run 031_store_accountability.sql for outlet/issue/receiver columns and category & item audit fields.

-- ── Tables ───────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.store_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  slug TEXT NOT NULL,
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (organization_id, slug)
);

CREATE TABLE IF NOT EXISTS public.store_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  category_id UUID REFERENCES public.store_categories(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  sku TEXT,
  unit TEXT NOT NULL DEFAULT 'pcs',
  quantity_on_hand NUMERIC(14, 3) NOT NULL DEFAULT 0 CHECK (quantity_on_hand >= 0),
  reorder_level NUMERIC(14, 3) NOT NULL DEFAULT 0,
  unit_price NUMERIC(14, 2) NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID REFERENCES auth.users(id)
);

CREATE INDEX IF NOT EXISTS idx_store_items_org ON public.store_items(organization_id);
CREATE INDEX IF NOT EXISTS idx_store_items_category ON public.store_items(category_id);
CREATE INDEX IF NOT EXISTS idx_store_categories_org ON public.store_categories(organization_id);

CREATE TABLE IF NOT EXISTS public.store_stock_movements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  item_id UUID NOT NULL REFERENCES public.store_items(id) ON DELETE CASCADE,
  movement_type TEXT NOT NULL CHECK (movement_type IN ('in', 'out', 'adjustment', 'sale')),
  quantity NUMERIC(14, 3) NOT NULL,
  balance_after NUMERIC(14, 3),
  reference TEXT,
  notes TEXT,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_store_movements_org ON public.store_stock_movements(organization_id);
CREATE INDEX IF NOT EXISTS idx_store_movements_item ON public.store_stock_movements(item_id);
CREATE INDEX IF NOT EXISTS idx_store_movements_created ON public.store_stock_movements(created_at DESC);

-- ── RLS ─────────────────────────────────────────────────────────────

ALTER TABLE public.store_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.store_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.store_stock_movements ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS store_categories_staff ON public.store_categories;
CREATE POLICY store_categories_staff ON public.store_categories
  FOR ALL TO authenticated
  USING (
    organization_id IN (SELECT organization_id FROM public.profiles WHERE id = auth.uid())
  )
  WITH CHECK (
    organization_id IN (SELECT organization_id FROM public.profiles WHERE id = auth.uid())
  );

DROP POLICY IF EXISTS store_items_staff ON public.store_items;
CREATE POLICY store_items_staff ON public.store_items
  FOR ALL TO authenticated
  USING (
    organization_id IN (SELECT organization_id FROM public.profiles WHERE id = auth.uid())
  )
  WITH CHECK (
    organization_id IN (SELECT organization_id FROM public.profiles WHERE id = auth.uid())
  );

DROP POLICY IF EXISTS store_movements_staff ON public.store_stock_movements;
CREATE POLICY store_movements_staff ON public.store_stock_movements
  FOR ALL TO authenticated
  USING (
    organization_id IN (SELECT organization_id FROM public.profiles WHERE id = auth.uid())
  )
  WITH CHECK (
    organization_id IN (SELECT organization_id FROM public.profiles WHERE id = auth.uid())
  );

-- Optional: updated_at touch (create if not exists)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'store_items_set_updated_at'
  ) THEN
    CREATE OR REPLACE FUNCTION public.touch_store_items_updated_at()
    RETURNS TRIGGER AS $f$
    BEGIN
      NEW.updated_at = now();
      RETURN NEW;
    END;
    $f$ LANGUAGE plpgsql;

    CREATE TRIGGER store_items_set_updated_at
      BEFORE UPDATE ON public.store_items
      FOR EACH ROW EXECUTE PROCEDURE public.touch_store_items_updated_at();
  END IF;
END $$;

-- ── Seed template: replace ORG_UUID with your hotel organizations.id, then uncomment and run. ──
/*
WITH org AS (SELECT 'ORG_UUID'::uuid AS id)
INSERT INTO public.store_categories (organization_id, name, slug, sort_order)
SELECT org.id, v.name, v.slug, v.ord
FROM org, (VALUES
  ('General Store', 'general-store', 10),
  ('Housekeeping', 'housekeeping', 20),
  ('Laundry', 'laundry', 25),
  ('Staff Meal (Food)', 'staff-meal', 30),
  ('Stationeries', 'stationeries', 40),
  ('Kitchen Consumable', 'kitchen-consumable', 50),
  ('Restaurant', 'restaurant', 60),
  ('Main Bar — Wine', 'main-bar-wine', 70),
  ('Main Bar — Beers & Soft Drinks', 'main-bar-beers-soft', 80),
  ('Beverages Store', 'beverages-store', 90),
  ('F & B Inventory (Crockery)', 'fb-inventory', 100)
) AS v(name, slug, ord)
ON CONFLICT (organization_id, slug) DO NOTHING;

INSERT INTO public.store_items (organization_id, category_id, name, unit, quantity_on_hand, reorder_level, unit_price)
SELECT
  org.id,
  c.id,
  v.name,
  v.u,
  0,
  5,
  0
FROM (SELECT 'ORG_UUID'::uuid AS id) org
CROSS JOIN public.store_categories c
JOIN (VALUES
  ('RICE (GUEST) *50kg', 'kg', 'general-store'),
  ('WHEAT *2kg', 'kg', 'general-store'),
  ('SPAGHETTI', 'pack', 'general-store'),
  ('LAUNDRY NYLON BIG', 'pcs', 'laundry'),
  ('ARIEL DETERGENT *800g', 'packs', 'laundry'),
  ('EGUSI', 'mud', 'staff-meal'),
  ('A4 PAPER', 'rm', 'stationeries'),
  ('LAURENT PERIER', 'btts', 'main-bar-wine'),
  ('BIG STOUT', 'btts', 'main-bar-beers-soft'),
  ('SWAN WATER BIG', 'btts', 'beverages-store'),
  ('DINNER PLATES', 'pcs', 'fb-inventory')
) AS v(name, u, catslug)
  ON c.slug = v.catslug AND c.organization_id = org.id;
*/
