-- Add payment_method and ledger_account_name to bookings and reservations
-- This allows the tables to display payment method and city ledger account name directly

ALTER TABLE bookings
  ADD COLUMN IF NOT EXISTS payment_method TEXT DEFAULT 'cash',
  ADD COLUMN IF NOT EXISTS ledger_account_name TEXT;
