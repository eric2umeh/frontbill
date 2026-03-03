-- Migration: Ensure folio_charges table exists with correct schema
-- booking_id is NOT NULL (required for all charges)
-- created_by is nullable (some system-generated charges won't have a user)

CREATE TABLE IF NOT EXISTS folio_charges (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  booking_id UUID NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
  description TEXT NOT NULL,
  amount DECIMAL(12, 2) NOT NULL,
  charge_type TEXT NOT NULL DEFAULT 'charge',
  payment_method TEXT,
  payment_status TEXT DEFAULT 'pending',
  ledger_account_id UUID,
  ledger_account_type TEXT,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Index for fast folio lookups
CREATE INDEX IF NOT EXISTS idx_folio_charges_booking_id ON folio_charges(booking_id);

-- RLS
ALTER TABLE folio_charges ENABLE ROW LEVEL SECURITY;

-- Allow authenticated users to manage folio charges within their org
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'folio_charges' AND policyname = 'folio_charges_auth_policy'
  ) THEN
    CREATE POLICY folio_charges_auth_policy ON folio_charges
      FOR ALL
      TO authenticated
      USING (
        EXISTS (
          SELECT 1 FROM bookings b
          JOIN profiles p ON p.organization_id = b.organization_id
          WHERE b.id = folio_charges.booking_id
            AND p.id = auth.uid()
        )
      );
  END IF;
END$$;
