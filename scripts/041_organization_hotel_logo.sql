-- Hotel branding: public logo URL stored on the tenant row (uploaded via /api/organizations/logo, Superadmin only).
-- Run in Supabase SQL Editor after prior migrations.

ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS logo_url TEXT;

COMMENT ON COLUMN public.organizations.logo_url IS 'Public HTTPS URL for hotel logo (e.g. Supabase Storage). Shown in app shell, login (when cached), and tab icon.';

-- Storage bucket for logo files (service role uploads from API; public read for <img> / favicon).
-- Optional: in Dashboard → Storage, set a 2 MB limit and allow PNG/JPEG/WebP/GIF only.
INSERT INTO storage.buckets (id, name, public)
VALUES ('hotel-logos', 'hotel-logos', true)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "Public read hotel logos" ON storage.objects;
CREATE POLICY "Public read hotel logos"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'hotel-logos');
