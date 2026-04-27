-- Backfill profile names so Created By / Updated By displays real user names.
-- Run this in Supabase SQL Editor if older users show as blank/unknown.

UPDATE public.profiles p
SET
  full_name = COALESCE(
    NULLIF(p.full_name, ''),
    NULLIF(u.raw_user_meta_data ->> 'full_name', ''),
    u.email
  ),
  updated_at = NOW()
FROM auth.users u
WHERE p.id = u.id
  AND (p.full_name IS NULL OR p.full_name = '');
