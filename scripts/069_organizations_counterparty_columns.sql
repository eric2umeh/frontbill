-- Counterparty organization fields (NGO / government / corporate city-ledger accounts).
-- The organizations table also holds hotel tenant rows; these columns are nullable for tenants.
-- Run on staging first, then prod after deploy.

ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS org_type TEXT,
  ADD COLUMN IF NOT EXISTS contact_person TEXT,
  ADD COLUMN IF NOT EXISTS current_balance NUMERIC(12, 2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS updated_by UUID REFERENCES auth.users(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.organizations.org_type IS
  'Counterparty type: ngo, government, private, other. Null on hotel tenant rows.';

COMMENT ON COLUMN public.organizations.contact_person IS
  'Primary contact for counterparty organizations (city ledger billing).';

COMMENT ON COLUMN public.organizations.current_balance IS
  'Cached balance owed by counterparty; may be reconciled with city_ledger_accounts.';

COMMENT ON COLUMN public.organizations.created_by IS
  'Staff user who created this counterparty organization row.';
