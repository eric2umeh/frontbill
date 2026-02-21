'use client'

import { StatCard } from '@/components/shared/stat-card'
import { DollarSign, Users, Bed, TrendingUp } from 'lucide-react'
import { formatNaira } from '@/lib/utils/currency'

export function DashboardStats() {
  const stats = [
    { title: 'Today\'s Revenue', value: formatNaira(2450000), icon: DollarSign, trend: '+12.5%', trendUp: true },
    { title: 'Total Guests', value: '156', icon: Users, trend: '+3 today', trendUp: true },
    { title: 'Available Rooms', value: '23', icon: Bed, trend: '62% occupied', trendUp: false },
    { title: 'Occupancy Rate', value: '62%', icon: TrendingUp, trend: '+5% vs last month', trendUp: true },
  ]

  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
      {stats.map((stat, i) => <StatCard key={i} {...stat} />)}
    </div>
  )
}
