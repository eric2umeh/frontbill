'use client'

import { Suspense, useState, useEffect, useCallback } from 'react'
import { DashboardStats } from '@/components/dashboard/dashboard-stats'
import { RoomStatusGrid } from '@/components/dashboard/room-status-grid'
import { RevenueChart } from '@/components/dashboard/revenue-chart'
import { RecentPayments } from '@/components/dashboard/recent-payments'
import { QuickActions } from '@/components/dashboard/quick-actions'
import { AIInsightsPanel } from '@/components/ai/insights-panel'
import { NewBookingModal } from '@/components/bookings/new-booking-modal'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { UserCheck } from 'lucide-react'
import { useAuth } from '@/lib/auth-context'
import { createClient } from '@/lib/supabase/client'

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

export default function DashboardPage() {
  const [bookingModalOpen, setBookingModalOpen] = useState(false)
  const [refreshKey, setRefreshKey] = useState(0)
  const [bookings, setBookings] = useState<any[]>([])
  const [dailyData, setDailyData] = useState({
    checkouts: 0,
    checkIns: 0,
    occupancy: 0,
    revenue: 0,
    pendingCheckouts: 0,
    expectedArrivals: 0,
    outstandingBalance: 0,
  })
  const { organizationId } = useAuth()

  const fetchDashboardData = useCallback(async () => {
    const supabase = createClient()
    if (!supabase || !organizationId) return

    try {
      const today = new Date().toISOString().split('T')[0]

      const [bookingsRes, roomsRes, paymentsRes, checkoutsRes, arrivalsRes, pendingCheckoutsRes, balancesRes] = await Promise.all([
        supabase
          .from('bookings')
          .select('id, folio_id, guest_id, room_id, check_in, check_out, number_of_nights, rate_per_night, total_amount, deposit, balance, payment_status, status, notes, guests:guest_id(id, name), rooms:room_id(room_number, room_type)')
          .eq('organization_id', organizationId)
          .order('check_in', { ascending: false })
          .limit(100),
        supabase.from('rooms').select('id, status').eq('organization_id', organizationId),
        supabase.from('payments').select('id, amount, payment_date').eq('organization_id', organizationId)
          .gte('payment_date', `${today}T00:00:00`).lte('payment_date', `${today}T23:59:59`),
        supabase.from('bookings').select('id').eq('organization_id', organizationId).eq('status', 'checked_out').eq('check_out', today),
        supabase.from('bookings').select('id').eq('organization_id', organizationId).eq('status', 'reserved').eq('check_in', today),
        supabase.from('bookings').select('id').eq('organization_id', organizationId).in('status', ['confirmed', 'checked_in']).eq('check_out', today),
        supabase.from('bookings').select('balance').eq('organization_id', organizationId).gt('balance', 0).in('status', ['confirmed', 'checked_in', 'reserved']),
      ])

      const allBookings = bookingsRes.data || []
      const rooms = roomsRes.data || []
      const payments = paymentsRes.data || []
      const checkouts = checkoutsRes.data || []
      const arrivals = arrivalsRes.data || []
      const pendingCheckouts = pendingCheckoutsRes.data || []
      const outstandingBalance = (balancesRes.data || []).reduce((sum: number, booking: any) => sum + Number(booking.balance || 0), 0)

      const totalRooms = rooms.length
      const occupiedRooms = rooms.filter((room: any) => room.status === 'occupied').length
      const occupancyRate = totalRooms > 0 ? Math.round((occupiedRooms / totalRooms) * 100) : 0
      const totalRevenue = payments.reduce((sum: number, p: any) => sum + p.amount, 0)

      setBookings(allBookings)
      setDailyData({
        checkouts: checkouts.length,
        checkIns: arrivals.length,
        occupancy: occupancyRate,
        revenue: totalRevenue,
        pendingCheckouts: pendingCheckouts.length,
        expectedArrivals: arrivals.length,
        outstandingBalance,
      })
    } catch (error) {
      console.error('Error fetching dashboard data:', error)
    }
  }, [organizationId])

  useEffect(() => {
    fetchDashboardData()
  }, [fetchDashboardData, refreshKey])

  const handleBookingSuccess = useCallback(() => {
    setRefreshKey((k) => k + 1)
  }, [])

  return (
    <div className="space-y-6">
      <NewBookingModal open={bookingModalOpen} onClose={() => { setBookingModalOpen(false) }} onSuccess={handleBookingSuccess} />
      
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
        <DashboardStats key={refreshKey} />
      </Suspense>

      {/* AI Insights Section */}
      <div className="border-t pt-6">
        <h2 className="text-lg font-semibold mb-4">AI-Powered Insights</h2>
        {organizationId && (
          <AIInsightsPanel bookings={bookings} dailyData={dailyData} />
        )}
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2 space-y-6">
          <Suspense fallback={<ChartLoader />}>
            <RevenueChart key={refreshKey} />
          </Suspense>
        </div>

        <div className="space-y-6">
          <QuickActions />
          
          <Suspense fallback={<GridLoader />}>
            <RoomStatusGrid key={refreshKey} />
          </Suspense>
          
          <Suspense fallback={<TableLoader />}>
            <RecentPayments key={refreshKey} />
          </Suspense>
        </div>
      </div>
    </div>
  )
}
