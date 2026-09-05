'use client'

import { useCallback, useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useAuth } from '@/lib/auth-context'
import {
  computeRoomInventoryStatsWithBookings,
  type RoomInventoryStats,
} from '@/lib/rooms/compute-room-inventory-stats'
import { OCCUPYING_BOOKING_STATUSES } from '@/lib/rooms/room-occupancy'
import { reconcileRoomStatusesClient } from '@/lib/rooms/reconcile-room-status-client'
import { Bed, DoorOpen, AlertTriangle, Loader2, CalendarClock, CalendarDays } from 'lucide-react'
import { frontOfficeTodayYmd } from '@/lib/hotel-date'
import { cn } from '@/lib/utils'

type Props = {
  className?: string
  /** Refresh counts every N ms (0 = load once). */
  refreshMs?: number
}

export function RoomInventoryStatsStrip({ className, refreshMs = 60_000 }: Props) {
  const { organizationId } = useAuth()
  const [stats, setStats] = useState<RoomInventoryStats | null>(null)
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    if (!organizationId) {
      setStats(null)
      setLoading(false)
      return
    }
    const supabase = createClient()
    if (!supabase) {
      setLoading(false)
      return
    }
    await reconcileRoomStatusesClient()

    const [{ data: rooms, error: roomErr }, { data: bookings, error: bookErr }, { data: orgRow }] = await Promise.all([
      supabase.from('rooms').select('status, housekeeping_status').eq('organization_id', organizationId),
      supabase
        .from('bookings')
        .select('id, room_id, status, check_in, check_out, folio_status')
        .eq('organization_id', organizationId)
        .in('status', [...OCCUPYING_BOOKING_STATUSES]),
      supabase
        .from('organizations')
        .select('business_date')
        .eq('id', organizationId)
        .maybeSingle(),
    ])

    if (roomErr) {
      console.warn('[room-inventory-stats]', roomErr.message)
      setLoading(false)
      return
    }
    if (bookErr) {
      console.warn('[room-inventory-stats] bookings', bookErr.message)
    }
    setStats(
      computeRoomInventoryStatsWithBookings(
        rooms ?? [],
        bookings ?? [],
        frontOfficeTodayYmd(orgRow?.business_date),
      ),
    )
    setLoading(false)
  }, [organizationId])

  useEffect(() => {
    setLoading(true)
    void load()
    if (!refreshMs || refreshMs <= 0) return
    const id = window.setInterval(() => {
      if (document.visibilityState !== 'visible') return
      void load()
    }, refreshMs)
    const onVis = () => {
      if (document.visibilityState === 'visible') void load()
    }
    document.addEventListener('visibilitychange', onVis)
    return () => {
      window.clearInterval(id)
      document.removeEventListener('visibilitychange', onVis)
    }
  }, [load, refreshMs])

  if (loading) {
    return (
      <div
        className={cn(
          'inline-flex h-7 items-center gap-1 rounded-md border border-input bg-background px-2 text-[10px] text-muted-foreground shadow-sm',
          className,
        )}
        aria-label="Loading room statistics"
      >
        <Loader2 className="h-3 w-3 animate-spin" />
      </div>
    )
  }

  if (!stats) return null

  return (
    <div
      className={cn('flex flex-wrap items-center justify-end gap-1.5', className)}
      role="group"
      aria-label="Room inventory (view only)"
    >
      <div
        className="inline-flex h-7 items-center gap-1 rounded-md border border-blue-200/80 bg-blue-50/50 px-1.5 text-[10px] font-medium leading-none shadow-sm dark:border-blue-900/50 dark:bg-blue-950/30"
        title="Checked-in guests staying past today (excludes due-out and reservations)"
      >
        <Bed className="h-3 w-3 shrink-0 text-blue-700 dark:text-blue-400" aria-hidden />
        <span className="text-muted-foreground">Occ</span>
        <span className="tabular-nums text-foreground">{stats.occupied}</span>
      </div>
      <div
        className="inline-flex h-7 items-center gap-1 rounded-md border border-violet-200/80 bg-violet-50/50 px-1.5 text-[10px] font-medium leading-none shadow-sm dark:border-violet-900/50 dark:bg-violet-950/30"
        title="Reservations / not checked in yet"
      >
        <CalendarDays className="h-3 w-3 shrink-0 text-violet-700 dark:text-violet-400" aria-hidden />
        <span className="text-muted-foreground">Res</span>
        <span className="tabular-nums text-foreground">{stats.reserved}</span>
      </div>
      <div
        className="inline-flex h-7 items-center gap-1 rounded-md border border-amber-200/80 bg-amber-50/50 px-1.5 text-[10px] font-medium leading-none shadow-sm dark:border-amber-900/50 dark:bg-amber-950/30"
        title="Checkout today (due out) — not counted in Occ"
      >
        <CalendarClock className="h-3 w-3 shrink-0 text-amber-700 dark:text-amber-400" aria-hidden />
        <span className="text-muted-foreground">Due</span>
        <span className="tabular-nums text-foreground">{stats.dueOut}</span>
      </div>
      <div
        className="inline-flex h-7 items-center gap-1 rounded-md border border-green-200/80 bg-green-50/50 px-1.5 text-[10px] font-medium leading-none shadow-sm dark:border-green-900/50 dark:bg-green-950/30"
        title="Rooms free for check-in (total − Occ − Due today − OOO)"
      >
        <DoorOpen className="h-3 w-3 shrink-0 text-green-700 dark:text-green-400" aria-hidden />
        <span className="text-muted-foreground">Avail</span>
        <span className="tabular-nums text-foreground">{stats.available}</span>
      </div>
      <div
        className="inline-flex h-7 items-center gap-1 rounded-md border border-orange-200/80 bg-orange-50/50 px-1.5 text-[10px] font-medium leading-none shadow-sm dark:border-orange-900/50 dark:bg-orange-950/30"
        title="Rooms marked Out of order"
      >
        <AlertTriangle className="h-3 w-3 shrink-0 text-orange-700 dark:text-orange-400" aria-hidden />
        <span className="text-muted-foreground">OOO</span>
        <span className="tabular-nums text-foreground">{stats.outOfOrder}</span>
      </div>
      <span className="text-[9px] text-muted-foreground tabular-nums hidden sm:inline" title="Total rooms">
        /{stats.total}
      </span>
    </div>
  )
}
