import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseServiceKey)

async function run() {
  console.log('Running folio_charges migration...')

  // Test if folio_charges already exists
  const { data: existing, error: testErr } = await supabase
    .from('folio_charges')
    .select('id')
    .limit(1)

  if (!testErr) {
    console.log('folio_charges table already exists - checking columns...')

    // Try inserting a test row to check schema
    const { data: testBooking } = await supabase
      .from('bookings')
      .select('id')
      .limit(1)
      .single()

    if (testBooking) {
      const { error: insertErr } = await supabase
        .from('folio_charges')
        .insert([{
          booking_id: testBooking.id,
          description: '__schema_test__',
          amount: 0,
          charge_type: 'test',
        }])

      if (insertErr) {
        console.error('Schema test failed:', insertErr.message)
      } else {
        // Clean up test row
        await supabase.from('folio_charges').delete().eq('description', '__schema_test__')
        console.log('folio_charges schema is correct')
      }
    } else {
      console.log('No bookings to test with - schema looks OK')
    }
    process.exit(0)
  }

  // Table doesn't exist - we can't create it via Supabase JS client directly
  // Report what needs to be done manually
  console.error('folio_charges table does NOT exist in the database.')
  console.error('Please run the following SQL in the Supabase SQL Editor:')
  console.error('')
  console.error(`CREATE TABLE folio_charges (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id UUID NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
  description TEXT NOT NULL,
  amount DECIMAL(12,2) NOT NULL,
  charge_type TEXT NOT NULL DEFAULT 'charge',
  payment_method TEXT,
  payment_status TEXT DEFAULT 'pending',
  ledger_account_id UUID,
  ledger_account_type TEXT,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_folio_charges_booking_id ON folio_charges(booking_id);
ALTER TABLE folio_charges ENABLE ROW LEVEL SECURITY;
CREATE POLICY folio_charges_policy ON folio_charges FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM bookings b
    JOIN profiles p ON p.organization_id = b.organization_id
    WHERE b.id = folio_charges.booking_id AND p.id = auth.uid()
  ));`)
  process.exit(1)
}

run()
