-- Allow multiple expense lines per category per day (form-based ledger UX).
-- Run after 044_hotel_expenses.sql

ALTER TABLE public.expense_entries
  DROP CONSTRAINT IF EXISTS expense_entries_organization_id_expense_date_category_id_key;

DROP INDEX IF EXISTS expense_entries_organization_id_expense_date_category_id_key;

CREATE INDEX IF NOT EXISTS idx_expense_entries_org_created
  ON public.expense_entries (organization_id, created_at DESC);
