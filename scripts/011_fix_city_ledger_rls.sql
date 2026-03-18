-- Fix RLS for city_ledger_accounts so all authenticated org staff can
-- insert and update accounts (needed when add-charge/extend-stay creates accounts automatically)

-- Drop overly-restrictive insert policy
DROP POLICY IF EXISTS "Managers can manage city ledger accounts" ON city_ledger_accounts;

-- Allow ALL authenticated org staff to insert city ledger accounts
CREATE POLICY "Staff can create city ledger accounts" ON city_ledger_accounts
  FOR INSERT WITH CHECK (
    organization_id IN (
      SELECT organization_id FROM profiles WHERE id = auth.uid()
    )
  );

-- Allow ALL authenticated org staff to update city ledger accounts
CREATE POLICY "Staff can update city ledger accounts" ON city_ledger_accounts
  FOR UPDATE USING (
    organization_id IN (
      SELECT organization_id FROM profiles WHERE id = auth.uid()
    )
  );
