-- Store: accountability — who changed what; issues to outlets/departments; optional receiver
-- Run in Supabase SQL Editor after 029_store_inventory.sql

-- Categories: audit columns
ALTER TABLE public.store_categories
  ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS updated_by UUID REFERENCES auth.users(id);

ALTER TABLE public.store_categories
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();

-- Items: who last edited
ALTER TABLE public.store_items
  ADD COLUMN IF NOT EXISTS updated_by UUID REFERENCES auth.users(id);

-- Movement types: add "issue" (stock issued to an outlet / department)
ALTER TABLE public.store_stock_movements
  DROP CONSTRAINT IF EXISTS store_stock_movements_movement_type_check;

ALTER TABLE public.store_stock_movements
  ADD CONSTRAINT store_stock_movements_movement_type_check
  CHECK (movement_type IN ('in', 'out', 'adjustment', 'sale', 'issue'));

ALTER TABLE public.store_stock_movements
  ADD COLUMN IF NOT EXISTS destination_department TEXT,
  ADD COLUMN IF NOT EXISTS received_by UUID REFERENCES public.profiles(id);

CREATE INDEX IF NOT EXISTS idx_store_movements_destination
  ON public.store_stock_movements (organization_id, destination_department)
  WHERE destination_department IS NOT NULL AND destination_department <> '';

CREATE INDEX IF NOT EXISTS idx_store_movements_created
  ON public.store_stock_movements (organization_id, created_at DESC);

COMMENT ON COLUMN public.store_stock_movements.destination_department IS
  'Outlet/department that received or consumed stock (Restaurant, Main Bar, Housekeeping, etc.).';
COMMENT ON COLUMN public.store_stock_movements.received_by IS
  'Staff member (profile) who acknowledged receipt at the outlet, when recorded.';
