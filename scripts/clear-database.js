import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('Missing Supabase credentials')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseServiceKey)

async function clearDatabase() {
  console.log('Starting complete database cleanup for MVP testing...')

  try {
    // First, clear all auth users via admin API
    console.log('Clearing all auth users...')
    try {
      const { data: { users }, error: listError } = await supabase.auth.admin.listUsers()

      if (!listError && users && users.length > 0) {
        for (const user of users) {
          const { error: deleteError } = await supabase.auth.admin.deleteUser(user.id)
          if (deleteError) {
            console.log(`Could not delete user ${user.email}`)
          } else {
            console.log(`Deleted auth user: ${user.email}`)
          }
        }
      } else if (listError) {
        console.log('Could not list auth users (may need manual cleanup in Supabase dashboard)')
      } else {
        console.log('No auth users to clear')
      }
    } catch (authErr) {
      console.log('Auth user deletion skipped (manual cleanup may be needed)')
    }

    // Tables to clear in reverse dependency order (dependent tables first)
    const tablesToClear = [
      { name: 'folio_charges' },
      { name: 'payments' },
      { name: 'transactions' },
      { name: 'bookings' },
      { name: 'rooms' },
      { name: 'guests' },
      { name: 'city_ledger_accounts' },
      { name: 'profiles' },
      { name: 'organizations' },
    ]

    console.log('Clearing all database tables...')

    for (const table of tablesToClear) {
      try {
        const { error: fetchError } = await supabase
          .from(table.name)
          .select('id', { count: 'exact', head: true })

        if (fetchError && fetchError.message.includes('does not exist')) {
          console.log(`Table "${table.name}" does not exist (skipped)`)
          continue
        }

        if (fetchError) {
          console.log(`Could not access "${table.name}" (${fetchError.message})`)
          continue
        }

        const { error: deleteError } = await supabase
          .from(table.name)
          .delete()
          .not('id', 'is', null)

        if (deleteError) {
          console.error(`Error clearing ${table.name}: ${deleteError.message}`)
        } else {
          console.log(`Cleared table "${table.name}"`)
        }
      } catch (err) {
        console.log(`Table "${table.name}" - error or skipped`)
      }
    }

    console.log('')
    console.log('Database cleanup complete! Schema preserved. Ready for fresh MVP launch.')
    process.exit(0)
  } catch (err) {
    console.error('Critical error:', err.message)
    process.exit(1)
  }
}

clearDatabase()
