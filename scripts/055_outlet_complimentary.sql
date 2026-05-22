-- Complimentary (no charge) outlet orders — staff comps for guest/client
ALTER TABLE public.outlet_orders
  ADD COLUMN IF NOT EXISTS is_complimentary BOOLEAN NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN public.outlet_orders.is_complimentary IS
  'When true, order total is zero; no payment or city ledger charge is posted.';
