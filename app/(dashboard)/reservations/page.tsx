'use client'

import { useState, useEffect, useMemo } from 'react'
import { createClient } from '@/lib/supabase/client'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { EnhancedDataTable } from '@/components/shared/enhanced-data-table'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { CardContent } from '@/components/ui/card'
import { formatNaira } from '@/lib/utils/currency'
import { PageLoadingState } from '@/components/loading-screen'
import { usePageData } from '@/hooks/use-page-data'
import { useAuth } from '@/lib/auth-context'
import { hasPermission } from '@/lib/permissions'
import { Plus, Users, DoorOpen, CalendarClock, Banknote, Receipt } from 'lucide-react'
import { CompactStatBadgeRow } from '@/components/shared/compact-stat-badges'
import { BulkBookingModal } from '@/components/reservations/bulk-booking-modal'
import { NewReservationModal } from '@/components/reservations/new-reservation-modal'
import { ReserveCheckInModal, type ReserveCheckInBooking } from '@/components/reservations/reserve-checkin-modal'
import { getUserDisplayName } from '@/lib/utils/user-display'
import { fetchUserDisplayNameMap } from '@/lib/utils/fetch-user-display-names'
import { getBulkGroupId, isLegacyBulkGroupId } from '@/lib/utils/bulk-booking'
import { cancelBookingReservation, isCancellableReservationStatus } from '@/lib/reservations/cancel-reservation'
import { isNoShowEligibleStatus } from '@/lib/reservations/mark-no-show'
import { MarkNoShowDialog } from '@/components/reservations/mark-no-show-dialog'
import { networkFetchHint, withFetchRetry } from '@/lib/utils/fetch-retry'
import { toast } from 'sonner'
import { useReservationsEventsHeader } from '@/components/reservations/reservations-events-header'
import { formatShortStayDates, MobileTableSubdetail } from '@/lib/utils/table-mobile'
import { calendarPickerYmd } from '@/lib/utils/booking-in-house-dates'
import {
  parseBookingNotesMeta,
  formatBookingPaymentMethodLabel,
  bookingAmountPaid,
} from '@/lib/booking/parse-booking-notes'
import { paymentMethodRequiresAccount } from '@/lib/payments/payment-accounts'
import {
  TABLE_ACTIONS_ROW,
  TABLE_INLINE_ROW,
  TABLE_META_TEXT,
  TABLE_CELL_TRUNCATE,
  TABLE_STACKED_CELL,
} from '@/lib/utils/table-row-inline'

const RESERVATIONS_LIST_LIMIT = 500

function describeFetchError(err: unknown): string {
  if (err instanceof Error) return err.message
  if (err && typeof err === 'object') {
    const row = err as { message?: string; code?: string; details?: string }
    if (row.message) return row.message
    if (row.code) return row.code
    if (row.details) return row.details
  }
  try {
    return JSON.stringify(err)
  } catch {
    return String(err)
  }
}

interface Reservation {
  id: string
  organization_id?: string
  folio_id: string
  guest_id?: string | null
  room_id?: string | null
  check_in: string
  check_out: string
  status: string
  payment_status: string
  payment_method?: string
  ledger_account_name?: string
  payment_account_label?: string
  last_reschedule?: string | null
  guestName?: string
  guestPhone?: string
  rate_per_night: number
  balance: number
  deposit: number
  notes?: string
  created_by?: string
  created_by_name?: string
  updated_by?: string
  updated_by_name?: string
  is_bulk?: boolean
  bulk_group_id?: string
  room_count?: number
  guest_count?: number
  total_amount?: number
  guests?: { name: string; phone: string }
  rooms?: { id?: string; room_number: string; room_type: string }
}

export default function ReservationsPage() {
  const router = useRouter()
  const [reservations, setReservations] = useState<Reservation[]>([])
  const [bulkModalOpen, setBulkModalOpen] = useState(false)
  const [newReservationOpen, setNewReservationOpen] = useState(false)
  const [reserveCheckInOpen, setReserveCheckInOpen] = useState(false)
  const [reserveCheckInBooking, setReserveCheckInBooking] = useState<ReserveCheckInBooking | null>(null)
  const [cancelReserveLoadingId, setCancelReserveLoadingId] = useState<string | null>(null)
  const [noShowDialogOpen, setNoShowDialogOpen] = useState(false)
  const [noShowBooking, setNoShowBooking] = useState<{
    id: string
    guestName?: string
    folio_id?: string
    rate_per_night?: number
    total_amount?: number
    check_in?: string
    check_out?: string
  } | null>(null)
  const [statsDateYmd, setStatsDateYmd] = useState<string | null>(null)
  const { initialLoading, startFetch, endFetch } = usePageData()
  const { organizationId, role, userId } = useAuth()
  const { setHeaderActions } = useReservationsEventsHeader()

  useEffect(() => {
    fetchReservations()
  }, [organizationId])

  useEffect(() => {
    if (!hasPermission(role, 'reservations:create')) {
      setHeaderActions(null)
      return
    }
    setHeaderActions(
      <>
        <Button
          variant="outline"
          size="sm"
          onClick={() => setBulkModalOpen(true)}
        >
          <Users className="mr-2 h-4 w-4" />
          Bulk Reservation
        </Button>
        <Button size="sm" onClick={() => setNewReservationOpen(true)}>
          <Plus className="mr-2 h-4 w-4" />
          New Reservation
        </Button>
      </>,
    )
    return () => setHeaderActions(null)
  }, [role, setHeaderActions])

  const pageStats = useMemo(() => {
    const rows = statsDateYmd
      ? reservations.filter((r) => String(r.check_in).slice(0, 10) === statsDateYmd)
      : reservations
    return {
      count: rows.length,
      revenue: rows.reduce((sum, r) => sum + Number(r.total_amount || 0), 0),
      deposits: rows.reduce((sum, r) => sum + Number(r.deposit || 0), 0),
    }
  }, [reservations, statsDateYmd])

  const fetchReservations = async () => {
    if (!organizationId) {
      setReservations([])
      return
    }
    const supabase = createClient()
    if (!supabase) {
      setReservations([])
      return
    }

    try {
      startFetch()

      const data = await Promise.race([
        withFetchRetry(async () => {
          const { data: rows, error } = await supabase
            .from('bookings')
            .select(
              `
          id, organization_id, folio_id, guest_id, room_id, check_in, check_out, status, payment_status,
          rate_per_night, total_amount, balance, deposit, notes, created_by, created_at,
          guests(name, phone),
          rooms(id, room_number, room_type)
        `,
            )
            .eq('organization_id', organizationId)
            .eq('status', 'reserved')
            .order('created_at', { ascending: false })
            .limit(RESERVATIONS_LIST_LIMIT)

          if (error) throw error
          return rows ?? []
        }),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('Reservations request timed out')), 25_000),
        ),
      ])

      // Batch-fetch creator names (bookings has no updated_by column in base schema)
      const userIds = [
        ...new Set((data || []).map((r: { created_by?: string | null }) => r.created_by).filter(Boolean)),
      ]
      const profileMap = await fetchUserDisplayNameMap(userIds as string[], userId)

      const reservationsWithData = (data || []).map((reservation: Record<string, unknown>) => {
        const guestsRaw = reservation.guests as { name?: string; phone?: string } | { name?: string; phone?: string }[] | null
        const roomsRaw = reservation.rooms as { id?: string; room_number?: string; room_type?: string } | { id?: string; room_number?: string; room_type?: string }[] | null
        const notes = typeof reservation.notes === 'string' ? reservation.notes : ''
        const notesMeta = parseBookingNotesMeta(notes)
        let balance = reservation.balance !== undefined ? Number(reservation.balance) : 0

        const guests = guestsRaw
          ? Array.isArray(guestsRaw)
            ? guestsRaw[0] ?? null
            : guestsRaw
          : null
        const rooms = roomsRaw
          ? Array.isArray(roomsRaw)
            ? roomsRaw[0] ?? null
            : roomsRaw
          : null
        const createdBy =
          typeof reservation.created_by === 'string' ? reservation.created_by : undefined

        return {
          ...reservation,
          ...notesMeta,
          guestName: guests?.name || '',
          guestPhone: guests?.phone || '',
          guests,
          rooms,
          created_by_name: createdBy
            ? profileMap[createdBy] || getUserDisplayName(null, createdBy)
            : 'System',
          updated_by_name: null,
          balance,
        } as Reservation
      })

      setReservations(groupBulkRows(reservationsWithData))
    } catch (error: unknown) {
      const detail = describeFetchError(error)
      if (process.env.NODE_ENV === 'development') {
        console.warn('[reservations] fetch failed:', detail, error)
      }
      const msg =
        detail === 'Reservations request timed out'
          ? 'Reservations took too long — refresh the page or try again.'
          : networkFetchHint(detail) ??
            (detail ? `Failed to load reservations: ${detail}` : 'Failed to load reservations')
      toast.error(msg)
      setReservations([])
    } finally {
      endFetch()
    }
  }

  const paymentColors = {
    paid: 'bg-green-500/10 text-green-700 border-green-200',
    partial: 'bg-yellow-500/10 text-yellow-700 border-yellow-200',
    pending: 'bg-orange-500/10 text-orange-700 border-orange-200',
  }

  const statusColors = {
    reserved: 'bg-blue-500/10 text-blue-700 border-blue-200',
    confirmed: 'bg-green-500/10 text-green-700 border-green-200',
    cancelled: 'bg-red-500/10 text-red-700 border-red-200',
  }

  const groupBulkRows = (rows: Reservation[]) => {
    const grouped = new Map<string, Reservation[]>()
    const singles: Reservation[] = []

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
        folio_id: `Bulk ${groupId}`,
        is_bulk: true,
        bulk_group_id: groupId,
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

  const canCheckInReserved = hasPermission(role, 'bookings:checkin')
  const canCancelReservation = hasPermission(role, 'reservations:delete')
  const canMarkNoShow =
    hasPermission(role, 'reservations:edit') || hasPermission(role, 'bookings:edit')

  const openMarkNoShow = (res: Reservation) => {
    setNoShowBooking({
      id: res.id,
      guestName: res.guestName || res.guests?.name,
      folio_id: res.folio_id,
      rate_per_night: res.rate_per_night,
      total_amount: res.total_amount,
      check_in: res.check_in,
      check_out: res.check_out,
    })
    setNoShowDialogOpen(true)
  }

  const openReserveCheckIn = (res: Reservation) => {
    setReserveCheckInBooking({
      id: res.id,
      organization_id: res.organization_id || organizationId || '',
      folio_id: res.folio_id,
      check_in: res.check_in,
      check_out: res.check_out,
      guest_id: res.guest_id,
      room_id: res.room_id,
      rate_per_night: res.rate_per_night,
      guests: res.guests?.name ? { name: res.guests.name } : null,
      rooms:
        res.rooms?.room_number && res.rooms
          ? { id: res.rooms.id, room_number: res.rooms.room_number, room_type: res.rooms.room_type }
          : null,
    })
    setReserveCheckInOpen(true)
  }

  const handleCancelReservation = (res: Reservation) => {
    const label = res.is_bulk ? 'Cancel this bulk reservation?' : 'Cancel this reservation?'
    const detail = res.is_bulk
      ? 'All rooms in this group will be cancelled and released.'
      : 'Held rooms are freed; the folio becomes cancelled.'

    toast.custom(
      (tid: string | number) => (
        <div className="flex flex-col gap-3">
          <div className="flex gap-2 items-start">
            <div className="text-red-600 mt-0.5 text-lg">!</div>
            <div>
              <p className="font-semibold">{label}</p>
              <p className="text-sm text-muted-foreground">{detail}</p>
            </div>
          </div>
          <div className="flex gap-2 justify-end">
            <Button variant="outline" size="sm" onClick={() => toast.dismiss(tid)}>Keep</Button>
            <Button
              variant="destructive"
              size="sm"
              disabled={cancelReserveLoadingId === res.id}
              onClick={async () => {
                toast.dismiss(tid)
                setCancelReserveLoadingId(res.id)
                try {
                  const supabase = createClient()
                  if (!supabase) throw new Error('Unable to connect')

                  if (res.is_bulk && res.bulk_group_id) {
                    const { data: rows, error: fetchErr } = isLegacyBulkGroupId(res.bulk_group_id)
                      ? await supabase
                          .from('bookings')
                          .select('id, room_id, folio_id, notes, status')
                          .eq('organization_id', organizationId)
                          .ilike('folio_id', 'BLK-%')
                      : await supabase
                          .from('bookings')
                          .select('id, room_id, folio_id, notes, status')
                          .eq('organization_id', organizationId)
                          .ilike('notes', `%bulk_group:${res.bulk_group_id}%`)

                    if (fetchErr) throw fetchErr
                    const groupRows = (rows || []).filter((row: any) => {
                      if (!isLegacyBulkGroupId(res.bulk_group_id!)) return true
                      return getBulkGroupId(row) === res.bulk_group_id
                    }).filter((row: any) => isCancellableReservationStatus(row.status))
                    if (!groupRows.length) {
                      toast.message('All reservations in this group are already cancelled or checked in.')
                      return
                    }
                    for (const row of groupRows) {
                      const { error } = await cancelBookingReservation(supabase, {
                        bookingId: row.id,
                        roomId: row.room_id,
                        userId,
                      })
                      if (error) throw new Error(error)
                    }
                    toast.success(
                      `Cancelled ${groupRows.length} reservation${groupRows.length === 1 ? '' : 's'} in group`,
                    )
                  } else {
                    const { error } = await cancelBookingReservation(supabase, {
                      bookingId: res.id,
                      roomId: res.room_id,
                      userId,
                    })
                    if (error) throw new Error(error)
                    toast.success('Reservation cancelled')
                  }
                  fetchReservations()
                } catch (e: any) {
                  toast.error(e?.message || 'Failed to cancel')
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

  if (initialLoading) {
    return <PageLoadingState />
  }

  return (
    <div className="space-y-6">
      <BulkBookingModal open={bulkModalOpen} onClose={() => setBulkModalOpen(false)} onSuccess={() => { setBulkModalOpen(false); fetchReservations() }} />
      <NewReservationModal open={newReservationOpen} onClose={() => setNewReservationOpen(false)} onSuccess={() => { setNewReservationOpen(false); fetchReservations() }} />
      <ReserveCheckInModal
        open={reserveCheckInOpen}
        onClose={() => { setReserveCheckInOpen(false); setReserveCheckInBooking(null) }}
        onSuccess={fetchReservations}
        booking={reserveCheckInBooking}
        userId={userId || ''}
      />
      <MarkNoShowDialog
        open={noShowDialogOpen}
        onOpenChange={setNoShowDialogOpen}
        booking={noShowBooking}
        onSuccess={fetchReservations}
      />
      
      <CompactStatBadgeRow
        className="py-0.5"
        items={[
          {
            key: 'count',
            label: 'Res',
            value: pageStats.count,
            icon: CalendarClock,
            borderClass: 'border-violet-200/80',
            bgClass: 'bg-violet-50/50',
            iconClass: 'text-violet-700',
            title: statsDateYmd ? `Arrivals on ${statsDateYmd}` : 'All reservations',
          },
          {
            key: 'revenue',
            label: 'Rev',
            value: formatNaira(pageStats.revenue),
            icon: Receipt,
            borderClass: 'border-slate-200/80',
            bgClass: 'bg-slate-50/50',
            iconClass: 'text-slate-700',
            title: 'Total booking value',
          },
          {
            key: 'deposits',
            label: 'Dep',
            value: formatNaira(pageStats.deposits),
            icon: Banknote,
            borderClass: 'border-emerald-200/80',
            bgClass: 'bg-emerald-50/50',
            iconClass: 'text-emerald-700',
            title: 'Deposits collected',
          },
        ]}
      />

      <EnhancedDataTable
        compactTable
        showRowNumbers
        data={reservations}
        onDateFilterChange={(d) =>
          setStatsDateYmd(d ? calendarPickerYmd(d) : null)
        }
        searchKeys={['folio_id', 'guestName', 'guestPhone', 'ledger_account_name', 'rooms.room_number'] as any}
        dateField="check_in"
        onRowClick={(res) => {
          router.push(
            res.is_bulk
              ? `/bulk-bookings/${res.bulk_group_id}`
              : `/reservations/${res.id}`,
          )
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
        ]}
        columns={[
          {
            key: 'guest',
            label: 'Guest',
            render: (res) => (
              <Link
                href={res.is_bulk ? `/bulk-bookings/${res.bulk_group_id}` : `/reservations/${res.id}`}
                className="cursor-pointer hover:text-primary inline-flex items-center gap-1.5 min-w-0 max-w-[12rem] whitespace-nowrap"
              >
                <span className={`font-medium max-md:text-[13px] ${TABLE_CELL_TRUNCATE}`}>{res.guests?.name}</span>
                {res.guests?.phone && (
                  <span className={`${TABLE_META_TEXT} max-md:hidden shrink-0`}>{res.guests.phone}</span>
                )}
                <MobileTableSubdetail>
                  <div>
                    {res.is_bulk
                      ? `${res.room_count} rooms`
                      : `Rm ${res.rooms?.room_number ?? '—'} · ${res.rooms?.room_type ?? ''}`}
                  </div>
                  <div>{formatShortStayDates(res.check_in, res.check_out)}</div>
                </MobileTableSubdetail>
              </Link>
            ),
          },
          {
            key: 'room',
            label: 'Room',
            responsive: 'md+',
            render: (res) => (
              <Link
                href={res.is_bulk ? `/bulk-bookings/${res.bulk_group_id}` : `/reservations/${res.id}`}
                className={`cursor-pointer ${TABLE_INLINE_ROW} max-w-[9rem]`}
              >
                <span className="font-medium max-md:text-[13px] shrink-0">
                  {res.is_bulk ? `${res.room_count} Rooms` : `Room ${res.rooms?.room_number}`}
                </span>
                {res.rooms?.room_type && !res.is_bulk && (
                  <span className={`${TABLE_META_TEXT} ${TABLE_CELL_TRUNCATE}`}>· {res.rooms.room_type}</span>
                )}
              </Link>
            ),
          },
          {
            key: 'check_in',
            label: 'Check-in',
            responsive: 'md+',
            render: (res) => (
              <div className="text-sm max-md:text-xs">
                {new Date(res.check_in).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })}
              </div>
            ),
          },
          {
            key: 'check_out',
            label: 'Check-out',
            responsive: 'md+',
            render: (res) => (
              <div className="text-sm max-md:text-xs">
                {new Date(res.check_out).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })}
              </div>
            ),
          },
          {
            key: 'payment_status',
            label: 'Payment',
            responsive: 'md+',
            render: (res) => {
              const effectiveStatus =
                res.payment_method === 'pending' ||
                (res.payment_method === 'city_ledger' && res.payment_status === 'paid')
                  ? 'pending'
                  : res.payment_status
              const paidAmt = bookingAmountPaid(res.total_amount, res.balance)
              return (
                <div className={TABLE_STACKED_CELL}>
                  <Badge variant="outline" className={`${(paymentColors as Record<string, string>)[effectiveStatus]} max-md:text-[10px] shrink-0`}>
                    {effectiveStatus}
                  </Badge>
                  {effectiveStatus === 'paid' && paidAmt > 0 && (
                    <span className={`${TABLE_META_TEXT} tabular-nums`}>{formatNaira(paidAmt)}</span>
                  )}
                  {res.balance > 0 && (
                    <span className={`${TABLE_META_TEXT} tabular-nums`}>Bal {formatNaira(res.balance)}</span>
                  )}
                </div>
              )
            },
          },
          {
            key: 'payment_method',
            label: 'Method',
            responsive: 'md+',
            render: (res) => {
              const accountLabel =
                res.payment_method === 'city_ledger'
                  ? res.ledger_account_name
                  : paymentMethodRequiresAccount(res.payment_method)
                    ? res.payment_account_label
                    : ''
              return (
                <div
                  className={TABLE_STACKED_CELL}
                  title={[formatBookingPaymentMethodLabel(res.payment_method || 'cash'), accountLabel].filter(Boolean).join(' · ')}
                >
                  <Badge variant="outline" className="text-[10px] shrink-0">
                    {formatBookingPaymentMethodLabel(res.payment_method || 'cash')}
                  </Badge>
                  {accountLabel ? (
                    <span className={`${TABLE_META_TEXT} ${TABLE_CELL_TRUNCATE}`} title={accountLabel}>
                      {accountLabel}
                    </span>
                  ) : paymentMethodRequiresAccount(res.payment_method) ? (
                    <span className={TABLE_META_TEXT}>—</span>
                  ) : null}
                </div>
              )
            },
          },
          {
            key: 'actions',
            label: 'Actions',
            stickyOnMobile: true,
            render: (res) => (
              <div className={TABLE_ACTIONS_ROW} onClick={(e) => e.stopPropagation()}>
                {!res.is_bulk && canCheckInReserved && (
                  <Button
                    size="sm"
                    variant="outline"
                    title="Open check-in"
                    className="h-7 px-2 text-[11px] text-green-700 border-green-200 hover:bg-green-50"
                    onClick={() => openReserveCheckIn(res)}
                  >
                    <DoorOpen className="mr-1 h-3 w-3" />
                    Check in
                  </Button>
                )}
                {canMarkNoShow && !res.is_bulk && isNoShowEligibleStatus(res.status) && (
                  <Button
                    size="sm"
                    variant="outline"
                    title="Mark no-show"
                    className="h-7 px-2 text-[11px] text-orange-700 border-orange-200 hover:bg-orange-50"
                    onClick={() => openMarkNoShow(res)}
                  >
                    No-show
                  </Button>
                )}
                {canCancelReservation && res.status !== 'cancelled' && isCancellableReservationStatus(res.status) && (
                  <Button
                    size="sm"
                    variant="outline"
                    title="Cancel reservation"
                    disabled={cancelReserveLoadingId === res.id}
                    className="h-7 px-2 text-[11px] border-destructive/40 text-destructive hover:bg-destructive/10"
                    onClick={() => handleCancelReservation(res)}
                  >
                    Cancel
                  </Button>
                )}
                <Button asChild size="sm" variant="outline" className="h-7 px-2 text-[11px]">
                  <Link href={res.is_bulk ? `/bulk-bookings/${res.bulk_group_id}` : `/reservations/${res.id}`}>View</Link>
                </Button>
              </div>
            ),
          },
          {
            key: 'created_by_name',
            label: 'Created By',
            responsive: 'lg+',
            render: (res) => (
              <div className="text-sm text-muted-foreground">{res.created_by_name}</div>
            ),
          },
          {
            key: 'updated_by_name',
            label: 'Last Updated',
            responsive: 'lg+',
            render: (res) => (
              <div className="text-sm">
                {res.updated_by_name ? (
                  <div className="text-muted-foreground">{res.updated_by_name}</div>
                ) : (
                  <span className="text-muted-foreground">—</span>
                )}
              </div>
            ),
          },
        ]}
        renderCard={(res) => (
          <CardContent className="p-4">
            <div className="space-y-3">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="font-semibold truncate">{res.guests?.name}</div>
                  <div className="text-sm text-muted-foreground">{res.guests?.phone}</div>
                  <div className="text-xs font-mono text-primary mt-1">
                    {res.is_bulk ? `Bulk · ${res.room_count} rooms` : res.folio_id}
                  </div>
                </div>
                <Badge variant="outline" className={(paymentColors as Record<string, string>)[res.payment_status]}>
                  {res.payment_status}
                </Badge>
              </div>
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div>
                  <div className="text-muted-foreground">Room</div>
                  <div className="font-medium">{res.is_bulk ? `${res.room_count} Rooms` : `Room ${res.rooms?.room_number}`}</div>
                </div>
                <div>
                  <div className="text-muted-foreground">Check-in</div>
                  <div className="font-medium">{new Date(res.check_in).toLocaleDateString('en-GB')}</div>
                </div>
              </div>
              <div className="pt-1 text-xs font-medium text-primary">
                Open reservation details →
              </div>
            </div>
          </CardContent>
        )}
        itemsPerPage={15}
      />
    </div>
  )
}
