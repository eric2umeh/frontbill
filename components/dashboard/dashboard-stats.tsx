'use client'

import { useEffect, useState } from 'react'
import { StatCard } from '@/components/shared/stat-card'
import { DollarSign, Users, Bed, TrendingUp } from 'lucide-react'
import { formatNaira } from '@/lib/utils/currency'
import { createClient } from '@/lib/supabase/client'

export function DashboardStats() {
  const [stats, setStats] = useState([
    { title: "Today's Revenue", value: formatNaira(0), icon: DollarSign, trend: '—', trendUp: false },
    { title: 'Total Guests', value: '0', icon: Users, trend: '—', trendUp: false },
    { title: 'Available Rooms', value: '0', icon: Bed, trend: '—', trendUp: false },
    { title: 'Occupancy Rate', value: '0%', icon: TrendingUp, trend: '—', trendUp: false },
  ])

  useEffect(() => {
    fetchStats()
  }, [])

  const fetchStats = async () => {
    try {
      const supabase = createClient()
      if (!supabase) return

      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      const { data: profile } = await supabase
        .from('profiles')
        .select('organization_id')
        .eq('id', user.id)
        .single()

      if (!profile) return

      const today = new Date().toISOString().split('T')[0]

      // Fetch today's revenue
      const { data: payments } = await supabase
        .from('payments')
        .select('*')
        .eq('organization_id', profile.organization_id)
        .gte('payment_date', `${today}T00:00:00`)
        .lte('payment_date', `${today}T23:59:59`)

      // Fetch rooms for occupancy
      const { data: rooms } = await supabase
        .from('rooms')
        .select('*')
        .eq('organization_id', profile.organization_id)

      // Fetch checked-in guests
      const { data: bookings } = await supabase
        .from('bookings')
        .select('*')
        .eq('organization_id', profile.organization_id)
        .eq('status', 'checked_in')

      const totalRevenue = payments?.reduce((sum, p) => sum + p.amount, 0) || 0
      const totalRooms = rooms?.length || 0
      const availableRooms = rooms?.filter(r => r.status === 'available').length || 0
      const occupiedRooms = bookings?.length || 0
      const occupancyRate = totalRooms > 0 ? Math.round((occupiedRooms / totalRooms) * 100) : 0

      setStats([
        { title: "Today's Revenue", value: formatNaira(totalRevenue), icon: DollarSign, trend: '—', trendUp: false },
        { title: 'Total Guests', value: String(occupiedRooms), icon: Users, trend: 'checked in', trendUp: true },
        { title: 'Available Rooms', value: String(availableRooms), icon: Bed, trend: `${totalRooms} total`, trendUp: false },
        { title: 'Occupancy Rate', value: `${occupancyRate}%`, icon: TrendingUp, trend: `${occupiedRooms}/${totalRooms}`, trendUp: occupancyRate > 50 },
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
