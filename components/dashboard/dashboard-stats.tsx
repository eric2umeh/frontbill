'use client'

import { useEffect, useState } from 'react'
import { StatCard } from '@/components/shared/stat-card'
import { DollarSign, Users, Bed, TrendingUp } from 'lucide-react'
import { formatNaira } from '@/lib/utils/currency'
import { createClient } from '@/lib/supabase/client'
import { useAuth } from '@/lib/auth-context'
import {
  computeFrontOfficeStayStats,
  countPhysicallyHeldRooms,
} from '@/lib/rooms/front-office-stay'
import { reconcileRoomStatusesClient } from '@/lib/rooms/reconcile-room-status-client'
import { resolveHotelTimeZone } from '@/lib/hotel-date'
import { todayYmdHotel } from '@/lib/utils/booking-in-house-dates'

export function DashboardStats() {
  const { organizationId } = useAuth()
  const [stats, setStats] = useState([
    { title: "Today's Revenue", value: formatNaira(0), icon: DollarSign, description: '—' },
    { title: 'Occupied', value: '0', icon: Users, description: '—' },
    { title: 'Available Rooms', value: '0', icon: Bed, description: '—' },
    { title: 'Occupancy Rate', value: '0%', icon: TrendingUp, description: '—' },
  ])

  useEffect(() => {
    if (!organizationId) return
    void fetchStats()
  }, [organizationId])

  const fetchStats = async () => {
    if (!organizationId) return
    try {
      const supabase = createClient()
      if (!supabase) return

      const tz = resolveHotelTimeZone()
      const today = todayYmdHotel(tz)

      const { data: payments } = await supabase
        .from('payments')
        .select('*')
        .eq('organization_id', organizationId)
        .gte('payment_date', `${today}T00:00:00`)
        .lte('payment_date', `${today}T23:59:59`)

      await reconcileRoomStatusesClient()

      const { data: inHouseBookings } = await supabase
        .from('bookings')
        .select('id, room_id, status, check_in, check_out, folio_status')
        .eq('organization_id', organizationId)
        .in('status', ['checked_in', 'confirmed', 'reserved'])

      const { data: roomRows } = await supabase
        .from('rooms')
        .select('status')
        .eq('organization_id', organizationId)

      const totalRevenue =
        payments?.reduce((sum: number, p: { amount?: unknown }) => sum + Number(p.amount ?? 0), 0) || 0
      const totalRooms = roomRows?.length || 0
      const stay = computeFrontOfficeStayStats(inHouseBookings ?? [], today, tz)
      const physicallyHeld = countPhysicallyHeldRooms(inHouseBookings ?? [], today, tz)
      const ooo =
        roomRows?.filter(
          (r: { status?: string }) =>
            String(r.status || '').toLowerCase().replace(/-/g, '_') === 'out_of_order',
        ).length || 0
      const availableRooms = Math.max(0, totalRooms - physicallyHeld - ooo)
      const occupancyRate = totalRooms > 0 ? Math.round((physicallyHeld / totalRooms) * 100) : 0

      setStats([
        { title: "Today's Revenue", value: formatNaira(totalRevenue), icon: DollarSign, description: 'Today' },
        {
          title: 'Occupied',
          value: String(stay.occupied),
          icon: Users,
          description: `Res ${stay.reserved} · Due ${stay.dueOut}`,
        },
        {
          title: 'Available Rooms',
          value: String(availableRooms),
          icon: Bed,
          description: `${totalRooms} total`,
        },
        {
          title: 'Occupancy Rate',
          value: `${occupancyRate}%`,
          icon: TrendingUp,
          description: `${physicallyHeld} held (Occ+Due) / ${totalRooms}`,
        },
      ])
    } catch (error) {
      console.error('Error fetching dashboard stats:', error)
    }
  }

  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
      {stats.map((stat, i) => <StatCard key={i} {...stat} />)}
    </div>
  )
}
