'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { EnhancedDataTable } from '@/components/shared/enhanced-data-table'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { CardContent } from '@/components/ui/card'
import { NewBookingModal } from '@/components/bookings/new-booking-modal'
import { ExtendStayModal } from '@/components/bookings/extend-stay-modal'
import { AddChargeModal } from '@/components/bookings/add-charge-modal'
import { formatNaira } from '@/lib/utils/currency'
import { usePageData } from '@/hooks/use-page-data'
import { useAuth } from '@/lib/auth-context'
import { hasPermission } from '@/lib/permissions'
import { Plus, Loader2 } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { getUserDisplayName } from '@/lib/utils/user-display'
import { fetchUserDisplayNameMap } from '@/lib/utils/fetch-user-display-names'

interface Booking {
  id: string
  folio_id: string
  guest_id: string
  room_id: string
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
  guests?: { name: string; phone: string }
  rooms?: { room_number: string; room_type: string }
}

export default function BookingsPage() {
  const [bookings, setBookings] = useState<Booking[]>([])
  const [modalOpen, setModalOpen] = useState(false)
  const [extendModalOpen, setExtendModalOpen] = useState(false)
  const [addChargeModalOpen, setAddChargeModalOpen] = useState(false)
  const [selectedBooking, setSelectedBooking] = useState<any>(null)
  const { initialLoading, startFetch, endFetch } = usePageData()
  const { organizationId, role, userId } = useAuth()
  const router = useRouter()
  const isAdmin = role === 'admin'

  useEffect(() => {
    let isMounted = true
    if (isMounted) fetchBookings()
    return () => { isMounted = false }
  }, [])

  const fetchBookings = async () => {
    try {
      startFetch()
      const supabase = createClient()
      
      if (!supabase) {
        setBookings([])
        return
      }

      const { data, error } = await supabase
        .from('bookings')
        .select('*, guests(name, phone), rooms(room_number, room_type), created_by, updated_by, updated_at')
        .eq('organization_id', organizationId)
        .in('status', ['confirmed', 'checked_in'])
        .lte('check_in', new Date().toISOString().split('T')[0])
        .order('check_in', { ascending: false })

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

      setBookings(bookingsWithUsers)
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
      
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Bookings</h1>
          <p className="text-muted-foreground">Manage active bookings and check-ins</p>
        </div>
        {hasPermission(role, 'bookings:create') && (
          <Button onClick={() => setModalOpen(true)}>
            <Plus className="mr-2 h-4 w-4" />
            New Booking
          </Button>
        )}
      </div>

      <EnhancedDataTable
        data={bookings}
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
                onClick={() => router.push(`/bookings/${booking.id}`)}
              >
                {booking.folio_id}
              </div>
            ),
          },
          {
            key: 'guest',
            label: 'Guest',
            render: (booking) => (
              <div 
                className="cursor-pointer hover:text-primary"
                onClick={() => router.push(`/bookings/${booking.id}`)}
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
                <div className="font-medium">Room {booking.rooms?.room_number}</div>
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
            render: (booking) => (
              <div className="text-sm">
                {new Date(booking.check_out).toLocaleDateString('en-GB')}
              </div>
            ),
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
            key: 'updated_by_name',
            label: 'Last Updated',
            render: (booking) => (
              <div className="text-sm">
                {booking.updated_by_name ? (
                  <div className="text-muted-foreground">
                    {booking.updated_by_name}
                  </div>
                ) : (
                  <span className="text-muted-foreground">—</span>
                )}
              </div>
            ),
          },
          {
            key: 'actions',
            label: 'Actions',
            render: (booking) => isAdmin ? (
              <div className="flex gap-2">
                <Button 
                  size="sm" 
                  variant="outline"
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
                  Add Charge
                </Button>
                <Button 
                  size="sm" 
                  variant="outline"
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
              </div>
            ) : null,
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
