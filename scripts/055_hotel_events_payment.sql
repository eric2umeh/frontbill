-- Event payment + staff remarks (replaces internal notes on the form)
-- Run in Supabase SQL Editor after 054_hotel_events.sql

ALTER TABLE public.hotel_events
  ADD COLUMN IF NOT EXISTS payment_method TEXT,
  ADD COLUMN IF NOT EXISTS payment_status TEXT
    CHECK (payment_status IS NULL OR payment_status IN ('paid', 'partial', 'pending')),
  ADD COLUMN IF NOT EXISTS amount_paid NUMERIC(12, 2) DEFAULT 0 CHECK (amount_paid >= 0),
  ADD COLUMN IF NOT EXISTS balance NUMERIC(12, 2) DEFAULT 0 CHECK (balance >= 0),
  ADD COLUMN IF NOT EXISTS remarks TEXT;

COMMENT ON COLUMN public.hotel_events.payment_method IS 'cash, pos, card, transfer';
COMMENT ON COLUMN public.hotel_events.payment_status IS 'paid = full, partial, pending = none yet';
COMMENT ON COLUMN public.hotel_events.amount_paid IS 'Deposit / amount received at booking';
COMMENT ON COLUMN public.hotel_events.balance IS 'Estimated value minus amount paid';
COMMENT ON COLUMN public.hotel_events.remarks IS 'Optional staff remarks for managers and night audit';
