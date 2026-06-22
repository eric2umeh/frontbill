-- Fix organizations + city_ledger RLS after 062: stop subquerying profiles from client RLS
-- (profiles SELECT was empty → tenant scoping and ledger reads failed).
-- Uses SECURITY DEFINER helpers from 061. Run after 070 on staging, then prod.

CREATE OR REPLACE FUNCTION public.profile_belongs_to_current_hotel(profile_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles p
    WHERE p.id = profile_user_id
      AND p.organization_id IS NOT NULL
      AND p.organization_id = public.current_user_org_id()
  );
$$;

REVOKE ALL ON FUNCTION public.profile_belongs_to_current_hotel(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.profile_belongs_to_current_hotel(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.profile_belongs_to_current_hotel(uuid) TO service_role;

-- ── organizations SELECT ──
DROP POLICY IF EXISTS "Users can view organizations in their hotel" ON public.organizations;
DROP POLICY IF EXISTS "Users can view their organization" ON public.organizations;

CREATE POLICY "Users can view organizations in their hotel" ON public.organizations
  FOR SELECT
  USING (
    id = public.current_user_org_id()
    OR created_by = auth.uid()
    OR public.profile_belongs_to_current_hotel(created_by)
  );

-- ── city_ledger_accounts ──
DROP POLICY IF EXISTS "Users can view city ledger accounts" ON public.city_ledger_accounts;
DROP POLICY IF EXISTS "Staff can create city ledger accounts" ON public.city_ledger_accounts;
DROP POLICY IF EXISTS "Staff can update city ledger accounts" ON public.city_ledger_accounts;
DROP POLICY IF EXISTS "Managers can manage city ledger accounts" ON public.city_ledger_accounts;

CREATE POLICY "Users can view city ledger accounts" ON public.city_ledger_accounts
  FOR SELECT
  USING (organization_id = public.current_user_org_id());

CREATE POLICY "Staff can create city ledger accounts" ON public.city_ledger_accounts
  FOR INSERT
  WITH CHECK (organization_id = public.current_user_org_id());

CREATE POLICY "Staff can update city ledger accounts" ON public.city_ledger_accounts
  FOR UPDATE
  USING (organization_id = public.current_user_org_id());
