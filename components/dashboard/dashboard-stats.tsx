'use client'

import { useEffect, useState } from 'react'
import { StatCard } from '@/components/shared/stat-card'
import { DollarSign, Users, Bed, TrendingUp } from 'lucide-react'
import { formatNaira } from '@/lib/utils/currency'
import { createClient } from '@/lib/supabase/client'
import { useAuth } from '@/lib/auth-context'

export function DashboardStats() {
  const { organizationId } = useAuth()
  const [stats, setStats] = useState([
    { title: "Today's Revenue", value: formatNaira(0), icon: DollarSign, description: '—' },
    { title: 'Occupied rooms', value: '0', icon: Users, description: '—' },
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

      const today = new Date().toISOString().split('T')[0]

      const { data: payments } = await supabase
        .from('payments')
        .select('*')
        .eq('organization_id', organizationId)
        .gte('payment_date', `${today}T00:00:00`)
        .lte('payment_date', `${today}T23:59:59`)

      // Fetch rooms for occupancy
      const { data: rooms } = await supabase
        .from('rooms')
        .select('*')
        .eq('organization_id', organizationId)

      const { data: bookings } = await supabase
        .from('bookings')
        .select('id')
        .eq('organization_id', organizationId)
        .eq('status', 'checked_in')

      const totalRevenue =
        payments?.reduce((sum: number, p: { amount?: unknown }) => sum + Number(p.amount ?? 0), 0) || 0
      const totalRooms = rooms?.length || 0
      const occupiedRooms =
        rooms?.filter((r: { status?: string }) => String(r.status || '').toLowerCase() === 'occupied').length || 0
      const availableRooms =
        rooms?.filter((r: { status?: string }) => String(r.status || '').toLowerCase() === 'available').length || 0
      const occupancyRate = totalRooms > 0 ? Math.round((occupiedRooms / totalRooms) * 100) : 0
      const checkedInFolios = bookings?.length || 0

      setStats([
        { title: "Today's Revenue", value: formatNaira(totalRevenue), icon: DollarSign, description: 'Today' },
        {
          title: 'Occupied rooms',
          value: String(occupiedRooms),
          icon: Users,
          description: checkedInFolios
            ? `${checkedInFolios} checked-in folio${checkedInFolios === 1 ? '' : 's'}`
            : 'By room status',
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
          description: `${occupiedRooms} occupied / ${totalRooms}`,
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
