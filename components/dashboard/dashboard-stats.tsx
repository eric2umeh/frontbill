'use client'

import { useEffect, useState } from 'react'
import { format } from 'date-fns'
import { StatCard } from '@/components/shared/stat-card'
import { DollarSign, Users, Bed, TrendingUp, Wallet } from 'lucide-react'
import { formatNaira } from '@/lib/utils/currency'
import { createClient } from '@/lib/supabase/client'
import { useAuth } from '@/lib/auth-context'
import {
  computeFrontOfficeStayStats,
  countPhysicallyHeldRooms,
} from '@/lib/rooms/front-office-stay'
import { resolveHotelTimeZone } from '@/lib/hotel-date'
import { todayYmdHotel, calendarPickerYmd } from '@/lib/utils/booking-in-house-dates'
import { fetchHotelBusinessNightUtcBounds } from '@/lib/payments/business-night-bounds'
import { buildDailyFrontDeskPack } from '@/lib/reports/daily-front-desk-pack'
import { sumRoomRevenueForHotelNight } from '@/lib/reports/day-page-stats'
import { Button } from '@/components/ui/button'
import { Calendar } from '@/components/ui/calendar'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { CalendarIcon } from 'lucide-react'

export function DashboardStats() {
  const { organizationId } = useAuth()
  const [dayYmd, setDayYmd] = useState(() => todayYmdHotel())
  const [calOpen, setCalOpen] = useState(false)
  const [stats, setStats] = useState([
    { title: 'Net profit', value: formatNaira(0), icon: Wallet, description: '—' },
    { title: 'Room revenue', value: formatNaira(0), icon: DollarSign, description: '—' },
    { title: 'Occupied', value: '0', icon: Users, description: '—' },
    { title: 'Available Rooms', value: '0', icon: Bed, description: '—' },
    { title: 'Occupancy Rate', value: '0%', icon: TrendingUp, description: '—' },
  ])

  useEffect(() => {
    if (!organizationId) return
    void fetchStats(dayYmd)
  }, [organizationId, dayYmd])

  const fetchStats = async (ymd: string) => {
    if (!organizationId) return
    try {
      const supabase = createClient()
      if (!supabase) return

      const tz = resolveHotelTimeZone()

      let netProfit = 0
      let roomRevenue = 0
      const bounds = await fetchHotelBusinessNightUtcBounds({
        supabase,
        organizationId,
        ymd,
        timeZone: tz,
      })

      const nightBookQ = supabase
        .from('bookings')
        .select(
          'id, check_in, check_out, status, rate_per_night, folio_id, payment_status, guests:guest_id(name), rooms:room_id(room_number, room_type)',
        )
        .eq('organization_id', organizationId)
        .in('status', ['confirmed', 'checked_in', 'reserved', 'checked_out'])
        .lte('check_in', ymd)
        .gt('check_out', ymd)
        .limit(500)

      let txQ = bounds.empty
        ? null
        : supabase
            .from('transactions')
            .select('*')
            .eq('organization_id', organizationId)
            .gte('created_at', bounds.startIso)
            .lte('created_at', bounds.endInclusiveIso)
            .limit(5000)

      let payQ = bounds.empty
        ? null
        : supabase
            .from('payments')
            .select('*')
            .eq('organization_id', organizationId)
            .gte('payment_date', bounds.startIso)
            .lte('payment_date', bounds.endInclusiveIso)
            .limit(5000)

      const [nightBookRes, txRes, payRes, inHouseRes, roomRes] = await Promise.all([
        nightBookQ,
        txQ || Promise.resolve({ data: [] as unknown[], error: null }),
        payQ || Promise.resolve({ data: [] as unknown[], error: null }),
        supabase
          .from('bookings')
          .select('id, room_id, status, check_in, check_out, folio_status, rate_per_night')
          .eq('organization_id', organizationId)
          .in('status', ['checked_in', 'confirmed', 'reserved']),
        supabase.from('rooms').select('status').eq('organization_id', organizationId),
      ])

      try {
        const pack = buildDailyFrontDeskPack({
          dateYmd: ymd,
          bookings: (nightBookRes.data || []) as any,
          transactions: (txRes.data || []) as any,
          payments: (payRes.data || []) as any,
        })
        netProfit = pack.salesCollection.total
        roomRevenue = pack.roomRevenueGenerated
      } catch {
        roomRevenue = sumRoomRevenueForHotelNight(inHouseRes.data ?? [], ymd)
      }

      const inHouseBookings = inHouseRes.data
      const roomRows = roomRes.data
      const totalRooms = roomRows?.length || 0
      const stay = computeFrontOfficeStayStats(inHouseBookings ?? [], ymd, tz)
      const physicallyHeld = countPhysicallyHeldRooms(inHouseBookings ?? [], ymd, tz)
      const ooo =
        roomRows?.filter(
          (r: { status?: string }) =>
            String(r.status || '').toLowerCase().replace(/-/g, '_') === 'out_of_order',
        ).length || 0
      const availableRooms = Math.max(0, totalRooms - physicallyHeld - ooo)
      const occupancyRate = totalRooms > 0 ? Math.round((physicallyHeld / totalRooms) * 100) : 0

      setStats([
        {
          title: 'Net profit',
          value: formatNaira(netProfit),
          icon: Wallet,
          description: ymd,
        },
        {
          title: 'Room revenue',
          value: formatNaira(roomRevenue),
          icon: DollarSign,
          description: 'In-house room rates',
        },
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
          description: `${physicallyHeld} held / ${totalRooms}`,
        },
      ])
    } catch (error) {
      console.error('Error fetching dashboard stats:', error)
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-center">
        <Popover open={calOpen} onOpenChange={setCalOpen}>
          <PopoverTrigger asChild>
            <Button variant="outline" className="gap-2 h-11 px-5 text-base font-medium">
              <CalendarIcon className="h-5 w-5" />
              {format(new Date(`${dayYmd}T12:00:00`), 'EEE d MMM yyyy')}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0" align="center">
            <Calendar
              mode="single"
              selected={new Date(`${dayYmd}T12:00:00`)}
              onSelect={(d) => {
                if (!d) return
                setDayYmd(calendarPickerYmd(d))
                setCalOpen(false)
              }}
            />
          </PopoverContent>
        </Popover>
      </div>
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-5">
        {stats.map((stat, i) => (
          <StatCard key={i} {...stat} />
        ))}
      </div>
    </div>
  )
}
