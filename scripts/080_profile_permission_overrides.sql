-- =============================================================
-- 080 — Per-user permission overrides (grants / denies)
-- Run in Supabase SQL Editor (staging first, then prod after deploy)
-- Admin / Superadmin can customize checkboxes in Users & Roles.
-- =============================================================

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS permission_overrides JSONB DEFAULT NULL;

COMMENT ON COLUMN public.profiles.permission_overrides IS
  'Optional { "grants": ["perm:key"], "denies": ["perm:key"] } overlay on role defaults.';
