-- Allow staff to delete transactions in their hotel (client delete was blocked — no DELETE policy).
-- Prefer the admin DELETE API for city-ledger cleanup; this restores direct client deletes too.

DROP POLICY IF EXISTS "Staff can delete transactions" ON public.transactions;
CREATE POLICY "Staff can delete transactions" ON public.transactions
  FOR DELETE
  USING (
    organization_id = public.current_user_org_id()
    AND EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.organization_id = public.current_user_org_id()
        AND p.role IN ('admin', 'superadmin', 'manager', 'accountant')
    )
  );
