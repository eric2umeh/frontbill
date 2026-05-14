-- Repair `profiles.added_by` after an older run of 019 that only considered
-- `role = 'admin'`, which attributed everyone (including superadmins) to the
-- first Administrator instead of the actual org owner / superadmin.
--
-- Run once in the Supabase SQL editor if "Added by" shows the wrong staff member.
--
-- **Warning:** This overwrites `added_by` for every profile in each organization with
-- one heuristic "org primary" user. Do not run if you rely on accurate per-invite
-- attribution from the app API.

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
-- Single statement so the CTE stays in scope (Postgres does not carry WITH across statements).
UPDATE public.profiles p
SET
  added_by = CASE
    WHEN p.id = op.creator_id THEN p.id
    ELSE op.creator_id
  END,
  updated_at = NOW()
FROM org_primary op
WHERE p.organization_id = op.organization_id;
