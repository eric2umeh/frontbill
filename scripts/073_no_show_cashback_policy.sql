-- No-show billing policy + cashback program settings on organizations.
-- Run in Supabase SQL Editor (staging first, then prod after deploy).

ALTER TABLE organizations
  ADD COLUMN IF NOT EXISTS no_show_fee_mode TEXT NOT NULL DEFAULT 'percent'
    CHECK (no_show_fee_mode IN ('percent', 'flat_night', 'flat_stay')),
  ADD COLUMN IF NOT EXISTS no_show_fee_percent NUMERIC(5,2) NOT NULL DEFAULT 100,
  ADD COLUMN IF NOT EXISTS no_show_fee_flat_amount NUMERIC(12,2),
  ADD COLUMN IF NOT EXISTS cashback_enabled BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS cashback_percent NUMERIC(5,2) NOT NULL DEFAULT 2;

ALTER TABLE bookings
  ADD COLUMN IF NOT EXISTS no_show_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS no_show_fee_amount NUMERIC(12,2);

COMMENT ON COLUMN organizations.no_show_fee_mode IS 'percent = % of room rate × nights; flat_night = flat × nights; flat_stay = flat per booking';
COMMENT ON COLUMN organizations.cashback_percent IS 'Earn rate on eligible cash/POS/transfer payments (e.g. 2 = 2%)';
