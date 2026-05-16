-- Hotel business date (advanced by night audit). Run in Supabase SQL Editor.

ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS business_date DATE;

COMMENT ON COLUMN public.organizations.business_date IS
  'Active hotel business day for postings; set to closed audit date + 1 after night audit.';
