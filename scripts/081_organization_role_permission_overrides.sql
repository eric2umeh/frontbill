-- =============================================================
-- 081 — Organization role permission overrides (Admin / Superadmin)
-- Run in Supabase SQL Editor (staging first, then prod after deploy)
-- Customizes default permissions per role for the whole hotel.
-- =============================================================

ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS role_permission_overrides JSONB DEFAULT NULL;

COMMENT ON COLUMN public.organizations.role_permission_overrides IS
  'Optional map of role key → { grants, denies } overlay on lib/permissions role defaults.';
