'use client'

import { Suspense, useState } from 'react'
import { DashboardStats } from '@/components/dashboard/dashboard-stats'
import { RoomStatusGrid } from '@/components/dashboard/room-status-grid'
import { RevenueChart } from '@/components/dashboard/revenue-chart'
import { RecentPayments } from '@/components/dashboard/recent-payments'
import { QuickActions } from '@/components/dashboard/quick-actions'
import { NewBookingModal } from '@/components/bookings/new-booking-modal'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { UserCheck } from 'lucide-react'

export default function DashboardPage() {
  const [bookingModalOpen, setBookingModalOpen] = useState(false)
  
  return (
    <div className="space-y-6">
      <NewBookingModal open={bookingModalOpen} onClose={() => setBookingModalOpen(false)} />
      
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Dashboard</h1>
          <p className="text-muted-foreground">
            Monitor your hotel operations and financial performance
          </p>
        </div>
        <Button onClick={() => setBookingModalOpen(true)}>
          <UserCheck className="mr-2 h-4 w-4" />
          Check-in Guest
        </Button>
      </div>

      <Suspense fallback={<StatsLoader />}>
        <DashboardStats />
      </Suspense>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2 space-y-6">
          <Suspense fallback={<ChartLoader />}>
            <RevenueChart />
          </Suspense>
        </div>

        <div className="space-y-6">
          <QuickActions />
          
          <Suspense fallback={<GridLoader />}>
            <RoomStatusGrid />
          </Suspense>
          
          <Suspense fallback={<TableLoader />}>
            <RecentPayments />
          </Suspense>
        </div>
      </div>
    </div>
  )
}

function StatsLoader() {
  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
      {[...Array(4)].map((_, i) => (
        <Skeleton key={i} className="h-32" />
      ))}
    </div>
  )
}

function ChartLoader() {
  return <Skeleton className="h-[400px] rounded-lg" />
}

function TableLoader() {
  return <Skeleton className="h-[300px] rounded-lg" />
}

function GridLoader() {
  return <Skeleton className="h-[400px] rounded-lg" />
}
