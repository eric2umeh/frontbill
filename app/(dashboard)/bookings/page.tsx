'use client'

import { useCallback, useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { EnhancedDataTable } from '@/components/shared/enhanced-data-table'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { CardContent } from '@/components/ui/card'
import { NewBookingModal } from '@/components/bookings/new-booking-modal'
import { BulkBookingModal } from '@/components/reservations/bulk-booking-modal'
import { ReserveCheckInModal, type ReserveCheckInBooking } from '@/components/reservations/reserve-checkin-modal'
import { ExtendStayModal } from '@/components/bookings/extend-stay-modal'
import { AddChargeModal } from '@/components/bookings/add-charge-modal'
import { CheckoutConfirmDialog } from '@/components/bookings/checkout-confirm-dialog'
import { formatNaira } from '@/lib/utils/currency'
import { usePageData } from '@/hooks/use-page-data'
import { useAuth } from '@/lib/auth-context'
import { hasPermission } from '@/lib/permissions'
import { Plus, Loader2, Users, LogOut, DoorOpen, Bed, AlertTriangle, CalendarClock } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { getUserDisplayName } from '@/lib/utils/user-display'
import { fetchUserDisplayNameMap } from '@/lib/utils/fetch-user-display-names'
import { getBulkGroupId } from '@/lib/utils/bulk-booking'
import { manualCheckoutEligible, resolvedCheckoutDateForClosing, hideChargeExtendInBookingsTable, DEFAULT_ORG_CHECKOUT_TIME, isPastCheckoutCutoff } from '@/lib/utils/booking-checkout-ui'
import { fetchOrgCheckoutTime } from '@/lib/utils/org-checkout-policy'
import { folioPositiveOutstandingSum, shouldReconcileBookingPaymentPaid } from '@/lib/utils/booking-bill-balance'
import { bookingYmdHotel, isInHouseOnCalendarDay, todayYmdHotel } from '@/lib/utils/booking-in-house-dates'
import { resolveHotelTimeZone } from '@/lib/hotel-date'
import { cancelBookingReservation } from '@/lib/reservations/cancel-reservation'

interface Booking {
  id: string
  folio_id: string
  guest_id?: string | null
  room_id?: string | null
  check_in: string
  check_out: string
  number_of_nights: number
  status: string
  payment_status: string
  payment_method?: string
  ledger_account_name?: string
  guestName?: string
  guestPhone?: string
  organization_id?: string
  rate_per_night: number
  total_amount: number
  balance: number
  deposit: number
  created_by?: string
  created_by_name?: string
  updated_by?: string
  updated_by_name?: string
  updated_at?: string
  notes?: string
  is_bulk?: boolean
  bulk_group_id?: string
  /** Folios in this bulk group (for grouped rows only) */
  bulk_members?: Booking[]
  room_count?: number
  guest_count?: number
  guests?: { name: string; phone: string }
  rooms?: { id?: string; room_number: string; room_type: string }
  folio_status?: string | null
}

type BookingsCheckoutDraft =
  | { kind: 'single'; booking: Booking }
  | { kind: 'bulk'; bulkRow: Booking; targets: Booking[] }

export default function BookingsPage() {
  /** Default table view: in-house stays (fast). */
  const [inHouseBookings, setInHouseBookings] = useState<Booking[]>([])
  /** Full folio catalog for search (last 90 days). */
  const [allBookingsCatalog, setAllBookingsCatalog] = useState<Booking[]>([])
  const [modalOpen, setModalOpen] = useState(false)
  const [bulkModalOpen, setBulkModalOpen] = useState(false)
  const [extendModalOpen, setExtendModalOpen] = useState(false)
  const [addChargeModalOpen, setAddChargeModalOpen] = useState(false)
  const [selectedBooking, setSelectedBooking] = useState<any>(null)
  const [checkoutLoadingId, setCheckoutLoadingId] = useState<string | null>(null)
  const [checkoutLoadingGroupId, setCheckoutLoadingGroupId] = useState<string | null>(null)
  const [checkoutDraft, setCheckoutDraft] = useState<BookingsCheckoutDraft | null>(null)
  const [cancelReserveLoadingId, setCancelReserveLoadingId] = useState<string | null>(null)
  const [reserveCheckInBooking, setReserveCheckInBooking] = useState<ReserveCheckInBooking | null>(null)
  const [reserveCheckInOpen, setReserveCheckInOpen] = useState(false)
  const { initialLoading, startFetch, endFetch } = usePageData()
  const { organizationId, role, userId } = useAuth()
  const router = useRouter()
  const canManageFolio = role === 'superadmin' || role === 'admin' || role === 'front_desk'
  const canCheckInReserved = hasPermission(role, 'bookings:checkin')
  const canCancelReservation = hasPermission(role, 'reservations:delete')

  const [orgCheckoutTime, setOrgCheckoutTime] = useState(DEFAULT_ORG_CHECKOUT_TIME)
  /** Drives server fetch scope; default shows only in-house checked-in guests (fast). */
  const [tableFilters, setTableFilters] = useState<Record<string, string>>({
    status: 'checked_in',
    payment_status: 'all',
  })
  const [tableSearchQuery, setTableSearchQuery] = useState('')
  const [roomStats, setRoomStats] = useState<{
    total: number
    occupied: number
    availableForCheckin: number
    outOfOrder: number
    dueOutToday: number
  } | null>(null)

  useEffect(() => {
    if (!organizationId) return
    let cancelled = false
    ;(async () => {
      const supabase = createClient()
      if (!supabase) return
      const checkoutTime = await fetchOrgCheckoutTime(supabase, organizationId)
      if (!cancelled) {
        setOrgCheckoutTime(checkoutTime)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [organizationId])

  const refreshRoomStats = useCallback(async () => {
    if (!organizationId) return
    const supabase = createClient()
    if (!supabase) return
    const tz = resolveHotelTimeZone()
    const today = todayYmdHotel(tz)

    const [{ data: roomRows, error: roomErr }, { data: dueBookings, error: dueErr }] = await Promise.all([
      supabase.from('rooms').select('status').eq('organization_id', organizationId),
      supabase
        .from('bookings')
        .select('check_in, check_out, status')
        .eq('organization_id', organizationId)
        .in('status', ['checked_in', 'confirmed', 'reserved']),
    ])

    if (roomErr) {
      console.warn('[bookings] room stats:', roomErr.message)
      return
    }
    if (dueErr) {
      console.warn('[bookings] due-out stats:', dueErr.message)
    }

    const norm = (s: string | null | undefined) => String(s || '').toLowerCase().replace(/-/g, '_')
    const list = roomRows || []
    const occupied = list.filter((r: { status?: string }) => norm(r.status) === 'occupied').length
    const outOfOrder = list.filter((r: { status?: string }) => norm(r.status) === 'out_of_order').length
    const unavailableForCheckin = list.filter((r: { status?: string }) => {
      const s = norm(r.status)
      return s === 'occupied' || s === 'out_of_order'
    }).length
    const availableForCheckin = list.length - unavailableForCheckin

    let dueOutToday = 0
    for (const b of dueBookings || []) {
      const row = b as { check_in?: string; check_out?: string; status?: string }
      const ci = row.check_in
      const co = row.check_out
      if (!ci || !co) continue
      if (bookingYmdHotel(co, tz) !== today) continue
      if (!isInHouseOnCalendarDay(ci, co, today, tz)) continue
      dueOutToday += 1
    }

    setRoomStats({
      total: list.length,
      occupied,
      availableForCheckin,
      outOfOrder,
      dueOutToday,
    })
  }, [organizationId])

  const fetchBookings = useCallback(async () => {
    startFetch()
    try {
      const supabase = createClient()

      if (!supabase || !organizationId) {
        setInHouseBookings([])
        setAllBookingsCatalog([])
        return
      }

      const loadScope = async (statusKey: string) => {
      const tz = resolveHotelTimeZone()
      const today = todayYmdHotel(tz)
      const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
      const fortyFiveDaysAgo = new Date(Date.now() - 45 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
      const sixtyDaysAgo = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]

      let query = supabase
        .from('bookings')
        .select('*, guests(name, phone), rooms(id, room_number, room_type), created_by, updated_by, updated_at')
        .eq('organization_id', organizationId)

      if (statusKey === 'checked_in') {
        // In-house: folio often stays "confirmed" after walk-in; avoid strict timestamp filters (TZ/casts).
        query = query.in('status', ['checked_in', 'confirmed', 'reserved']).gte('check_out', today)
      } else if (statusKey === 'all') {
        query = query
          .in('status', ['confirmed', 'checked_in', 'reserved', 'checked_out'])
          .gte('check_in', ninetyDaysAgo)
      } else if (statusKey === 'checked_out') {
        query = query.eq('status', 'checked_out').gte('check_out', sixtyDaysAgo)
      } else {
        query = query.eq('status', statusKey).gte('check_in', fortyFiveDaysAgo)
      }

      const { data, error } = await query
        .order('check_in', { ascending: false })
        .order('created_at', { ascending: false })

      if (error) throw error

      // Fetch creator and updater profiles for all bookings
      const userIds = Array.from(
        new Set(
          [...(data || []).map((b: any) => b.created_by), ...(data || []).map((b: any) => b.updated_by)].filter(
            Boolean,
          ),
        ),
      )
      const userMap = await fetchUserDisplayNameMap(userIds as string[], userId)

      // Derive payment_method from notes field (since there's no payment_method column on bookings)
      let bookingsWithUsers = (data || []).map((booking: any) => {
        let payment_method = 'cash'
        let ledger_account_name = ''
        if (booking.notes) {
          if (booking.notes.startsWith('city_ledger:')) {
            payment_method = 'city_ledger'
            ledger_account_name = booking.notes.replace(/^city_ledger:\s*/i, '')
          } else if (booking.notes.startsWith('City Ledger:')) {
            payment_method = 'city_ledger'
            ledger_account_name = booking.notes.replace(/^City Ledger:\s*/, '')
          } else if (booking.notes.startsWith('payment_method:')) {
            payment_method = booking.notes.replace(/^payment_method:\s*/, '').split('|')[0].trim()
            const match = booking.notes.match(/\|ledger:(.+)/)
            if (match) ledger_account_name = match[1].trim()
          }
        }
        return {
          ...booking,
          _db_balance: Number(booking.balance ?? 0),
          payment_method,
          ledger_account_name,
          guestName: booking.guests?.name || '',
          guestPhone: booking.guests?.phone || '',
          created_by_name: booking.created_by
            ? userMap[booking.created_by] || getUserDisplayName(null, booking.created_by)
            : 'System',
          updated_by_name: booking.updated_by
            ? userMap[booking.updated_by] || getUserDisplayName(null, booking.updated_by)
            : null,
        }
      })

      if (statusKey === 'checked_in') {
        bookingsWithUsers = bookingsWithUsers.filter((b: any) => {
          const st = String(b.status || '').toLowerCase()
          if (!['checked_in', 'confirmed', 'reserved'].includes(st)) return false
          return isInHouseOnCalendarDay(b.check_in, b.check_out, today, tz)
        })
      }

      // Derive each booking's balance from folio (same rules as booking detail / bill card)
      const bookingIds = bookingsWithUsers.map((b: any) => b.id)
      if (bookingIds.length > 0) {
        const { data: allFolioCharges } = await supabase
          .from('folio_charges')
          .select('booking_id, amount, payment_status, charge_type, payment_method')
          .in('booking_id', bookingIds)
        if (allFolioCharges) {
          const chargesByBooking: Record<
            string,
            { amount?: unknown; type?: string | null; charge_type?: string | null; payment_status?: string | null; payment_method?: string | null }[]
          > = {}
          for (const c of allFolioCharges as any[]) {
            const id = c.booking_id as string
            if (!chargesByBooking[id]) chargesByBooking[id] = []
            chargesByBooking[id].push({
              amount: c.amount,
              type: c.charge_type,
              charge_type: c.charge_type,
              payment_status: c.payment_status,
              payment_method: c.payment_method,
            })
          }
          bookingsWithUsers.forEach((b: any) => {
            const ch = chargesByBooking[b.id] ?? []
            b.balance = folioPositiveOutstandingSum(ch)
          })

          const healIds = bookingsWithUsers
            .filter((b: any) =>
              shouldReconcileBookingPaymentPaid(
                {
                  total_amount: b.total_amount,
                  deposit: b.deposit,
                  balance: b._db_balance,
                  payment_status: b.payment_status,
                },
                chargesByBooking[b.id] ?? [],
              ),
            )
            .map((b: any) => b.id as string)

          if (healIds.length > 0) {
            bookingsWithUsers.forEach((b: any) => {
              if (healIds.includes(b.id)) b.payment_status = 'paid'
            })
            void Promise.all(
              healIds.map((id: string) =>
                supabase.from('bookings').update({ payment_status: 'paid' }).eq('id', id),
              ),
            )
          }
        }
      }

      bookingsWithUsers.forEach((b: any) => {
        delete b._db_balance
      })

      return groupBulkRows(bookingsWithUsers)
      }

      const loadBoth = async () => {
        const [inHouse, catalog] = await Promise.all([
          loadScope('checked_in'),
          loadScope('all'),
        ])
        setInHouseBookings(inHouse)
        setAllBookingsCatalog(catalog)
      }

      await Promise.race([
        loadBoth(),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('Bookings request timed out')), 25_000),
        ),
      ])
    } catch (error: any) {
      console.error('Error fetching bookings:', error)
      const msg = error?.message === 'Bookings request timed out'
        ? 'Bookings took too long — showing empty list. Try Refresh or a narrower status filter.'
        : 'Failed to load bookings'
      toast.error(msg)
      setInHouseBookings([])
      setAllBookingsCatalog([])
    } finally {
      void refreshRoomStats()
      endFetch()
    }
  }, [organizationId, userId, refreshRoomStats, startFetch, endFetch])

  useEffect(() => {
    if (!organizationId) {
      setInHouseBookings([])
      setAllBookingsCatalog([])
      endFetch()
      return
    }
    fetchBookings()
  }, [organizationId, userId, fetchBookings, endFetch])

  useEffect(() => {
    if (!organizationId) {
      setRoomStats(null)
      return
    }
    void refreshRoomStats()
  }, [organizationId, refreshRoomStats])

  const statusColors: Record<string, string> = {
    reserved: 'bg-blue-500/10 text-blue-700 border-blue-200',
    confirmed: 'bg-sky-500/10 text-sky-800 border-sky-200',
    checked_in: 'bg-green-500/10 text-green-700 border-green-200',
    checked_out: 'bg-gray-500/10 text-gray-700 border-gray-200',
    no_show: 'bg-orange-500/10 text-orange-700 border-orange-200',
    cancelled: 'bg-red-500/10 text-red-700 border-red-200',
  }

  const paymentColors: Record<string, string> = {
    paid: 'bg-green-500/10 text-green-700 border-green-200',
    partial: 'bg-yellow-500/10 text-yellow-700 border-yellow-200',
    pending: 'bg-orange-500/10 text-orange-700 border-orange-200',
    cancelled: 'bg-red-500/10 text-red-700 border-red-200',
    credit: 'bg-blue-500/10 text-blue-700 border-blue-200',
  }

  const paymentCellForBooking = (booking: Booking) => {
    const bal = Number(booking.balance ?? 0)
    const owed = Math.max(0, bal)
    const creditAmt = bal < 0 ? -bal : 0
    const isCancelledLike = booking.status === 'cancelled'

    if (creditAmt > 0) {
      return {
        badgeClass: paymentColors.credit,
        badgeText: 'credit',
        owedLine: null as number | null,
        creditLine: creditAmt,
      }
    }

    let effectiveStatus =
      booking.payment_method === 'city_ledger' && booking.payment_status === 'paid' && owed > 0
        ? 'pending'
        : booking.payment_status

    if (!isCancelledLike && owed <= 0) {
      effectiveStatus = 'paid'
    }

    const key = String(effectiveStatus || 'pending').toLowerCase()
    return {
      badgeClass: paymentColors[key] ?? paymentColors.pending,
      badgeText: key,
      owedLine: owed > 0 ? owed : null,
      creditLine: null as number | null,
    }
  }

  const calculateNights = (checkIn: string | Date, checkOut: string | Date) => {
    const start = typeof checkIn === 'string' ? new Date(checkIn) : checkIn
    const end = typeof checkOut === 'string' ? new Date(checkOut) : checkOut
    return Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24))
  }

  const groupBulkRows = (rows: Booking[]) => {
    const grouped = new Map<string, Booking[]>()
    const singles: Booking[] = []

    rows.forEach((row) => {
      const groupId = getBulkGroupId(row)
      if (!groupId) {
        singles.push(row)
        return
      }
      grouped.set(groupId, [...(grouped.get(groupId) || []), row])
    })

    const bulkRows = Array.from(grouped.entries()).map(([groupId, groupRows]) => {
      const first = groupRows[0]
      const guestNames = Array.from(new Set(groupRows.map(row => row.guests?.name).filter(Boolean)))
      const roomTypes = Array.from(new Set(groupRows.map(row => row.rooms?.room_type).filter(Boolean)))
      return {
        ...first,
        id: first.id,
        folio_id: `Bulk ${groupId}`,
        is_bulk: true,
        bulk_group_id: groupId,
        bulk_members: groupRows,
        room_count: groupRows.length,
        guest_count: guestNames.length,
        total_amount: groupRows.reduce((sum, row) => sum + Number(row.total_amount || 0), 0),
        deposit: groupRows.reduce((sum, row) => sum + Number(row.deposit || 0), 0),
        balance: groupRows.reduce((sum, row) => sum + Number(row.balance || 0), 0),
        guests: {
          name: guestNames.length > 1 ? `${guestNames[0]} + ${guestNames.length - 1} more` : guestNames[0] || 'Bulk Guests',
          phone: `${groupRows.length} room${groupRows.length === 1 ? '' : 's'}`,
        },
        guestName: guestNames.join(' '),
        rooms: {
          room_number: `${groupRows.length}`,
          room_type: roomTypes.join(', ') || 'Multiple rooms',
        },
      }
    })

    return [...bulkRows, ...singles].sort((a, b) => new Date(b.check_in).getTime() - new Date(a.check_in).getTime())
  }

  const handleBulkCheckoutFromTable = (bulkRow: Booking) => {
    const members = bulkRow.bulk_members || []
    const targets = members.filter((m) =>
      manualCheckoutEligible(
        {
          status: m.status,
          check_in: m.check_in,
          check_out: m.check_out,
          folio_status: m.folio_status,
        },
        orgCheckoutTime,
      ),
    )

    if (targets.length === 0) {
      toast.message('No folios in this group are available for checkout (already checked out or past auto-checkout window).')
      return
    }
    setCheckoutDraft({ kind: 'bulk', bulkRow, targets })
  }

  const handleCancelReserveFromTable = (booking: Booking) => {
    toast.custom(
      (tid: string | number) => (
        <div className="flex flex-col gap-3">
          <div className="flex gap-2 items-start">
            <LogOut className="w-5 h-5 text-red-600 mt-0.5 shrink-0" />
            <div>
              <p className="font-semibold">Cancel this reservation?</p>
              <p className="text-sm text-muted-foreground">The folio is marked cancelled; any held room is freed.</p>
            </div>
          </div>
          <div className="flex gap-2 justify-end">
            <Button variant="outline" size="sm" onClick={() => toast.dismiss(tid)}>Keep</Button>
            <Button
              variant="destructive"
              size="sm"
              disabled={cancelReserveLoadingId === booking.id}
              onClick={async () => {
                toast.dismiss(tid)
                setCancelReserveLoadingId(booking.id)
                try {
                  const supabase = createClient()
                  const { error } = await cancelBookingReservation(supabase, {
                    bookingId: booking.id,
                    roomId: booking.room_id,
                    userId,
                  })
                  if (error) throw error
                  toast.success('Reservation cancelled')
                  fetchBookings()
                } catch (err: any) {
                  toast.error(err.message || 'Failed to cancel reservation')
                } finally {
                  setCancelReserveLoadingId(null)
                }
              }}
            >
              Cancel reservation
            </Button>
          </div>
        </div>
      ),
      { duration: Infinity },
    )
  }

  const openReserveCheckIn = (booking: Booking) => {
    setReserveCheckInBooking({
      id: booking.id,
      organization_id: booking.organization_id || organizationId || '',
      folio_id: booking.folio_id,
      check_in: booking.check_in,
      check_out: booking.check_out,
      guest_id: booking.guest_id,
      room_id: booking.room_id,
      rate_per_night: booking.rate_per_night,
      guests: booking.guests?.name ? { name: booking.guests.name } : null,
      rooms: booking.rooms?.room_number
        ? {
            id: booking.rooms.id,
            room_number: booking.rooms.room_number,
            room_type: booking.rooms.room_type,
          }
        : null,
    })
    setReserveCheckInOpen(true)
  }

  const handleCheckoutFromTable = (booking: Booking) => {
    setCheckoutDraft({ kind: 'single', booking })
  }

  const checkoutDialogBusy =
    checkoutDraft?.kind === 'single'
      ? checkoutLoadingId === checkoutDraft.booking.id
      : checkoutDraft?.kind === 'bulk'
        ? checkoutLoadingGroupId === (checkoutDraft.bulkRow.bulk_group_id ?? '')
        : false

  const confirmCheckoutFromDialog = async () => {
    if (!checkoutDraft || !userId) return

    if (checkoutDraft.kind === 'single') {
      const booking = checkoutDraft.booking
      setCheckoutLoadingId(booking.id)
      try {
        const supabase = createClient()
        const outDate = resolvedCheckoutDateForClosing(booking)
        const { error } = await supabase
          .from('bookings')
          .update({
            status: 'checked_out',
            check_out: outDate,
            folio_status: 'checked_out',
            updated_by: userId,
          })
          .eq('id', booking.id)
        if (error) throw error
        if (booking.room_id) {
          await supabase.from('rooms').update({ status: 'available' }).eq('id', booking.room_id)
        }
        toast.success(`${booking.guests?.name} checked out successfully`)
        setCheckoutDraft(null)
        fetchBookings()
      } catch (err: any) {
        toast.error(err.message || 'Failed to check out guest')
      } finally {
        setCheckoutLoadingId(null)
      }
      return
    }

    const { targets, bulkRow } = checkoutDraft
    const gid = bulkRow.bulk_group_id ?? ''
    setCheckoutLoadingGroupId(gid)
    try {
      const supabase = createClient()
      for (const m of targets) {
        const outDate = resolvedCheckoutDateForClosing(m)
        const { error } = await supabase
          .from('bookings')
          .update({
            status: 'checked_out',
            check_out: outDate,
            folio_status: 'checked_out',
            updated_by: userId,
          })
          .eq('id', m.id)
        if (error) throw error
        if (m.room_id) {
          await supabase.from('rooms').update({ status: 'available' }).eq('id', m.room_id)
        }
      }
      toast.success(`Checked out ${targets.length} room${targets.length === 1 ? '' : 's'}`)
      setCheckoutDraft(null)
      fetchBookings()
    } catch (err: any) {
      toast.error(err.message || 'Failed to check out group')
    } finally {
      setCheckoutLoadingGroupId(null)
    }
  }

  if (initialLoading) {
    return (
      <div className="flex items-center justify-center h-96">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <CheckoutConfirmDialog
        open={checkoutDraft !== null}
        onClose={() => {
          if (checkoutDialogBusy) return
          setCheckoutDraft(null)
        }}
        title={
          checkoutDraft?.kind === 'bulk'
            ? `Check out ${checkoutDraft.targets.length} room${checkoutDraft.targets.length === 1 ? '' : 's'}?`
            : 'Check out guest?'
        }
        description={
          checkoutDraft?.kind === 'bulk' ? (
            <>
              <p>
                {checkoutDraft.targets.length} room{checkoutDraft.targets.length === 1 ? '' : 's'} —{' '}
                <span className="font-medium text-foreground">{checkoutDraft.bulkRow.guests?.name}</span>
              </p>
              <p className="mt-1">All eligible folios in this bulk group will be marked checked out.</p>
            </>
          ) : checkoutDraft?.kind === 'single' ? (
            <>
              <p>
                <span className="font-medium text-foreground">{checkoutDraft.booking.guests?.name}</span>
                {' — '}
                Room {checkoutDraft.booking.rooms?.room_number}
              </p>
              <p className="mt-1">This closes the folio and frees the room.</p>
            </>
          ) : undefined
        }
        outstandingAmount={
          checkoutDraft?.kind === 'bulk'
            ? checkoutDraft.targets.reduce((s, m) => s + Number(m.balance ?? 0), 0)
            : checkoutDraft?.kind === 'single'
              ? Number(checkoutDraft.booking.balance ?? 0)
              : undefined
        }
        outstandingLabel={checkoutDraft?.kind === 'bulk' ? 'Outstanding (sum):' : 'Outstanding balance:'}
        loading={checkoutDialogBusy}
        onConfirm={confirmCheckoutFromDialog}
      />

      <NewBookingModal open={modalOpen} onClose={() => { setModalOpen(false); fetchBookings() }} />
      <BulkBookingModal
        wording="booking"
        open={bulkModalOpen}
        onClose={() => setBulkModalOpen(false)}
        onSuccess={() => {
          setBulkModalOpen(false)
          fetchBookings()
        }}
      />
      <ReserveCheckInModal
        open={reserveCheckInOpen}
        onClose={() => { setReserveCheckInOpen(false); setReserveCheckInBooking(null) }}
        onSuccess={fetchBookings}
        booking={reserveCheckInBooking}
        userId={userId || ''}
      />
      {selectedBooking && (
        <>
          <ExtendStayModal 
            open={extendModalOpen} 
            onClose={() => {
              setExtendModalOpen(false)
              fetchBookings()
            }}
            booking={selectedBooking}
          />
          <AddChargeModal 
            open={addChargeModalOpen} 
            onClose={() => {
              setAddChargeModalOpen(false)
              fetchBookings()
            }}
            booking={selectedBooking}
          />
        </>
      )}
      
      <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between lg:gap-3">
        <div className="min-w-0 space-y-1">
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">Bookings</h1>
          <p className="text-muted-foreground text-xs sm:text-sm leading-snug max-w-3xl">
            Default: <strong>in-house</strong> stays only (fast). Search finds any booking in the last 90 days.
            Change Status for history. Checkout frees the room.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-1.5 shrink-0">
          {roomStats !== null && (
            <>
              <div
                className="inline-flex h-7 items-center gap-1 rounded-md border border-input bg-background px-1.5 text-[10px] font-medium leading-none shadow-sm"
                title="Rooms with status Occupied (set from bookings / front desk)"
              >
                <Bed className="h-3 w-3 shrink-0 text-muted-foreground" aria-hidden />
                <span className="text-muted-foreground">Occ</span>
                <span className="tabular-nums text-foreground">{roomStats.occupied}</span>
              </div>
              <div
                className="inline-flex h-7 items-center gap-1 rounded-md border border-input bg-background px-1.5 text-[10px] font-medium leading-none shadow-sm"
                title="Rooms not Occupied and not Out of order — available for check-in"
              >
                <DoorOpen className="h-3 w-3 shrink-0 text-muted-foreground" aria-hidden />
                <span className="text-muted-foreground">Avail</span>
                <span className="tabular-nums text-foreground">{roomStats.availableForCheckin}</span>
              </div>
              <div
                className="inline-flex h-7 items-center gap-1 rounded-md border border-input bg-background px-1.5 text-[10px] font-medium leading-none shadow-sm"
                title="In-house folios with checkout today (hotel date)"
              >
                <CalendarClock className="h-3 w-3 shrink-0 text-muted-foreground" aria-hidden />
                <span className="text-muted-foreground">Due</span>
                <span className="tabular-nums text-foreground">{roomStats.dueOutToday}</span>
              </div>
              <div
                className="inline-flex h-7 items-center gap-1 rounded-md border border-input bg-background px-1.5 text-[10px] font-medium leading-none shadow-sm"
                title="Rooms marked Out of order"
              >
                <AlertTriangle className="h-3 w-3 shrink-0 text-muted-foreground" aria-hidden />
                <span className="text-muted-foreground">OOO</span>
                <span className="tabular-nums text-foreground">{roomStats.outOfOrder}</span>
              </div>
              <span className="text-[9px] text-muted-foreground tabular-nums hidden sm:inline px-0.5" title="Total rooms">
                /{roomStats.total}
              </span>
            </>
          )}
          {hasPermission(role, 'bookings:create') && (
            <>
              <Button variant="outline" size="sm" className="h-7 text-[10px] px-2" onClick={() => setBulkModalOpen(true)}>
                <Users className="mr-1 h-3 w-3" />
                Bulk Booking
              </Button>
              <Button size="sm" className="h-7 text-[10px] px-2" onClick={() => setModalOpen(true)}>
                <Plus className="mr-1 h-3 w-3" />
                New Booking
              </Button>
            </>
          )}
        </div>
      </div>

      <EnhancedDataTable
        data={allBookingsCatalog}
        listWhenSearchEmpty={
          tableFilters.status === 'checked_in' ? inHouseBookings : undefined
        }
        compactTable
        rowKey={(b) => (b.is_bulk && b.bulk_group_id ? `bulk-${b.bulk_group_id}` : String(b.id))}
        controlledActiveFilters={tableFilters}
        onControlledActiveFiltersChange={setTableFilters}
        onSearchQueryChange={setTableSearchQuery}
        filterKeysIgnoredWhileSearching={['status']}
        searchPlaceholder="Search all bookings by guest, room, folio…"
        searchMatch={(b, query) => {
          const q = query.trim().toLowerCase()
          if (!q) return true
          const parts: string[] = [
            String(b.folio_id ?? ''),
            String(b.guestName ?? ''),
            String(b.guests?.name ?? ''),
            String(b.guestPhone ?? ''),
            String(b.guests?.phone ?? ''),
            String(b.ledger_account_name ?? ''),
            String(b.rooms?.room_number ?? ''),
            String(b.rooms?.room_type ?? ''),
          ]
          if (b.is_bulk && b.bulk_members) {
            for (const m of b.bulk_members) {
              parts.push(
                String(m.guests?.name ?? ''),
                String(m.guests?.phone ?? ''),
                String(m.rooms?.room_number ?? ''),
              )
            }
          }
          return parts.some((p) => p.toLowerCase().includes(q))
        }}
        resolveFilterMatch={(row, key, val) => {
          if (key !== 'status' || val.trim().toLowerCase() !== 'checked_in') return undefined
          const r = row as Booking
          if (r.is_bulk && r.bulk_members?.length) {
            return r.bulk_members.some((m) =>
              ['checked_in', 'confirmed', 'reserved'].includes(String(m.status || '').toLowerCase()),
            )
          }
          const st = String(r.status || '').toLowerCase()
          return ['checked_in', 'confirmed', 'reserved'].includes(st)
        }}
        filters={[
          {
            key: 'payment_status',
            label: 'Payment Status',
            options: [
              { value: 'paid', label: 'Paid' },
              { value: 'partial', label: 'Partial' },
              { value: 'pending', label: 'Pending' },
            ],
          },
          {
            key: 'status',
            label: 'Status',
            options: [
              { value: 'checked_in', label: 'Checked in (in house)' },
              { value: 'reserved', label: 'Reserved' },
              { value: 'confirmed', label: 'Confirmed' },
              { value: 'checked_out', label: 'Checked out' },
            ],
          },
        ]}
        emptyState={{
          title: 'No bookings match your filters',
          description:
            'Uses the hotel calendar (Africa/Lagos by default). In-house includes folios still marked Confirmed. Try another status or clear the check-in date picker.',
        }}
        dateField="check_in"
        columns={[
          {
            key: 'guest',
            label: 'Guest',
            render: (booking) => (
              <div
                className="cursor-pointer hover:text-primary"
                onClick={() => router.push(booking.is_bulk ? `/bulk-bookings/${booking.bulk_group_id}` : `/bookings/${booking.id}`)}
              >
                <div className="font-medium max-md:text-[13px]">{booking.guests?.name}</div>
                <div className="text-xs text-muted-foreground">{booking.guests?.phone}</div>
              </div>
            ),
          },
          {
            key: 'room',
            label: 'Room',
            render: (booking) => (
              <div>
                <div className="font-medium max-md:text-[13px]">{booking.is_bulk ? `${booking.room_count} Rooms` : `Room ${booking.rooms?.room_number}`}</div>
                <div className="text-xs text-muted-foreground">{booking.rooms?.room_type}</div>
              </div>
            ),
          },
          {
            key: 'check_in',
            label: 'Check-in',
            render: (booking) => (
              <div className="text-sm max-md:text-xs">
                {new Date(booking.check_in).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })}
              </div>
            ),
          },
          {
            key: 'check_out',
            label: 'Check-out',
            render: (booking) => {
              const today = new Date().toISOString().split('T')[0]
              const coYmd =
                typeof booking.check_out === 'string'
                  ? booking.check_out.split('T')[0].slice(0, 10)
                  : ''
              const pastCut =
                booking.status === 'checked_in' &&
                isPastCheckoutCutoff({ check_out: booking.check_out }, orgCheckoutTime)
              const isOverdue = booking.status === 'checked_in' && (coYmd < today || (coYmd === today && pastCut))
              const isDueTodayBeforeCutoff =
                booking.status === 'checked_in' && coYmd === today && !pastCut
              return (
                <div className="text-sm space-y-1 max-md:text-xs">
                  <span>{new Date(booking.check_out).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })}</span>
                  {isDueTodayBeforeCutoff && (
                    <Badge variant="outline" className="text-[10px] px-1 py-0 bg-amber-50 text-amber-700 border-amber-200 block w-fit">
                      Due today
                    </Badge>
                  )}
                  {isOverdue && (
                    <Badge variant="outline" className="text-[10px] px-1 py-0 bg-red-50 text-red-600 border-red-200 block w-fit">
                      Overdue
                    </Badge>
                  )}
                </div>
              )
            },
          },
          {
            key: 'payment_status',
            label: 'Payment',
            responsive: 'md+',
            render: (booking) => {
              const { badgeClass, badgeText, owedLine, creditLine } = paymentCellForBooking(booking)
              return (
                <div className="space-y-1">
                  <Badge variant="outline" className={`${badgeClass} max-md:text-[10px]`}>
                    {badgeText}
                  </Badge>
                  {owedLine !== null && (
                    <div className="text-xs text-muted-foreground">
                      Bal: {formatNaira(owedLine)}
                    </div>
                  )}
                  {creditLine !== null && creditLine > 0 && (
                    <div className="text-xs text-muted-foreground">
                      Credit: {formatNaira(creditLine)}
                    </div>
                  )}
                </div>
              )
            },
          },
          {
            key: 'payment_method',
            label: 'Method',
            responsive: 'md+',
            render: (booking) => (
              <div className="space-y-1">
                <Badge variant="outline" className="text-[10px] capitalize max-md:text-[10px]">
                  {(booking.payment_method || 'cash').replace(/_/g, ' ')}
                </Badge>
                {booking.payment_method === 'city_ledger' && booking.ledger_account_name && (
                  <div className="text-[10px] text-muted-foreground truncate max-w-[100px] md:max-w-[120px]">
                    {booking.ledger_account_name}
                  </div>
                )}
              </div>
            ),
          },
          {
            key: 'actions',
            label: 'Actions',
            render: (booking) => {
              const showReserveRow =
                !booking.is_bulk &&
                booking.status === 'reserved' &&
                (canCheckInReserved || canCancelReservation)

              if (!canManageFolio && !booking.is_bulk && !showReserveRow) return null

              if (booking.is_bulk) {
                if (!canManageFolio) return null
                const showBulkCheckout = (booking.bulk_members || []).some((m) =>
                  manualCheckoutEligible(
                    {
                      status: m.status,
                      check_in: m.check_in,
                      check_out: m.check_out,
                      folio_status: m.folio_status,
                    },
                    orgCheckoutTime,
                  ),
                )
                if (!showBulkCheckout) return null
                const gid = booking.bulk_group_id || ''
                return (
                  <div className="flex shrink-0 flex-nowrap gap-0.5">
                    <Button
                      size="sm"
                      variant="outline"
                      title="Check out all eligible rooms in this group"
                      className="h-7 px-2 text-[11px] leading-tight text-amber-700 border-amber-200 hover:bg-amber-50"
                      disabled={checkoutLoadingGroupId === gid}
                      onClick={(e) => {
                        e.stopPropagation()
                        handleBulkCheckoutFromTable(booking)
                      }}
                    >
                      {checkoutLoadingGroupId === gid ? (
                        <Loader2 className="h-3 w-3 animate-spin" />
                      ) : (
                        <>
                          <LogOut className="mr-1 h-3 w-3" />
                          Out
                        </>
                      )}
                    </Button>
                  </div>
                )
              }

              const hideChargeExtend = hideChargeExtendInBookingsTable(
                {
                  check_out: booking.check_out,
                  status: booking.status,
                  check_in: booking.check_in,
                  folio_status: booking.folio_status,
                },
                orgCheckoutTime,
              )

              return (
                <div className="flex shrink-0 flex-wrap gap-0.5">
                  {showReserveRow && canCheckInReserved && (
                    <Button
                      size="sm"
                      variant="outline"
                      title="Check in — pick room when guest arrives"
                      className="h-7 px-2 text-[11px] leading-tight whitespace-nowrap text-green-700 border-green-200 hover:bg-green-50"
                      onClick={(e) => {
                        e.stopPropagation()
                        openReserveCheckIn(booking)
                      }}
                    >
                      <DoorOpen className="mr-1 h-3 w-3 shrink-0 inline" aria-hidden />
                      Check in
                    </Button>
                  )}
                  {showReserveRow && canCancelReservation && (
                    <Button
                      size="sm"
                      variant="outline"
                      title="Cancel reservation"
                      className="h-7 px-2 text-[11px] leading-tight whitespace-nowrap border-destructive/40 text-destructive hover:bg-destructive/10"
                      disabled={cancelReserveLoadingId === booking.id}
                      onClick={(e) => {
                        e.stopPropagation()
                        handleCancelReserveFromTable(booking)
                      }}
                    >
                      Cancel
                    </Button>
                  )}

                  {canManageFolio && booking.room_id ? (
                    <>
                      {!hideChargeExtend && (
                        <>
                          <Button
                            size="sm"
                            variant="outline"
                            title="Add folio charge"
                            className="h-7 px-2 text-[11px] leading-tight whitespace-nowrap"
                            onClick={(e) => {
                              e.stopPropagation()
                              setSelectedBooking({
                                id: booking.id,
                                folioId: booking.folio_id,
                                guestName: booking.guests?.name,
                                guestId: booking.guest_id,
                                room: `Room ${booking.rooms?.room_number}`,
                                currentCheckOut: booking.check_out,
                                ratePerNight: booking.rate_per_night,
                                organization_id: booking.organization_id,
                                created_by: booking.created_by
                              })
                              setAddChargeModalOpen(true)
                            }}
                          >
                            Charge
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            title="Extend stay"
                            className="h-7 px-2 text-[11px] leading-tight whitespace-nowrap"
                            onClick={(e) => {
                              e.stopPropagation()
                              setSelectedBooking({
                                id: booking.id,
                                folioId: booking.folio_id,
                                guestName: booking.guests?.name,
                                guestId: booking.guest_id,
                                room: `Room ${booking.rooms?.room_number}`,
                                currentCheckOut: booking.check_out,
                                ratePerNight: booking.rate_per_night,
                                organization_id: booking.organization_id,
                                created_by: booking.created_by
                              })
                              setExtendModalOpen(true)
                            }}
                          >
                            Extend Stay
                          </Button>
                        </>
                      )}
                      {!manualCheckoutEligible(
                        {
                          status: booking.status,
                          check_in: booking.check_in,
                          check_out: booking.check_out,
                          folio_status: booking.folio_status,
                        },
                        orgCheckoutTime,
                      ) ? null : (
                        <Button
                          size="sm"
                          variant="outline"
                          title="Check out guest"
                          className="h-7 px-2 text-[11px] leading-tight text-amber-700 border-amber-200 hover:bg-amber-50 whitespace-nowrap"
                          disabled={checkoutLoadingId === booking.id}
                          onClick={(e) => {
                            e.stopPropagation()
                            handleCheckoutFromTable(booking)
                          }}
                        >
                          {checkoutLoadingId === booking.id ? (
                            <Loader2 className="h-3 w-3 animate-spin" />
                          ) : (
                            <>
                              <LogOut className="mr-1 h-3 w-3" />Out
                            </>
                          )}
                        </Button>
                      )}
                    </>
                  ) : null}
                </div>
              )
            },
          },
          {
            key: 'folio_id',
            label: 'Folio ID',
            responsive: 'lg+',
            render: (booking) => (
              <div
                className="font-mono text-xs cursor-pointer hover:text-primary lg:text-sm"
                onClick={() => router.push(booking.is_bulk ? `/bulk-bookings/${booking.bulk_group_id}` : `/bookings/${booking.id}`)}
              >
                {booking.is_bulk ? `Bulk (${booking.room_count})` : booking.folio_id}
              </div>
            ),
          },
          {
            key: 'created_by_name',
            label: 'Created By',
            responsive: 'lg+',
            render: (booking) => (
              <div className="text-sm text-muted-foreground">{booking.created_by_name}</div>
            ),
          },
        ]}
        renderCard={(booking) => (
          <CardContent className="p-4">
            <div className="space-y-3">
              <div className="flex items-start justify-between">
                <div>
                  <div className="font-semibold">{booking.guests?.name}</div>
                  <div className="text-sm text-muted-foreground">{booking.guests?.phone}</div>
                </div>
                <Badge variant="outline" className={statusColors[booking.status]}>
                  {booking.status.replace('_', ' ')}
                </Badge>
              </div>
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div>
                  <div className="text-muted-foreground">Room</div>
                  <div className="font-medium">{booking.rooms?.room_number} - {booking.rooms?.room_type}</div>
                </div>
                <div>
                  <div className="text-muted-foreground">Nights</div>
                  <div className="font-medium">{calculateNights(booking.check_in, booking.check_out)}</div>
                </div>
                <div>
                  <div className="text-muted-foreground">Check-in</div>
                  <div className="font-medium">{new Date(booking.check_in).toLocaleDateString('en-GB')}</div>
                </div>
                <div>
                  <div className="text-muted-foreground">Payment</div>
                  <div className="space-y-1">
                    {(() => {
                      const { badgeClass, badgeText, owedLine, creditLine } = paymentCellForBooking(booking)
                      return (
                        <>
                          <Badge variant="outline" className={badgeClass}>
                            {badgeText}
                          </Badge>
                          {owedLine !== null && (
                            <div className="text-xs text-muted-foreground">
                              Bal: {formatNaira(owedLine)}
                            </div>
                          )}
                          {creditLine !== null && creditLine > 0 && (
                            <div className="text-xs text-muted-foreground">
                              Credit: {formatNaira(creditLine)}
                            </div>
                          )}
                        </>
                      )
                    })()}
                  </div>
                </div>
              </div>
              {(() => {
                const owed = Math.max(0, Number(booking.balance ?? 0))
                return (
                  <>
                    {owed > 0 && (
                      <div className="pt-2 border-t text-sm">
                        <span className="text-muted-foreground">Balance:</span>{' '}
                        <span className="font-semibold text-destructive">{formatNaira(owed)}</span>
                      </div>
                    )}
                  </>
                )
              })()}
            </div>
          </CardContent>
        )}
        itemsPerPage={15}
      />
    </div>
  )
}
