'use client'

import { useEffect, useState } from 'react'
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
import { formatNaira } from '@/lib/utils/currency'
import { usePageData } from '@/hooks/use-page-data'
import { useAuth } from '@/lib/auth-context'
import { hasPermission } from '@/lib/permissions'
import { Plus, Loader2, Users, LogOut, DoorOpen } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { getUserDisplayName } from '@/lib/utils/user-display'
import { fetchUserDisplayNameMap } from '@/lib/utils/fetch-user-display-names'
import { getBulkGroupId } from '@/lib/utils/bulk-booking'
import { manualCheckoutEligible, resolvedCheckoutDateForClosing, hideChargeExtendInBookingsTable } from '@/lib/utils/booking-checkout-ui'

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

export default function BookingsPage() {
  const [bookings, setBookings] = useState<Booking[]>([])
  const [modalOpen, setModalOpen] = useState(false)
  const [bulkModalOpen, setBulkModalOpen] = useState(false)
  const [extendModalOpen, setExtendModalOpen] = useState(false)
  const [addChargeModalOpen, setAddChargeModalOpen] = useState(false)
  const [selectedBooking, setSelectedBooking] = useState<any>(null)
  const [checkoutLoadingId, setCheckoutLoadingId] = useState<string | null>(null)
  const [checkoutLoadingGroupId, setCheckoutLoadingGroupId] = useState<string | null>(null)
  const [cancelReserveLoadingId, setCancelReserveLoadingId] = useState<string | null>(null)
  const [reserveCheckInBooking, setReserveCheckInBooking] = useState<ReserveCheckInBooking | null>(null)
  const [reserveCheckInOpen, setReserveCheckInOpen] = useState(false)
  const { initialLoading, startFetch, endFetch } = usePageData()
  const { organizationId, role, userId } = useAuth()
  const router = useRouter()
  const isSuperadmin = role === 'superadmin'
  const canManageFolio = isSuperadmin || role === 'front_desk'
  const canCheckInReserved = hasPermission(role, 'bookings:checkin')
  const canCancelReservation = hasPermission(role, 'reservations:delete')

  useEffect(() => {
    if (organizationId) fetchBookings()
  }, [organizationId, userId])

  const fetchBookings = async () => {
    try {
      startFetch()
      const supabase = createClient()
      
      if (!supabase) {
        setBookings([])
        return
      }

      let query = supabase
        .from('bookings')
        .select('*, guests(name, phone), rooms(id, room_number, room_type), created_by, updated_by, updated_at')
        .eq('organization_id', organizationId)
        .in('status', ['confirmed', 'checked_in', 'reserved', 'checked_out'])

      // Default: show bookings from 90 days ago to future (narrow further with table date picker)
      const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
      query = query.gte('check_in', ninetyDaysAgo)

      const { data, error } = await query
        .order('check_in', { ascending: false })
        .order('created_at', { ascending: false })

      if (error) throw error
      
      // Fetch creator and updater profiles for all bookings
      const userIds = Array.from(new Set(
        [...(data || []).map((b: any) => b.created_by), ...(data || []).map((b: any) => b.updated_by)].filter(Boolean)
      ))
      const userMap = await fetchUserDisplayNameMap(userIds as string[], userId)
      
      // Derive payment_method from notes field (since there's no payment_method column on bookings)
      const bookingsWithUsers = (data || []).map((booking: any) => {
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
          payment_method,
          ledger_account_name,
          guestName: booking.guests?.name || '',
          guestPhone: booking.guests?.phone || '',
          created_by_name: booking.created_by ? userMap[booking.created_by] || getUserDisplayName(null, booking.created_by) : 'System',
          updated_by_name: booking.updated_by ? userMap[booking.updated_by] || getUserDisplayName(null, booking.updated_by) : null,
        }
      })

      // Derive each booking's real balance from folio_charges (pending charges)
      // This is the authoritative source — bookings.balance can be stale due to RLS timing
      const bookingIds = bookingsWithUsers.map((b: any) => b.id)
      if (bookingIds.length > 0) {
        const { data: allFolioCharges } = await supabase
          .from('folio_charges')
          .select('booking_id, amount, payment_status')
          .in('booking_id', bookingIds)
        if (allFolioCharges) {
          // Build a map: booking_id -> sum of pending charges
          const balanceMap: { [id: string]: number } = {}
          allFolioCharges.forEach((c: any) => {
            if ((c.payment_status === 'pending' || c.payment_status === 'unpaid') && Number(c.amount) > 0) {
              balanceMap[c.booking_id] = (balanceMap[c.booking_id] || 0) + Number(c.amount)
            }
          })
          // Override booking.balance with the folio-derived value for ALL bookings
          // Default to 0 if no pending charges — never fall back to stale DB value
          bookingsWithUsers.forEach((b: any) => {
            b.balance = balanceMap[b.id] ?? 0
          })
        }
      }

      setBookings(groupBulkRows(bookingsWithUsers))
    } catch (error: any) {
      console.error('Error fetching bookings:', error)
      toast.error('Failed to load bookings')
    } finally {
      endFetch()
    }
  }

  const statusColors: Record<string, string> = {
    reserved: 'bg-blue-500/10 text-blue-700 border-blue-200',
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
      manualCheckoutEligible({
        status: m.status,
        check_in: m.check_in,
        check_out: m.check_out,
        folio_status: m.folio_status,
      }),
    )

    if (targets.length === 0) {
      toast.message('No folios in this group are available for checkout (already checked out or past auto-checkout window).')
      return
    }
    const totalOutstanding = targets.reduce((s, m) => s + Number(m.balance || 0), 0)
    const gid = bulkRow.bulk_group_id || ''
    toast.custom(
      (tid: string | number) => (
        <div className="flex flex-col gap-3">
          <div className="flex gap-2 items-start">
            <LogOut className="w-5 h-5 text-amber-600 mt-0.5 shrink-0" />
            <div>
              <p className="font-semibold">Check out bulk group?</p>
              <p className="text-sm text-muted-foreground">
                {targets.length} room{targets.length === 1 ? '' : 's'} — {bulkRow.guests?.name}
              </p>
              {totalOutstanding > 0 && (
                <p className="text-xs text-red-600 mt-1">
                  Outstanding (sum): {formatNaira(totalOutstanding)}
                </p>
              )}
            </div>
          </div>
          <div className="flex gap-2 justify-end">
            <Button variant="outline" size="sm" onClick={() => toast.dismiss(tid)}>
              Cancel
            </Button>
            <Button
              size="sm"
              className="bg-amber-600 hover:bg-amber-700 text-white"
              onClick={async () => {
                toast.dismiss(tid)
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
                  fetchBookings()
                } catch (err: any) {
                  toast.error(err.message || 'Failed to check out group')
                } finally {
                  setCheckoutLoadingGroupId(null)
                }
              }}
            >
              Confirm checkout
            </Button>
          </div>
        </div>
      ),
      { duration: Infinity }
    )
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
                  const { error } = await supabase
                    .from('bookings')
                    .update({ status: 'cancelled', updated_by: userId, updated_at: new Date().toISOString() })
                    .eq('id', booking.id)
                  if (error) throw error
                  const rid = booking.room_id
                  if (rid) {
                    await supabase.from('rooms').update({ status: 'available', updated_at: new Date().toISOString() }).eq('id', rid)
                  }
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
    toast.custom(
      (t: string | number) => (
        <div className="flex flex-col gap-3">
          <div className="flex gap-2 items-start">
            <LogOut className="w-5 h-5 text-amber-600 mt-0.5 flex-shrink-0" />
            <div>
              <p className="font-semibold">Check Out Guest?</p>
              <p className="text-sm text-muted-foreground">
                {booking.guests?.name} — Room {booking.rooms?.room_number}
              </p>
              {booking.balance > 0 && (
                <p className="text-xs text-red-600 mt-1">Outstanding balance: {formatNaira(booking.balance)}</p>
              )}
            </div>
          </div>
          <div className="flex gap-2 justify-end">
            <Button variant="outline" size="sm" onClick={() => toast.dismiss(t)}>Cancel</Button>
            <Button
              size="sm"
              className="bg-amber-600 hover:bg-amber-700 text-white"
              onClick={async () => {
                toast.dismiss(t)
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
                  fetchBookings()
                } catch (err: any) {
                  toast.error(err.message || 'Failed to check out guest')
                } finally {
                  setCheckoutLoadingId(null)
                }
              }}
            >
              Confirm Checkout
            </Button>
          </div>
        </div>
      ),
      { duration: Infinity }
    )
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
      
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Bookings</h1>
          <p className="text-muted-foreground">Manage active bookings and check-ins</p>
        </div>
        {hasPermission(role, 'bookings:create') && (
          <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row">
            <Button variant="outline" size="sm" className="w-full text-xs sm:w-auto sm:text-sm" onClick={() => setBulkModalOpen(true)}>
              <Users className="mr-2 h-3.5 w-3.5 sm:h-4 sm:w-4" />
              Bulk Booking
            </Button>
            <Button size="sm" className="w-full text-xs sm:w-auto sm:text-sm" onClick={() => setModalOpen(true)}>
              <Plus className="mr-2 h-3.5 w-3.5 sm:h-4 sm:w-4" />
              New Booking
            </Button>
          </div>
        )}
      </div>

      <EnhancedDataTable
        data={bookings}
        compactTable
        searchKeys={['folio_id', 'guestName', 'guestPhone', 'ledger_account_name', 'rooms.room_number'] as any}
        dateField="check_in"
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
              { value: 'reserved', label: 'Reserved' },
              { value: 'confirmed', label: 'Confirmed' },
              { value: 'checked_in', label: 'Checked In' },
              { value: 'checked_out', label: 'Checked Out' },
            ],
          },
        ]}
        columns={[
          {
            key: 'folio_id',
            label: 'Folio ID',
            render: (booking) => (
              <div 
                className="font-mono text-sm cursor-pointer hover:text-primary"
                onClick={() => router.push(booking.is_bulk ? `/bulk-bookings/${booking.bulk_group_id}` : `/bookings/${booking.id}`)}
              >
                {booking.is_bulk ? `Bulk Booking (${booking.room_count} rooms)` : booking.folio_id}
              </div>
            ),
          },
          {
            key: 'guest',
            label: 'Guest',
            render: (booking) => (
              <div 
                className="cursor-pointer hover:text-primary"
                onClick={() => router.push(booking.is_bulk ? `/bulk-bookings/${booking.bulk_group_id}` : `/bookings/${booking.id}`)}
              >
                <div className="font-medium">{booking.guests?.name}</div>
                <div className="text-xs text-muted-foreground">{booking.guests?.phone}</div>
              </div>
            ),
          },
          {
            key: 'room',
            label: 'Room',
            render: (booking) => (
              <div>
                <div className="font-medium">{booking.is_bulk ? `${booking.room_count} Rooms` : `Room ${booking.rooms?.room_number}`}</div>
                <div className="text-xs text-muted-foreground">{booking.rooms?.room_type}</div>
              </div>
            ),
          },
          {
            key: 'payment_method',
            label: 'Method',
            render: (booking) => (
              <div className="space-y-1">
                <Badge variant="outline" className="text-xs capitalize">
                  {(booking.payment_method || 'cash').replace(/_/g, ' ')}
                </Badge>
                {booking.payment_method === 'city_ledger' && booking.ledger_account_name && (
                  <div className="text-xs text-muted-foreground truncate max-w-[120px]">
                    {booking.ledger_account_name}
                  </div>
                )}
              </div>
            ),
          },
          {
            key: 'check_in',
            label: 'Check-in',
            render: (booking) => (
              <div className="text-sm">
                {new Date(booking.check_in).toLocaleDateString('en-GB')}
              </div>
            ),
          },
          {
            key: 'check_out',
            label: 'Check-out',
            render: (booking) => {
              const today = new Date().toISOString().split('T')[0]
              const nowHour = new Date().getHours()
              const isOverdue =
                booking.status === 'checked_in' &&
                booking.check_out <= today &&
                nowHour >= 12
              const isAutoCheckoutSoon =
                booking.status === 'checked_in' &&
                booking.check_out === today &&
                nowHour >= 12 && nowHour < 14
              return (
                <div className="text-sm space-y-1">
                  <span>{new Date(booking.check_out).toLocaleDateString('en-GB')}</span>
                  {isAutoCheckoutSoon && (
                    <Badge variant="outline" className="text-xs bg-amber-50 text-amber-700 border-amber-200 block w-fit">
                      Due today
                    </Badge>
                  )}
                  {isOverdue && nowHour >= 14 && (
                    <Badge variant="outline" className="text-xs bg-red-50 text-red-600 border-red-200 block w-fit">
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
            render: (booking) => {
              // City ledger bookings should always show as pending (balance owed to ledger account)
              const effectiveStatus = booking.payment_method === 'city_ledger' && booking.payment_status === 'paid'
                ? 'pending'
                : booking.payment_status
              return (
                <div className="space-y-1">
                  <Badge variant="outline" className={paymentColors[effectiveStatus]}>
                    {effectiveStatus}
                  </Badge>
                  {booking.balance > 0 && (
                    <div className="text-xs text-muted-foreground">
                      Bal: {formatNaira(booking.balance)}
                    </div>
                  )}
                </div>
              )
            },
          },
          {
            key: 'created_by_name',
            label: 'Created By',
            render: (booking) => (
              <div className="text-sm text-muted-foreground">
                {booking.created_by_name}
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
                  manualCheckoutEligible({
                    status: m.status,
                    check_in: m.check_in,
                    check_out: m.check_out,
                    folio_status: m.folio_status,
                  }),
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

              const hideChargeExtend = hideChargeExtendInBookingsTable({ check_out: booking.check_out })

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
                      {!manualCheckoutEligible({
                        status: booking.status,
                        check_in: booking.check_in,
                        check_out: booking.check_out,
                        folio_status: booking.folio_status,
                      }) ? null : (
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
                  <Badge variant="outline" className={paymentColors[booking.payment_status]}>
                    {booking.payment_status}
                  </Badge>
                </div>
              </div>
              {booking.balance > 0 && (
                <div className="pt-2 border-t text-sm">
                  <span className="text-muted-foreground">Balance:</span>{' '}
                  <span className="font-semibold text-destructive">{formatNaira(booking.balance)}</span>
                </div>
              )}
            </div>
          </CardContent>
        )}
        itemsPerPage={15}
      />
    </div>
  )
}
