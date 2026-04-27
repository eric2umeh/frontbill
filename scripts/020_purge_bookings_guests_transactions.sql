-- Permanently delete all bookings, guests, transactions, payments, and folio charges.
-- Use this in Supabase SQL Editor when you want to reset operational guest/booking data.
--
-- Keeps: organizations, rooms, users/profiles, roles, settings.
-- Also resets occupied/reserved rooms back to available.

BEGIN;

-- Remove money/history records first so booking and guest rows are not blocked by FKs.
DELETE FROM public.folio_charges;
DELETE FROM public.payments;
DELETE FROM public.transactions;

-- Remove booking/reservation rows, then guests.
DELETE FROM public.bookings;
DELETE FROM public.guests;

-- Remove individual guest ledger accounts. Organization ledger accounts are kept.
DELETE FROM public.city_ledger_accounts
WHERE COALESCE(account_type, 'individual') IN ('individual', 'guest');

-- Since all bookings/reservations are gone, clear room occupancy states.
UPDATE public.rooms
SET
  status = 'available',
  updated_at = NOW()
WHERE status IN ('occupied', 'reserved');

COMMIT;
