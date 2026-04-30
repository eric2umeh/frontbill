-- One-time / optional: close RESERVED bookings whose checkout date is before today (Africa/Lagos)
-- and set those rooms to available. Preserves each booking's original check_out date.
-- Run in Supabase SQL Editor when many bulk "reserved" folios stayed open after checkout day.

WITH due AS (
  SELECT id, room_id
  FROM public.bookings
  WHERE status = 'reserved'
    AND check_out::date < (timezone('Africa/Lagos', now()))::date
),
closed AS (
  UPDATE public.bookings b
  SET
    status = 'checked_out',
    folio_status = 'checked_out',
    updated_at = now()
  FROM due d
  WHERE b.id = d.id
  RETURNING b.room_id
)
UPDATE public.rooms r
SET status = 'available', updated_at = now()
WHERE r.id IN (SELECT room_id FROM closed WHERE room_id IS NOT NULL);
