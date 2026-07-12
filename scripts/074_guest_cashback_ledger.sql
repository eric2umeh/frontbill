-- Guest cashback balances and transaction ledger.
-- Run after 073_no_show_cashback_policy.sql.

CREATE TABLE IF NOT EXISTS guest_cashback_balances (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  guest_id UUID NOT NULL REFERENCES guests(id) ON DELETE CASCADE,
  earned_total NUMERIC(14,2) NOT NULL DEFAULT 0,
  redeemed_total NUMERIC(14,2) NOT NULL DEFAULT 0,
  balance NUMERIC(14,2) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (organization_id, guest_id)
);

CREATE TABLE IF NOT EXISTS cashback_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  guest_id UUID NOT NULL REFERENCES guests(id) ON DELETE CASCADE,
  txn_type TEXT NOT NULL CHECK (txn_type IN ('earn', 'redeem', 'adjust')),
  amount NUMERIC(14,2) NOT NULL CHECK (amount > 0),
  balance_after NUMERIC(14,2) NOT NULL DEFAULT 0,
  source_type TEXT,
  source_id TEXT,
  description TEXT,
  payment_method TEXT,
  created_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_guest_cashback_balances_org_guest
  ON guest_cashback_balances (organization_id, guest_id);

CREATE INDEX IF NOT EXISTS idx_cashback_transactions_org_guest_created
  ON cashback_transactions (organization_id, guest_id, created_at DESC);

ALTER TABLE guest_cashback_balances ENABLE ROW LEVEL SECURITY;
ALTER TABLE cashback_transactions ENABLE ROW LEVEL SECURITY;

-- Idempotent: safe to re-run if policies already exist from a partial run.
DROP POLICY IF EXISTS "guest_cashback_balances_select_org" ON public.guest_cashback_balances;
DROP POLICY IF EXISTS "guest_cashback_balances_insert_org" ON public.guest_cashback_balances;
DROP POLICY IF EXISTS "guest_cashback_balances_update_org" ON public.guest_cashback_balances;
DROP POLICY IF EXISTS "cashback_transactions_select_org" ON public.cashback_transactions;
DROP POLICY IF EXISTS "cashback_transactions_insert_org" ON public.cashback_transactions;

CREATE POLICY "guest_cashback_balances_select_org"
  ON guest_cashback_balances FOR SELECT
  USING (organization_id = public.current_user_org_id());

CREATE POLICY "guest_cashback_balances_insert_org"
  ON guest_cashback_balances FOR INSERT
  WITH CHECK (organization_id = public.current_user_org_id());

CREATE POLICY "guest_cashback_balances_update_org"
  ON guest_cashback_balances FOR UPDATE
  USING (organization_id = public.current_user_org_id());

CREATE POLICY "cashback_transactions_select_org"
  ON cashback_transactions FOR SELECT
  USING (organization_id = public.current_user_org_id());

CREATE POLICY "cashback_transactions_insert_org"
  ON cashback_transactions FOR INSERT
  WITH CHECK (organization_id = public.current_user_org_id());
