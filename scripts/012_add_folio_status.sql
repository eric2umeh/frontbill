-- Add folio_status column to track folio lifecycle
-- active: folio is open and accepting new charges/payments
-- checked_out: folio is closed, no new charges/payments allowed
-- cancelled: folio was cancelled without checkout

ALTER TABLE bookings 
ADD COLUMN folio_status TEXT DEFAULT 'active' CHECK (folio_status IN ('active', 'checked_out', 'cancelled'));

-- Index for filtering by folio_status
CREATE INDEX idx_bookings_folio_status ON bookings(folio_status);

-- Index for common queries: guest_id + folio_status (used in guest detail page)
CREATE INDEX idx_bookings_guest_folio_status ON bookings(guest_id, folio_status);
