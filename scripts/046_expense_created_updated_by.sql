-- Track who created/last updated expense lines and categories.
-- Run after 044_hotel_expenses.sql (and 045 if applied).

ALTER TABLE public.expense_entries
  ADD COLUMN IF NOT EXISTS updated_by UUID REFERENCES auth.users(id);

ALTER TABLE public.expense_categories
  ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS updated_by UUID REFERENCES auth.users(id);

COMMENT ON COLUMN public.expense_entries.recorded_by IS 'User who created this expense line (created_by in the app).';
COMMENT ON COLUMN public.expense_entries.updated_by IS 'User who last edited this expense line.';
