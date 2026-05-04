-- FrontBill — Fix rooms missing from booking pickers (205, 206, 208, 310 examples)
--
-- HOW TO RUN (Supabase SQL Editor)
--   1) Run ONLY the single UPDATE statement in section B below — do not paste partial lines.
--   2) Replace the GUID inside CAST(' … ' AS uuid) with your hotels organizations.id,
--      Example: CAST('a1b2c3d4-e5f6-7890-abcd-ef1234567890' AS uuid)
--   3) Keep the GUID inside single ASCII quotes '. Curly/smart quotes break SQL.
--
-- If you see ERROR near "uuid", you ran a snippet (often ::uuid without the opening quote).

-- ── A) Find your organization id ─────────────────────────────────────
-- SELECT id, name FROM public.organizations ORDER BY created_at DESC;

-- ── B) DIAGNOSTIC (optional) — uncomment, set GUID in CAST(...), run once ──
--
-- SELECT id, organization_id, room_number, length(trim(room_number::text)),
--        room_type, status
-- FROM public.rooms
-- WHERE organization_id = CAST('REPLACE_WITH_YOUR_ORG_UUID' AS uuid)
--   AND regexp_replace(trim(both from coalesce(room_number::text, '')), '[^0-9]', '', 'g')
--       IN ('205','206','208','310');

-- ── C) APPLY FIX — Edit CAST only, then highlight from UPDATE through the semicolon and Run ──

UPDATE public.rooms r
SET
  room_number = trim(both from regexp_replace(trim(both from coalesce(r.room_number::text, '')), '[[:space:]]+', ' ', 'g')),
  room_type = CASE
    WHEN trim(both from regexp_replace(trim(both from coalesce(r.room_type::text, '')), '[[:space:]]+', ' ', 'g')) = ''
    THEN 'Standard'
    ELSE trim(both from regexp_replace(trim(both from coalesce(r.room_type::text, '')), '[[:space:]]+', ' ', 'g'))
  END,
  status = CASE
    WHEN lower(trim(both from coalesce(r.status::text, ''))) = 'maintenance' THEN 'maintenance'
    ELSE 'available'
  END,
  updated_at = now()
WHERE r.organization_id = CAST('REPLACE_WITH_YOUR_ORG_UUID' AS uuid)
  AND regexp_replace(trim(both from coalesce(r.room_number::text, '')), '[^0-9]', '', 'g')
      IN ('205', '206', '208', '310');
