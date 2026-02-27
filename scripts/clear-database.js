import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('[v0] Missing Supabase credentials')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseServiceKey)

async function clearDatabase() {
  console.log('[v0] Starting complete database cleanup for MVP testing...')
  
  try {
    // First, clear all auth users via admin API
    console.log('[v0] Clearing all auth users...')
    try {
      // Get all users
      const { data: { users }, error: listError } = await supabase.auth.admin.listUsers()
      
      if (!listError && users && users.length > 0) {
        for (const user of users) {
          const { error: deleteError } = await supabase.auth.admin.deleteUser(user.id)
          if (deleteError) {
            console.log(`[v0] ⊘ Could not delete user ${user.email}`)
          } else {
            console.log(`[v0] ✓ Deleted auth user: ${user.email}`)
          }
        }
      } else if (listError) {
        console.log('[v0] ⊘ Could not list auth users (may need manual cleanup in Supabase dashboard)')
      } else {
        console.log('[v0] ✓ No auth users to clear')
      }
    } catch (authErr) {
      console.log('[v0] ⊘ Auth user deletion skipped (manual cleanup may be needed)')
    }
    
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

    console.log('[v0] Clearing all database tables...')
    
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
    
    console.log('')
    console.log('[v0] ✅ Database cleanup complete!')
    console.log('[v0] 🚀 Schema preserved. Ready for fresh MVP testing.')
    console.log('')
    console.log('[v0] NEXT STEPS TO SWITCH TO TEST MODE:')
    console.log('[v0] 1. Go to your Supabase Dashboard: https://app.supabase.com')
    console.log('[v0] 2. Select your project')
    console.log('[v0] 3. Go to Settings → Project Settings')
    console.log('[v0] 4. Under "Project Status", switch to "Development" mode (if available)')
    console.log('[v0] 5. Alternatively, create a new Supabase project specifically for testing')
    console.log('')
    console.log('[v0] Database is now ready for MVP testing from a clean slate!')
    process.exit(0)

clearDatabase()
