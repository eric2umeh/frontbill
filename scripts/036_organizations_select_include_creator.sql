-- Organization menu visibility: creators can always read rows they created (superadmin / NULL org_id edge case).
-- Run in Supabase SQL Editor after 021_fix_organization_rls_for_frontdesk.sql

DROP POLICY IF EXISTS "Users can view organizations in their hotel" ON public.organizations;

CREATE POLICY "Users can view organizations in their hotel" ON public.organizations
  FOR SELECT USING (
    id IN (
      SELECT p.organization_id
      FROM public.profiles p
      WHERE p.id = auth.uid()
    )
    OR created_by = auth.uid()
    OR created_by IN (
      SELECT p.id
      FROM public.profiles p
      WHERE p.organization_id = (
        SELECT current_profile.organization_id
        FROM public.profiles current_profile
        WHERE current_profile.id = auth.uid()
      )
    )
  );
