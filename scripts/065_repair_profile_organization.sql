-- Link staff profiles missing organization_id (run on staging first, then prod).
-- Replace the UUIDs below with your values from Supabase:
--   organizations.id  → Table Editor → organizations
--   auth.users.id     → Authentication → Users (or profiles.id)

-- Example: link one user to Pilot Plaza org
-- UPDATE public.profiles
-- SET organization_id = '00000000-0000-0000-0000-000000000001'::uuid
-- WHERE id = 'YOUR-USER-UUID-HERE'::uuid
--   AND organization_id IS NULL;

-- Preview users missing an org:
SELECT p.id, p.full_name, p.role, p.organization_id, u.email
FROM public.profiles p
LEFT JOIN auth.users u ON u.id = p.id
WHERE p.organization_id IS NULL
ORDER BY p.created_at DESC;
