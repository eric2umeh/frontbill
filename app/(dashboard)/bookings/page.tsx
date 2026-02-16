import { createClient } from '@/lib/supabase/server'
import { BookingsTable } from '@/components/bookings/bookings-table'
import { Button } from '@/components/ui/button'
import { Plus } from 'lucide-react'

export default async function BookingsPage() {
  const supabase = await createClient()
  const { data: bookings } = await supabase
    .from('bookings')
    .select('*, guest:guests(*), room:rooms(*), organization:organizations(*)')
    .order('created_at', { ascending: false })

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Bookings</h1>
          <p className="text-muted-foreground">
            Manage reservations and check-ins
          </p>
        </div>
        <Button>
          <Plus className="mr-2 h-4 w-4" />
          New Booking
        </Button>
      </div>

      <BookingsTable bookings={bookings || []} />
    </div>
  )
}
