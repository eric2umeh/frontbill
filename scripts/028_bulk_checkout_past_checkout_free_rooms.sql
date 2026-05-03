-- FrontBill — bulk “checkout” for overdue stays and free occupied rooms (Abuja/Lagos = Africa/Lagos WAT)
--
-- WHAT IT DOES (one transaction):
--   1) Bookings still checked_in with scheduled check_out BEFORE today (WAT) → status checked_out, folio closed.
--   2) Bookings still reserved   with scheduled check_out BEFORE today (WAT) → same (matches real blocks that never converted to checked_in).
--   3) Any room still marked occupied where there is no checked_in on that room and no reserved block
--      that still extends to today or beyond → set room to available (fixes orphan “occupied” rows).
--
-- “Before today” means: calendar check_out is strictly less than today’s date in Africa/Lagos.
-- Guests due out TODAY are not included. To include today, see OPTIONAL block at the bottom.
--
-- HOW TO RUN (Supabase → SQL Editor):
--   1) Run PREVIEW only; confirm rows.
--   2) Run BEGIN…COMMIT once. Check Results / notices for UPDATE counts.
--
-- Optional: uncomment AND b.organization_id / AND r.organization_id lines in APPLY.
--   Use single quotes around the UUID: 'cd97...b2b0'::uuid
--   Do not put ';' until the end of each UPDATE — one semicolon closes the whole statement.

----------------------------------------------------------------------
-- PREVIEW (read-only): bookings that will be closed by steps 1–2
----------------------------------------------------------------------
SELECT
  b.id,
  b.organization_id,
  b.folio_id,
  b.room_id,
  b.check_in,
  b.check_out,
  b.status,
  b.folio_status
FROM public.bookings b
WHERE b.status IN ('checked_in', 'reserved')
  AND COALESCE(b.folio_status, 'active') IS DISTINCT FROM 'checked_out'
  AND b.check_out::date < (timezone('Africa/Lagos', now()))::date
ORDER BY b.check_out ASC, b.folio_id;

----------------------------------------------------------------------
-- PREVIEW (read-only): occupied rooms that would still be freed by step 3 after steps 1–2
-- (Run after you understand step 1–2; or run once before APPLY — shows current orphan-style rows.)
----------------------------------------------------------------------
SELECT
  r.id,
  r.organization_id,
  r.room_number,
  r.status
FROM public.rooms r
WHERE r.status = 'occupied'
  AND NOT EXISTS (
    SELECT 1
    FROM public.bookings b
    WHERE b.room_id = r.id
      AND b.status = 'checked_in'
  )
  AND NOT EXISTS (
    SELECT 1
    FROM public.bookings b
    WHERE b.room_id = r.id
      AND b.status = 'reserved'
      AND b.check_out::date >= (timezone('Africa/Lagos', now()))::date
  );

----------------------------------------------------------------------
-- APPLY — run as a single execution (all statements together)
----------------------------------------------------------------------
BEGIN;

-- 1) Overdue checked-in folios
UPDATE public.bookings b
SET
  status = 'checked_out',
  folio_status = 'checked_out',
  updated_at = now()
WHERE b.status = 'checked_in'
  AND COALESCE(b.folio_status, 'active') IS DISTINCT FROM 'checked_out'
  AND b.check_out::date < (timezone('Africa/Lagos', now()))::date
  -- Optional one hotel: uncomment next line (UUID must be in single quotes)
  -- AND b.organization_id = 'xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx'::uuid
;

-- 2) Overdue reserved folios (room holds past checkout day)
UPDATE public.bookings b
SET
  status = 'checked_out',
  folio_status = 'checked_out',
  updated_at = now()
WHERE b.status = 'reserved'
  AND COALESCE(b.folio_status, 'active') IS DISTINCT FROM 'checked_out'
  AND b.check_out::date < (timezone('Africa/Lagos', now()))::date
  -- AND b.organization_id = 'xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx'::uuid
;

-- 3) Free occupied rooms with no in-house guest and no future-dated reservation on that room
UPDATE public.rooms r
SET
  status = 'available',
  updated_at = now()
WHERE r.status = 'occupied'
  -- AND r.organization_id = 'xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx'::uuid
  AND NOT EXISTS (
    SELECT 1
    FROM public.bookings b
    WHERE b.room_id = r.id
      AND b.status = 'checked_in'
  )
  AND NOT EXISTS (
    SELECT 1
    FROM public.bookings b
    WHERE b.room_id = r.id
      AND b.status = 'reserved'
      AND b.check_out::date >= (timezone('Africa/Lagos', now()))::date
  )
;

COMMIT;

----------------------------------------------------------------------
-- OPTIONAL — include guests whose checkout DATE is TODAY (still checked_in / reserved)
-- Replace the date predicate in ALL THREE UPDATES above:
--   FROM:  b.check_out::date < (timezone('Africa/Lagos', now()))::date
--   TO:    b.check_out::date <= (timezone('Africa/Lagos', now()))::date
----------------------------------------------------------------------
