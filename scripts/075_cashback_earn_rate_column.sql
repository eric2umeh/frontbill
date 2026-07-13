-- Store the org cashback % at time of earn (for guest balance breakdown by rate).
-- Run after 074_guest_cashback_ledger.sql.

ALTER TABLE cashback_transactions
  ADD COLUMN IF NOT EXISTS earn_rate_percent NUMERIC(6,2);
