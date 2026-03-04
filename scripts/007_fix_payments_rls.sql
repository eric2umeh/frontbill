-- Fix payments RLS: allow all authenticated staff to insert payments
-- Root cause: previous policy restricted INSERT to only admin/accountant roles,
-- causing silent failures when receptionist/manager/staff created bookings.

-- Drop old restrictive INSERT policy
DROP POLICY IF EXISTS "Accountants can create payments" ON payments;

-- New policy: any user belonging to the same organization can insert payments
CREATE POLICY "Staff can create payments" ON payments
  FOR INSERT WITH CHECK (
    organization_id IN (
      SELECT organization_id FROM profiles WHERE id = auth.uid()
    )
  );

-- Also fix UPDATE policy to allow broader roles
DROP POLICY IF EXISTS "Accountants can update payments" ON payments;

CREATE POLICY "Staff can update payments" ON payments
  FOR UPDATE USING (
    organization_id IN (
      SELECT organization_id FROM profiles WHERE id = auth.uid()
    )
  );

-- Ensure DELETE is restricted to admin only
DROP POLICY IF EXISTS "Admin can delete payments" ON payments;

CREATE POLICY "Admin can delete payments" ON payments
  FOR DELETE USING (
    organization_id IN (
      SELECT organization_id FROM profiles
      WHERE id = auth.uid() AND role = 'admin'
    )
  );
