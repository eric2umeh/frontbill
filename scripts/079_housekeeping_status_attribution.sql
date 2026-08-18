-- Add HK status attribution columns if 078 was run before this section existed.
-- Safe to re-run. Staging first, then prod after deploy.

ALTER TABLE public.rooms
  ADD COLUMN IF NOT EXISTS housekeeping_status_updated_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS housekeeping_status_updated_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS housekeeping_status_updated_by_name TEXT;
