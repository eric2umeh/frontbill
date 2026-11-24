-- Shrink Realtime egress for org-live tables (bookings, outlet menus, catalog).
-- scripts/084 set REPLICA IDENTITY FULL so every UPDATE shipped the full row
-- (notes, menu fields, catalog columns) to every subscribed dashboard.
-- Primary keys already exist; DEFAULT keeps Realtime filters working and clients
-- re-fetch via their normal APIs after the change signal.
--
-- Run in Supabase SQL Editor on staging first, then production after deploy.
-- Safe to re-run. Pair with scripts/085 for supply_chain_snapshots.

ALTER TABLE public.bookings REPLICA IDENTITY DEFAULT;
ALTER TABLE public.outlet_menu_items REPLICA IDENTITY DEFAULT;
ALTER TABLE public.outlet_menu_categories REPLICA IDENTITY DEFAULT;
ALTER TABLE public.supply_catalog_items REPLICA IDENTITY DEFAULT;
