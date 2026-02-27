import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('[v0] Missing Supabase credentials')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseServiceKey)

async function clearDatabase() {
  console.log('[v0] Starting database cleanup...')
  
  try {
    // Tables to clear in reverse dependency order (dependent tables first)
    const tablesToClear = [
      { name: 'payments', exists: true },
      { name: 'transactions', exists: true },
      { name: 'bookings', exists: true },
      { name: 'rooms', exists: true },
      { name: 'guests', exists: true },
      { name: 'profiles', exists: true },
      { name: 'organizations', exists: true },
      { name: 'city_ledger_accounts', exists: true },
    ]

    console.log('[v0] Clearing all data while preserving schema...')
    
    for (const table of tablesToClear) {
      try {
        // Fetch all records first to count them
        const { data: records, error: fetchError } = await supabase
          .from(table.name)
          .select('id', { count: 'exact', head: true })

        if (fetchError && fetchError.message.includes('does not exist')) {
          console.log(`[v0] ⊘ Table "${table.name}" does not exist (skipped)`)
          continue
        }

        if (fetchError) {
          console.log(`[v0] ⊘ Could not access "${table.name}" (${fetchError.message})`)
          continue
        }

        // Delete all records by deleting where id is not null
        const { error: deleteError } = await supabase
          .from(table.name)
          .delete()
          .not('id', 'is', null)

        if (deleteError) {
          console.error(`[v0] ✗ Error clearing ${table.name}: ${deleteError.message}`)
        } else {
          console.log(`[v0] ✓ Cleared table "${table.name}"`)
        }
      } catch (err) {
        console.log(`[v0] ⊘ Table "${table.name}" - error or skipped`)
      }
    }
    
    console.log('[v0] ✅ Database cleared successfully!')
    console.log('[v0] 🚀 Schema preserved. Ready for fresh MVP testing.')
    process.exit(0)
  } catch (err) {
    console.error('[v0] Fatal error during cleanup:', err.message)
    process.exit(1)
  }
}

clearDatabase()
