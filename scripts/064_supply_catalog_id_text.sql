-- Fix supply_catalog_items.id if 063 was run with UUID id (empty table only).
-- Run ONLY on staging first. Safe when the table has no rows yet.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'supply_catalog_items'
      AND column_name = 'id'
      AND udt_name = 'uuid'
  ) THEN
    IF EXISTS (SELECT 1 FROM public.supply_catalog_items LIMIT 1) THEN
      RAISE EXCEPTION
        'supply_catalog_items has rows with UUID ids. Contact dev — manual migration needed.';
    END IF;

    DROP TABLE IF EXISTS public.supply_catalog_items CASCADE;

    CREATE TABLE public.supply_catalog_items (
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

    CREATE INDEX idx_supply_catalog_items_org
      ON public.supply_catalog_items(organization_id);
    CREATE INDEX idx_supply_catalog_items_dept
      ON public.supply_catalog_items(organization_id, dept);

    ALTER TABLE public.supply_catalog_items ENABLE ROW LEVEL SECURITY;
    DROP POLICY IF EXISTS supply_catalog_items_org ON public.supply_catalog_items;
    CREATE POLICY supply_catalog_items_org ON public.supply_catalog_items
      FOR ALL TO authenticated
      USING (organization_id = public.current_user_org_id())
      WITH CHECK (organization_id = public.current_user_org_id());
  END IF;
END $$;
