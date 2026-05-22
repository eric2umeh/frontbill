-- Optional packaging / handling fee on take-away outlet orders
ALTER TABLE public.outlet_orders
  ADD COLUMN IF NOT EXISTS takeaway_fee NUMERIC(12, 2) NOT NULL DEFAULT 0 CHECK (takeaway_fee >= 0);

COMMENT ON COLUMN public.outlet_orders.takeaway_fee IS
  'Optional charge for take-away orders (packaging, etc.). Included in subtotal.';
