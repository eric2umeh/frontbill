-- Move-dates requests: business date when the change applies (receipts & accounting).
-- Run on staging first, then production after deploy.

ALTER TABLE public.reschedule_stay_requests
  ADD COLUMN IF NOT EXISTS adjustment_date DATE;

COMMENT ON COLUMN public.reschedule_stay_requests.adjustment_date IS
  'Business date front desk chose for this date change (backdate-style posting).';

-- Backfill existing rows from created_at (hotel-local date approximation).
UPDATE public.reschedule_stay_requests
SET adjustment_date = (created_at AT TIME ZONE 'UTC')::date
WHERE adjustment_date IS NULL;
