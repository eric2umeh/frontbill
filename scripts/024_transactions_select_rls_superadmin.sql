-- Let superadmins read all transactions; keep tenant isolation for everyone else.
-- Without this, profiles with NULL organization_id match no rows via IN (...) and the Transactions UI stays empty.

DROP POLICY IF EXISTS "Users can view transactions" ON public.transactions;

CREATE POLICY "Users can view transactions" ON public.transactions
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
      AND (
        p.role = 'superadmin'
        OR (p.organization_id IS NOT NULL AND public.transactions.organization_id = p.organization_id)
      )
    )
  );
