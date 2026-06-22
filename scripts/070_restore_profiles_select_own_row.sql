-- Restore reading your own profile row from the browser (dropped by 062 without replacement).
-- Safe: id = auth.uid() only — no subquery on profiles, no recursion.
-- Run on staging first, then prod after deploy.

DROP POLICY IF EXISTS "Profiles are viewable by the user" ON public.profiles;
DROP POLICY IF EXISTS "Users can view own profile" ON public.profiles;

CREATE POLICY "Users can view own profile" ON public.profiles
  FOR SELECT
  USING (id = auth.uid());

COMMENT ON POLICY "Users can view own profile" ON public.profiles IS
  'Browser client reads organization_id/role for the signed-in user. Team lists use /api/admin/users/list.';
