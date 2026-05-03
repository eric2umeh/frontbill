-- FrontBill: close bookings that stayed "checked_in" after scheduled checkout (rooms stuck occupied).
--
-- WHY: Manual checkout was hidden after 14:00 local time on/over departure day (assuming cron ran).
--      If cron missed/failed or dates drifted, staff had no "Check out" in the UI.
--
-- SAFE USE (Supabase Dashboard):
--   STEP 1 — SQL Editor: paste and run ONLY the first SELECT (lines marked PREVIEW A).
--           Confirm the folios listed are the ones you mean to close.
--   STEP 2 — New query or same tab: run the BEGIN…COMMIT block (APPLY) once.
--           If you have several hotels in one project, uncomment organization_id in APPLY.
--
-- Uses Africa/Lagos (WAT). Change the timezone literal if needed.
--
-- PREVIEW A: strictly *before* today's date in Lagos (yesterday and earlier).
-- PREVIEW B: same but includes checkout *today* — use if guests were due out today and are still checked_in.

----------------------------------------------------------------------
-- PREVIEW A (read-only): checked_in, folio not closed, checkout date BEFORE today (WAT)
----------------------------------------------------------------------
SELECT
  b.id,
  b.organization_id,
  b.folio_id,
  b.room_id,
  b.check_out,
  b.status,
  b.folio_status,
  r.room_number,
  r.status AS room_row_status
FROM public.bookings b
LEFT JOIN public.rooms r ON r.id = b.room_id
WHERE b.status = 'checked_in'
  AND COALESCE(b.folio_status, 'active') IS DISTINCT FROM 'checked_out'
  AND b.check_out::date < (timezone('Africa/Lagos', now()))::date;

----------------------------------------------------------------------
-- PREVIEW B (read-only): include departures due TODAY (still checked_in)
----------------------------------------------------------------------
/*
SELECT
  b.id,
  b.organization_id,
  b.folio_id,
  b.room_id,
  b.check_out,
  b.status,
  b.folio_status,
  r.room_number,
  r.status AS room_row_status
FROM public.bookings b
LEFT JOIN public.rooms r ON r.id = b.room_id
WHERE b.status = 'checked_in'
  AND COALESCE(b.folio_status, 'active') IS DISTINCT FROM 'checked_out'
  AND b.check_out::date <= (timezone('Africa/Lagos', now()))::date;
*/

----------------------------------------------------------------------
-- DIAGNOSTIC: rooms marked occupied but no active checked_in booking on that room
----------------------------------------------------------------------
/*
SELECT r.id, r.room_number, r.status, r.organization_id
FROM public.rooms r
WHERE r.status = 'occupied'
  AND NOT EXISTS (
    SELECT 1 FROM public.bookings b
    WHERE b.room_id = r.id AND b.status = 'checked_in'
  );
*/



----------------------------------------------------------------------
-- OPTIONAL: orphan rooms shown as occupied with no checked_in booking — fix room row only (read, then apply)
----------------------------------------------------------------------
/*
-- Preview orphaned occupied rooms:
SELECT id, organization_id, room_number, status FROM public.rooms
WHERE status = 'occupied'
  AND NOT EXISTS (
    SELECT 1 FROM public.bookings b
    WHERE b.room_id = rooms.id AND b.status = 'checked_in'
  );

-- Set them available (safe if preview matches your expectation):
UPDATE public.rooms
SET status = 'available', updated_at = now()
WHERE status = 'occupied'
  AND NOT EXISTS (
    SELECT 1 FROM public.bookings b
    WHERE b.room_id = rooms.id AND b.status = 'checked_in'
  );
*/
----------------------------------------------------------------------
-- APPLY: close those folios + set referenced rooms available when safe
----------------------------------------------------------------------
BEGIN;

WITH stuck AS (
  SELECT b.id AS booking_id,
         b.room_id
  FROM public.bookings b
  WHERE b.status = 'checked_in'
    AND COALESCE(b.folio_status, 'active') IS DISTINCT FROM 'checked_out'
    -- Pick ONE of the next two lines (< = only past dates, <= = includes today in Lagos)
    AND b.check_out::date < (timezone('Africa/Lagos', now()))::date
    -- AND b.check_out::date <= (timezone('Africa/Lagos', now()))::date
  -- Optional: restrict to one property
  -- AND b.organization_id = 'YOUR-HOTEL-UUID'::uuid
),
closed AS (
  UPDATE public.bookings b
  SET status = 'checked_out',
      folio_status = 'checked_out',
      updated_at = now()
  FROM stuck s
  WHERE b.id = s.booking_id
  RETURNING b.room_id
)
UPDATE public.rooms r
SET status = 'available',
    updated_at = now()
WHERE r.id IS NOT NULL
  AND r.id IN (SELECT room_id FROM closed WHERE room_id IS NOT NULL)
  AND NOT EXISTS (
    SELECT 1
    FROM public.bookings b2
    WHERE b2.room_id = r.id
      AND b2.status = 'checked_in'
  );

-- Review row counts in the Messages tab before committing.
COMMIT;
