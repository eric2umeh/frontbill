import { createClient } from '@/lib/supabase/server'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Calendar } from 'lucide-react'
import { formatDate } from '@/lib/utils/date'
import { formatNaira } from '@/lib/utils/currency'

export async function RecentBookings() {
  const supabase = await createClient()
  const { data: bookings } = await supabase
    .from('bookings')
    .select('*, guest:guests(*), room:rooms(*)')
    .order('created_at', { ascending: false })
    .limit(5)

  const statusColors: Record<string, string> = {
    pending: 'bg-yellow-100 text-yellow-800',
    confirmed: 'bg-blue-100 text-blue-800',
    checked_in: 'bg-green-100 text-green-800',
    checked_out: 'bg-gray-100 text-gray-800',
    cancelled: 'bg-red-100 text-red-800',
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Calendar className="h-5 w-5" />
          Recent Bookings
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {bookings?.length === 0 ? (
            <p className="text-center text-sm text-muted-foreground py-8">
              No bookings yet
            </p>
          ) : (
            bookings?.map((booking) => (
              <div
                key={booking.id}
                className="flex items-start justify-between border-b pb-4 last:border-0 last:pb-0"
              >
                <div className="space-y-1">
                  <p className="font-medium text-sm">
                    {booking.guest?.first_name} {booking.guest?.last_name}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Room {booking.room?.room_number} • {formatDate(booking.check_in)} - {formatDate(booking.check_out)}
                  </p>
                  <Badge className={statusColors[booking.status]} variant="secondary">
                    {booking.status.replace('_', ' ')}
                  </Badge>
                </div>
                <div className="text-right">
                  <p className="font-semibold text-sm">{formatNaira(booking.total_amount)}</p>
                  <p className="text-xs text-muted-foreground">
                    {booking.payment_status === 'paid' ? 'Paid' : `₦${booking.balance} due`}
                  </p>
                </div>
              </div>
            ))
          )}
        </div>
      </CardContent>
    </Card>
  )
}
