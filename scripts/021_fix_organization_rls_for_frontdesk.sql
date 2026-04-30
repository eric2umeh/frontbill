-- Allow same-organization staff, including Front Desk, to create organizations
-- from the Organizations menu while keeping reads scoped to their hotel.

DROP POLICY IF EXISTS "Users can view their organization" ON public.organizations;
DROP POLICY IF EXISTS "Users can view organizations in their hotel" ON public.organizations;
DROP POLICY IF EXISTS "Team members can create organizations" ON public.organizations;

CREATE POLICY "Users can view organizations in their hotel" ON public.organizations
  FOR SELECT USING (
    id IN (
      SELECT p.organization_id
      FROM public.profiles p
      WHERE p.id = auth.uid()
    )
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

CREATE POLICY "Team members can create organizations" ON public.organizations
  FOR INSERT WITH CHECK (
    created_by = auth.uid()
    AND created_by IN (
      SELECT p.id
      FROM public.profiles p
      WHERE p.organization_id IS NOT NULL
        AND p.role IN ('admin', 'manager', 'front_desk')
    )
  );
