-- Enable Supabase Realtime for cross-user live sync (outlets, supply, bookings).
-- Run in Supabase SQL Editor on staging first, then production after deploy.
--
-- Note: supply_chain_snapshots originally used REPLICA IDENTITY FULL here; that
-- shipped huge JSONB payloads over Realtime. Prefer scripts/085_realtime_supply_snapshots_default_identity.sql
-- after this script (DEFAULT identity + client re-fetch via /api/supply/state?keys=…).

ALTER TABLE public.supply_chain_snapshots REPLICA IDENTITY FULL;
ALTER TABLE public.supply_catalog_items REPLICA IDENTITY FULL;
ALTER TABLE public.outlet_menu_items REPLICA IDENTITY FULL;
ALTER TABLE public.outlet_menu_categories REPLICA IDENTITY FULL;
ALTER TABLE public.bookings REPLICA IDENTITY FULL;

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.supply_chain_snapshots;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.supply_catalog_items;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.outlet_menu_items;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.outlet_menu_categories;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.bookings;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
