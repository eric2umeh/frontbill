-- Allow cashiers to override line price at POS for items in selected categories (order only; menu price unchanged).

ALTER TABLE public.outlet_menu_categories
  ADD COLUMN IF NOT EXISTS price_editable BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN public.outlet_menu_categories.price_editable IS
  'When true, POS can adjust unit price per order for items in this category (not saved to menu).';
