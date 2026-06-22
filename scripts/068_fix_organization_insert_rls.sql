-- Fix counterparty organization creation for Superadmin / display-label roles.
-- Run on staging first, then prod after deploy.

CREATE OR REPLACE FUNCTION public.profile_role_can_create_organizations()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles p
    WHERE p.id = auth.uid()
      AND p.organization_id IS NOT NULL
      AND lower(regexp_replace(trim(coalesce(p.role, '')), '[\s-]+', '_', 'g')) IN (
        'superadmin',
        'super_admin',
        'super_administrator',
        'superadministrator',
        'platform_admin',
        'owner',
        'admin',
        'administrator',
        'manager',
        'front_desk',
        'frontdesk',
        'front_office',
        'frontoffice'
      )
  );
$$;

DROP POLICY IF EXISTS "Team members can create organizations" ON public.organizations;

CREATE POLICY "Team members can create organizations" ON public.organizations
  FOR INSERT
  WITH CHECK (
    created_by = auth.uid()
    AND public.profile_role_can_create_organizations()
  );
