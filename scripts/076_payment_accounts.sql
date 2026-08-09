-- Payment destination accounts (POS / bank transfer destinations per hotel).
-- Run in Supabase SQL Editor after deploy. Staging first, then prod.
-- Used so staff must pick where POS/transfer money landed (audit for owners).

CREATE TABLE IF NOT EXISTS payment_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  bank_name TEXT NOT NULL,
  account_number TEXT NOT NULL,
  account_name TEXT NOT NULL,
  -- Display label snapshot preferred at write time; kept in sync on save
  label TEXT NOT NULL,
  -- Which payment methods this destination applies to
  kind TEXT NOT NULL DEFAULT 'both'
    CHECK (kind IN ('pos', 'transfer', 'both')),
  is_active BOOLEAN NOT NULL DEFAULT true,
  sort_order INT NOT NULL DEFAULT 0,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_payment_accounts_org_active
  ON payment_accounts (organization_id, is_active, sort_order);

COMMENT ON TABLE payment_accounts IS
  'Hotel bank/POS destinations selectable when payment_method is pos or transfer.';

ALTER TABLE payments
  ADD COLUMN IF NOT EXISTS payment_account_id UUID REFERENCES payment_accounts(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS payment_account_label TEXT;

ALTER TABLE transactions
  ADD COLUMN IF NOT EXISTS payment_account_id UUID REFERENCES payment_accounts(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS payment_account_label TEXT;

CREATE INDEX IF NOT EXISTS idx_payments_payment_account
  ON payments (organization_id, payment_account_id);

CREATE INDEX IF NOT EXISTS idx_transactions_payment_account
  ON transactions (organization_id, payment_account_id);

ALTER TABLE payment_accounts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS payment_accounts_select_org ON payment_accounts;
CREATE POLICY payment_accounts_select_org ON payment_accounts
  FOR SELECT
  USING (
    organization_id IN (
      SELECT organization_id FROM profiles WHERE id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid()
        AND lower(coalesce(p.role, '')) IN ('superadmin', 'super_admin')
    )
  );

DROP POLICY IF EXISTS payment_accounts_write_org ON payment_accounts;
CREATE POLICY payment_accounts_write_org ON payment_accounts
  FOR ALL
  USING (
    organization_id IN (
      SELECT organization_id FROM profiles WHERE id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid()
        AND lower(coalesce(p.role, '')) IN ('superadmin', 'super_admin')
    )
  )
  WITH CHECK (
    organization_id IN (
      SELECT organization_id FROM profiles WHERE id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid()
        AND lower(coalesce(p.role, '')) IN ('superadmin', 'super_admin')
    )
  );
