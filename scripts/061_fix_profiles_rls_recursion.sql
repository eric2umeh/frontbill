-- Fix "infinite recursion detected in policy for relation profiles" (introduced when
-- script 060 subqueried profiles inside a profiles SELECT policy).
-- Payments, rooms, and other tables that read profiles.organization_id hit this loop.

CREATE OR REPLACE FUNCTION public.current_user_org_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT organization_id FROM public.profiles WHERE id = auth.uid()
$$;

REVOKE ALL ON FUNCTION public.current_user_org_id() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.current_user_org_id() TO authenticated;
GRANT EXECUTE ON FUNCTION public.current_user_org_id() TO service_role;

-- Do NOT add a profiles SELECT policy that calls current_user_org_id() — that still
-- causes infinite recursion when other tables' old policies subquery profiles.
-- Run 062_rls_use_current_user_org_id.sql after this script.
