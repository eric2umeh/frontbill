-- Allow bulk reservation backdate requests (bulk booking type already exists).
-- Run on staging first, then prod after deploy.

ALTER TABLE public.backdate_requests
  DROP CONSTRAINT IF EXISTS backdate_requests_request_type_check;

ALTER TABLE public.backdate_requests
  ADD CONSTRAINT backdate_requests_request_type_check
  CHECK (request_type IN ('booking', 'reservation', 'bulk_booking', 'bulk_reservation'));
