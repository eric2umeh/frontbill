-- Central Store catalogue price history.
-- Logs every change to last_price / benchmark_price via a trigger so PATCH,
-- sync upsert, and retirement-driven updates all leave an audit trail.
--
-- Run in Supabase SQL Editor on staging first, then production after deploy.
-- Requires scripts/063_supply_chain_persistence.sql (supply_catalog_items).
-- Safe to re-run.

CREATE TABLE IF NOT EXISTS public.supply_catalog_price_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  catalog_item_id TEXT NOT NULL REFERENCES public.supply_catalog_items(id) ON DELETE CASCADE,
  field TEXT NOT NULL CHECK (field IN ('last_price', 'benchmark_price')),
  old_price NUMERIC(14, 2) NOT NULL DEFAULT 0,
  new_price NUMERIC(14, 2) NOT NULL DEFAULT 0,
  changed_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_supply_catalog_price_history_item_created
  ON public.supply_catalog_price_history (catalog_item_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_supply_catalog_price_history_org_created
  ON public.supply_catalog_price_history (organization_id, created_at DESC);

ALTER TABLE public.supply_catalog_price_history ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS supply_catalog_price_history_org ON public.supply_catalog_price_history;
CREATE POLICY supply_catalog_price_history_org ON public.supply_catalog_price_history
  FOR ALL TO authenticated
  USING (organization_id = public.current_user_org_id())
  WITH CHECK (organization_id = public.current_user_org_id());

CREATE OR REPLACE FUNCTION public.log_supply_catalog_price_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF OLD.last_price IS DISTINCT FROM NEW.last_price THEN
    INSERT INTO public.supply_catalog_price_history (
      organization_id,
      catalog_item_id,
      field,
      old_price,
      new_price,
      changed_by
    ) VALUES (
      NEW.organization_id,
      NEW.id,
      'last_price',
      COALESCE(OLD.last_price, 0),
      COALESCE(NEW.last_price, 0),
      NEW.updated_by
    );
  END IF;

  IF OLD.benchmark_price IS DISTINCT FROM NEW.benchmark_price THEN
    INSERT INTO public.supply_catalog_price_history (
      organization_id,
      catalog_item_id,
      field,
      old_price,
      new_price,
      changed_by
    ) VALUES (
      NEW.organization_id,
      NEW.id,
      'benchmark_price',
      COALESCE(OLD.benchmark_price, 0),
      COALESCE(NEW.benchmark_price, 0),
      NEW.updated_by
    );
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS supply_catalog_items_log_price_change ON public.supply_catalog_items;
CREATE TRIGGER supply_catalog_items_log_price_change
  AFTER UPDATE ON public.supply_catalog_items
  FOR EACH ROW
  EXECUTE PROCEDURE public.log_supply_catalog_price_change();

COMMENT ON TABLE public.supply_catalog_price_history IS
  'Audit log of Central Store last_price / benchmark_price changes.';
