import { createClient } from '@/lib/supabase/server'
import { StatCard } from '@/components/shared/stat-card'
import { DollarSign, Users, Bed, TrendingUp } from 'lucide-react'
import { formatNaira } from '@/lib/utils/currency'

export async function DashboardStats() {
  const supabase = await createClient()

  const [
    { count: totalGuests },
    { count: availableRooms },
    rooms,
    bookings,
    payments,
  ] = await Promise.all([
    supabase.from('guests').select('*', { count: 'exact', head: true }),
    supabase.from('rooms').select('*', { count: 'exact', head: true }).eq('status', 'available'),
    supabase.from('rooms').select('*'),
    supabase.from('bookings').select('*, room:rooms(*), guest:guests(*)'),
    supabase.from('payments').select('*'),
  ])

  const occupiedRooms = rooms.data?.filter(r => r.status === 'occupied').length || 0
  const totalRooms = rooms.data?.length || 0

  const today = new Date()
  today.setHours(0, 0, 0, 0)
  
  const checkedInToday = bookings.data?.filter(b => {
    const checkIn = new Date(b.check_in)
    checkIn.setHours(0, 0, 0, 0)
    return checkIn.getTime() === today.getTime() && b.status === 'checked_in'
  }).length || 0

  const totalRevenue = payments.data?.reduce((sum, p) => sum + Number(p.amount), 0) || 0
  
  const pendingBookings = bookings.data?.filter(
    b => b.payment_status === 'pending' || b.payment_status === 'partial'
  ) || []
  const pendingAmount = pendingBookings.reduce((sum, b) => sum + Number(b.balance), 0)

  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
      <StatCard
        title="Total Revenue"
        value={formatNaira(totalRevenue)}
        icon={DollarSign}
        description="All-time revenue"
      />
      <StatCard
        title="Pending Payments"
        value={formatNaira(pendingAmount)}
        icon={TrendingUp}
        description={`${pendingBookings.length} bookings pending`}
      />
      <StatCard
        title="Room Occupancy"
        value={`${occupiedRooms}/${totalRooms}`}
        icon={Bed}
        description={`${availableRooms || 0} rooms available`}
      />
      <StatCard
        title="Total Guests"
        value={totalGuests || 0}
        icon={Users}
        description={`${checkedInToday} checked in today`}
      />
    </div>
  )
}
