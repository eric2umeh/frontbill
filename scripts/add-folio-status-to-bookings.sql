-- Add folio_status column to bookings table if it doesn't exist
ALTER TABLE bookings
ADD COLUMN IF NOT EXISTS folio_status TEXT DEFAULT 'active'
CHECK (folio_status IN ('active', 'checked_out', 'on_hold', 'cancelled'));

-- Add index for faster lookups
CREATE INDEX IF NOT EXISTS idx_bookings_folio_status ON bookings(folio_status);
