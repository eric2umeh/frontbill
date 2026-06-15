-- Restore safe self-profile reads after 062 removed the recursive org-wide policy.
-- Existing RLS policies and client bootstraps still use:
--   SELECT organization_id FROM public.profiles WHERE id = auth.uid()
-- A self-only policy satisfies those lookups without re-entering profiles via an
-- organization-wide profiles policy.

DROP POLICY IF EXISTS "Profiles are viewable by the user" ON public.profiles;

CREATE POLICY "Profiles are viewable by the user" ON public.profiles
  FOR SELECT USING (auth.uid() = id);
