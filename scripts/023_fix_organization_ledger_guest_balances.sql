-- Organization city-ledger bills belong to the organization account, not the room guest.
-- This prevents guests like "Oluchi Isabella" from showing debt that was posted to
-- an organization ledger such as "ACTION AID AGRIC".

UPDATE public.folio_charges
SET payment_status = 'posted_to_ledger'
WHERE payment_method = 'city_ledger'
  AND ledger_account_type = 'organization'
  AND payment_status IN ('pending', 'unpaid');

UPDATE public.bookings b
SET balance = 0
WHERE EXISTS (
  SELECT 1
  FROM public.folio_charges fc
  WHERE fc.booking_id = b.id
    AND fc.payment_method = 'city_ledger'
    AND fc.ledger_account_type = 'organization'
    AND fc.payment_status = 'posted_to_ledger'
);
