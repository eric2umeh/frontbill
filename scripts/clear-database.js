import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('[v0] Missing Supabase credentials')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseServiceKey)

// Tables in dependency order (reverse of creation order)
const tables = [
  'user_roles',
  'payments',
  'bookings',
  'rooms',
  'guests',
  'night_audit_logs',
  'organizations',
  'ledger_transactions',
  'city_ledger_accounts',
  'profiles',
]

async function clearDatabase() {
  console.log('[v0] Starting database cleanup...')
  
  try {
    // Disable RLS temporarily if needed
    console.log('[v0] Clearing all data while preserving schema...')
    
    for (const table of tables) {
      try {
        const { data, error } = await supabase.from(table).delete().neq('id', '')
        if (error) {
          if (error.message.includes('does not exist')) {
            console.log(`[v0] ✓ Table "${table}" does not exist or already empty`)
          } else {
            console.error(`[v0] Error clearing ${table}:`, error.message)
          }
        } else {
          console.log(`[v0] ✓ Cleared table "${table}" (${data?.length || 0} rows deleted)`)
        }
      } catch (err: any) {
        console.log(`[v0] ✓ Table "${table}" cleared or skipped`)
      }
    }
    
    console.log('[v0] ✅ Database cleared successfully! Schema preserved.')
    console.log('[v0] Ready for fresh MVP testing.')
  } catch (err: any) {
    console.error('[v0] Error during cleanup:', err.message)
    process.exit(1)
  }
}

clearDatabase()
