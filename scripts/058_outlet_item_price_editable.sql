-- Per-item flexible POS pricing (e.g. "Rice only" priced with the main plate).
ALTER TABLE public.outlet_menu_items
  ADD COLUMN IF NOT EXISTS price_editable BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN public.outlet_menu_items.price_editable IS
  'When true, POS cashiers may enter the unit price per order line (use unit_price 0 for price-at-sale items).';
