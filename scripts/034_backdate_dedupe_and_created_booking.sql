-- Backdate requests: prevent duplicate pending rows and persist created booking reference.
-- Run the entire file in one go (Supabase SQL Editor: paste all, then Run).

-- 1) Columns (no inline REFERENCES — avoids parser edge cases)
ALTER TABLE public.backdate_requests
  ADD COLUMN IF NOT EXISTS dedupe_key TEXT;

ALTER TABLE public.backdate_requests
  ADD COLUMN IF NOT EXISTS created_booking_id uuid;

COMMENT ON COLUMN public.backdate_requests.dedupe_key IS 'Deterministic key (org|requester|type|dates|room/id) so only one pending request per intent.';
COMMENT ON COLUMN public.backdate_requests.created_booking_id IS 'When approving a booking backdate with payload, server sets this after creating the booking.';

-- 2) Foreign key to bookings (idempotent)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'backdate_requests_created_booking_id_fkey'
      AND conrelid = 'public.backdate_requests'::regclass
  ) THEN
    ALTER TABLE public.backdate_requests
      ADD CONSTRAINT backdate_requests_created_booking_id_fkey
      FOREIGN KEY (created_booking_id)
      REFERENCES public.bookings (id)
      ON DELETE SET NULL;
  END IF;
END
$$;

-- 3) One pending row per dedupe_key per organization
CREATE UNIQUE INDEX IF NOT EXISTS idx_backdate_requests_org_pending_dedupe
  ON public.backdate_requests (organization_id, dedupe_key)
  WHERE status = 'pending' AND dedupe_key IS NOT NULL AND dedupe_key <> '';
