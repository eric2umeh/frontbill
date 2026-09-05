-- Shrink Realtime egress for supply snapshots.
-- REPLICA IDENTITY FULL (from 084) shipped the entire JSONB `data` blob on every UPDATE
-- over the Realtime websocket. Primary key already includes organization_id, so filters
-- still work with DEFAULT and clients only get a "row changed" signal — then they
-- fetch via /api/supply/state?keys=… (partial).
--
-- Run in Supabase SQL Editor on staging first, then production after deploy.

ALTER TABLE public.supply_chain_snapshots REPLICA IDENTITY DEFAULT;
