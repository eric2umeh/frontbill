-- Add organization_id column to folio_charges table if it doesn't exist
ALTER TABLE folio_charges ADD COLUMN IF NOT EXISTS organization_id UUID;

-- Add foreign key constraint
ALTER TABLE folio_charges ADD CONSTRAINT fk_folio_charges_organization 
  FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE;

-- Populate organization_id from the linked booking's organization_id
UPDATE folio_charges fc
SET organization_id = b.organization_id
FROM bookings b
WHERE b.id = fc.booking_id AND fc.organization_id IS NULL;

-- Create index for better query performance
CREATE INDEX IF NOT EXISTS idx_folio_charges_organization_id ON folio_charges(organization_id);

-- Update RLS policy to include organization_id check
DROP POLICY IF EXISTS folio_charges_policy ON folio_charges;
CREATE POLICY folio_charges_policy ON folio_charges FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM profiles p
    WHERE p.organization_id = folio_charges.organization_id
    AND p.id = auth.uid()
  ));
