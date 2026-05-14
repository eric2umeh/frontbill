-- Track which staff member created each user profile.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS added_by UUID REFERENCES auth.users(id);

-- Existing users predate this audit field. Pick one "org primary" profile per
-- organization as the stand-in creator: **superadmin first**, then admin,
-- then any role (oldest `created_at` wins within that tier). This avoids the
-- bug where only `role = 'admin'` was considered and real creators stored as
-- `superadmin` were skipped—so the first Administrator looked like they added everyone.
WITH ranked AS (
  SELECT
    id,
    organization_id,
    ROW_NUMBER() OVER (
      PARTITION BY organization_id
      ORDER BY
        CASE lower(trim(role))
          WHEN 'superadmin' THEN 0
          WHEN 'super_admin' THEN 0
          WHEN 'admin' THEN 1
          WHEN 'administrator' THEN 1
          ELSE 2
        END,
        created_at ASC
    ) AS rn
  FROM public.profiles
  WHERE organization_id IS NOT NULL
),
org_primary AS (
  SELECT organization_id, id AS creator_id
  FROM ranked
  WHERE rn = 1
)
UPDATE public.profiles p
SET added_by = op.creator_id
FROM org_primary op
WHERE p.added_by IS NULL
  AND p.organization_id = op.organization_id
  AND p.id <> op.creator_id;

UPDATE public.profiles p
SET added_by = p.id
WHERE added_by IS NULL
  AND organization_id IS NOT NULL;
