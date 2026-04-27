-- Track which staff member created each user profile.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS added_by UUID REFERENCES auth.users(id);

-- Existing users predate this audit field. Mark the first admin in each
-- organization as the creator where possible so the UI has a meaningful name.
WITH org_admins AS (
  SELECT DISTINCT ON (organization_id)
    organization_id,
    id AS admin_id
  FROM public.profiles
  WHERE organization_id IS NOT NULL
    AND role = 'admin'
  ORDER BY organization_id, created_at ASC
)
UPDATE public.profiles p
SET added_by = org_admins.admin_id
FROM org_admins
WHERE p.added_by IS NULL
  AND p.organization_id = org_admins.organization_id;

UPDATE public.profiles
SET added_by = id
WHERE added_by IS NULL
  AND organization_id IS NOT NULL;
