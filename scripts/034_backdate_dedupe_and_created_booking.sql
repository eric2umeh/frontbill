-- Backdate requests: prevent duplicate pending rows and persist created booking reference.

ALTER TABLE public.backdate_requests
  ADD COLUMN IF NOT EXISTS dedupe_key TEXT;

ALTER TABLE public.backdate_requests
  ADD COLUMN IF NOT EXISTS created_booking_id UUID REFERENCES public.bookings(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.backdate_requests.dedupe_key IS 'Deterministic key (org|requester|type|dates|room/id) so only one pending request per intent.';
COMMENT ON COLUMN public.backdate_requests.created_booking_id IS 'When approving a booking backdate with payload, server sets this after creating the booking.';

CREATE UNIQUE INDEX IF NOT EXISTS idx_backdate_requests_org_pending_dedupe
ON public.backdate_requests (organization_id, dedupe_key)
WHERE status = 'pending' AND dedupe_key IS NOT NULL AND dedupe_key <> '';
