-- Ensure deleting a booking also removes dependent payment and transaction rows.
-- This fixes: payments_booking_id_fkey blocking booking deletion.

ALTER TABLE payments
  DROP CONSTRAINT IF EXISTS payments_booking_id_fkey;

ALTER TABLE payments
  ADD CONSTRAINT payments_booking_id_fkey
  FOREIGN KEY (booking_id)
  REFERENCES bookings(id)
  ON DELETE CASCADE;

ALTER TABLE transactions
  DROP CONSTRAINT IF EXISTS transactions_booking_id_fkey;

ALTER TABLE transactions
  ADD CONSTRAINT transactions_booking_id_fkey
  FOREIGN KEY (booking_id)
  REFERENCES bookings(id)
  ON DELETE CASCADE;
