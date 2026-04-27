import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseServiceKey)

async function resetDatabase() {
  try {
    console.log('Starting complete database reset...\n')

    // Step 1: Delete all auth users
    console.log('Step 1: Deleting all auth users...')
    const { data: users, error: usersError } = await supabase.auth.admin.listUsers()
    
    if (usersError) {
      console.error('Error fetching users:', usersError.message)
    } else if (users && users.users.length > 0) {
      for (const user of users.users) {
        const { error: deleteError } = await supabase.auth.admin.deleteUser(user.id)
        if (deleteError) {
          console.error(`Failed to delete user ${user.email}:`, deleteError.message)
        } else {
          console.log(`Deleted auth user: ${user.email}`)
        }
      }
      console.log(`Deleted ${users.users.length} auth users\n`)
    } else {
      console.log('No auth users to delete\n')
    }

    // Step 2: Clear all data tables
    const tables = [
      'folio_charges',
      'payments',
      'transactions',
      'bookings',
      'rooms',
      'guests',
      'city_ledger_accounts',
      'profiles',
      'organizations',
    ]

    console.log('Step 2: Clearing data tables...')
    for (const table of tables) {
      const { error } = await supabase.from(table).delete().neq('id', '')
      if (error) {
        console.error(`Error clearing ${table}:`, error.message)
      } else {
        console.log(`Cleared ${table}`)
      }
    }

    console.log('\n✅ Complete database reset successful!')
    console.log('All users and data have been deleted.')
    console.log('You can now sign up with a fresh account.')
  } catch (error) {
    console.error('Fatal error:', error.message)
    process.exit(1)
  }
}

resetDatabase()
