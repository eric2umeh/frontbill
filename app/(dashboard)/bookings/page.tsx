'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { EnhancedDataTable } from '@/components/shared/enhanced-data-table'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { CardContent } from '@/components/ui/card'
import { NewBookingModal } from '@/components/bookings/new-booking-modal'
import { ExtendStayModal } from '@/components/bookings/extend-stay-modal'
import { formatNaira } from '@/lib/utils/currency'
import { Plus, Loader2 } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'

interface Booking {
  id: string
  booking_reference: string
  guest_id: string
  room_id: string
  check_in_date: string
  check_out_date: string
  status: string
  payment_status: string
  rate_per_night: number
  balance: number
  guests?: { full_name: string; phone: string }
  rooms?: { number: string; type: string }
}

export default function BookingsPage() {
  const [bookings, setBookings] = useState<Booking[]>([])
  const [loading, setLoading] = useState(true)
  const [modalOpen, setModalOpen] = useState(false)
  const [extendModalOpen, setExtendModalOpen] = useState(false)
  const [selectedBooking, setSelectedBooking] = useState<any>(null)
  const router = useRouter()

  useEffect(() => {
    fetchBookings()
  }, [])

  const fetchBookings = async () => {
    try {
      setLoading(true)
      const supabase = createClient()
      if (!supabase) {
        toast.error('Supabase not configured')
        return
      }

      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        router.push('/auth/login')
        return
      }

      const { data: profile } = await supabase
        .from('profiles')
        .select('organization_id')
        .eq('id', user.id)
        .single()

      if (!profile) {
        toast.error('Organization not found')
        return
      }

      const { data, error } = await supabase
        .from('bookings')
        .select('*, guests(full_name, phone), rooms(number, type)')
        .eq('organization_id', profile.organization_id)
        .order('check_in_date', { ascending: false })

      if (error) throw error
      setBookings(data || [])
    } catch (error: any) {
      console.error('Error fetching bookings:', error)
      toast.error('Failed to load bookings')
    } finally {
      setLoading(false)
    }
  }

  const statusColors = {
    reserved: 'bg-blue-500/10 text-blue-700 border-blue-200',
    checked_in: 'bg-green-500/10 text-green-700 border-green-200',
    checked_out: 'bg-gray-500/10 text-gray-700 border-gray-200',
    no_show: 'bg-orange-500/10 text-orange-700 border-orange-200',
    cancelled: 'bg-red-500/10 text-red-700 border-red-200',
  }

  const paymentColors = {
    paid: 'bg-green-500/10 text-green-700 border-green-200',
    partial: 'bg-yellow-500/10 text-yellow-700 border-yellow-200',
    pending: 'bg-orange-500/10 text-orange-700 border-orange-200',
    cancelled: 'bg-red-500/10 text-red-700 border-red-200',
  }

  const calculateNights = (checkIn: string, checkOut: string) => {
    const start = new Date(checkIn)
    const end = new Date(checkOut)
    return Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24))
  }

  if (loading) {
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
        <ExtendStayModal 
          open={extendModalOpen} 
          onClose={() => {
            setExtendModalOpen(false)
            setSelectedBooking(null)
            fetchBookings()
          }}
          booking={selectedBooking}
        />
      )}
      
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Bookings</h1>
          <p className="text-muted-foreground">Manage active bookings and check-ins</p>
        </div>
        <Button onClick={() => setModalOpen(true)}>
          <Plus className="mr-2 h-4 w-4" />
          New Booking
        </Button>
      </div>

      <EnhancedDataTable
        data={bookings}
        searchKeys={['booking_reference', 'guests.full_name', 'rooms.number']}
        dateField="check_in_date"
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
            key: 'booking_reference',
            label: 'Booking Ref',
            render: (booking) => (
              <div 
                className="font-mono text-sm cursor-pointer hover:text-primary"
                onClick={() => router.push(`/bookings/${booking.id}`)}
              >
                {booking.booking_reference}
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
                <div className="font-medium">{booking.guests?.full_name}</div>
                <div className="text-xs text-muted-foreground">{booking.guests?.phone}</div>
              </div>
            ),
          },
          {
            key: 'room',
            label: 'Room',
            render: (booking) => (
              <div>
                <div className="font-medium">Room {booking.rooms?.number}</div>
                <div className="text-xs text-muted-foreground">{booking.rooms?.type}</div>
              </div>
            ),
          },
          {
            key: 'check_in_date',
            label: 'Check-in',
            render: (booking) => (
              <div className="text-sm">
                {new Date(booking.check_in_date).toLocaleDateString('en-GB')}
              </div>
            ),
          },
          {
            key: 'check_out_date',
            label: 'Check-out',
            render: (booking) => (
              <div className="text-sm">
                {new Date(booking.check_out_date).toLocaleDateString('en-GB')}
              </div>
            ),
          },
          {
            key: 'payment_status',
            label: 'Payment',
            render: (booking) => (
              <div className="space-y-1">
                <Badge variant="outline" className={paymentColors[booking.payment_status]}>
                  {booking.payment_status}
                </Badge>
                {booking.balance > 0 && (
                  <div className="text-xs text-muted-foreground">
                    Bal: {formatNaira(booking.balance)}
                  </div>
                )}
              </div>
            ),
          },
          {
            key: 'actions',
            label: 'Actions',
            render: (booking) => (
              <Button 
                size="sm" 
                variant="outline"
                onClick={(e) => {
                  e.stopPropagation()
                  const nights = calculateNights(booking.check_in_date, booking.check_out_date)
                  setSelectedBooking({
                    id: booking.id,
                    bookingReference: booking.booking_reference,
                    guestName: booking.guests?.full_name,
                    room: `Room ${booking.rooms?.number}`,
                    currentCheckOut: booking.check_out_date,
                    ratePerNight: booking.rate_per_night,
                  })
                  setExtendModalOpen(true)
                }}
              >
                Extend Stay
              </Button>
            ),
          },
        ]}
        renderCard={(booking) => (
          <CardContent className="p-4">
            <div className="space-y-3">
              <div className="flex items-start justify-between">
                <div>
                  <div className="font-semibold">{booking.guests?.full_name}</div>
                  <div className="text-sm text-muted-foreground">{booking.guests?.phone}</div>
                </div>
                <Badge variant="outline" className={statusColors[booking.status]}>
                  {booking.status.replace('_', ' ')}
                </Badge>
              </div>
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div>
                  <div className="text-muted-foreground">Room</div>
                  <div className="font-medium">{booking.rooms?.number} - {booking.rooms?.type}</div>
                </div>
                <div>
                  <div className="text-muted-foreground">Nights</div>
                  <div className="font-medium">{calculateNights(booking.check_in_date, booking.check_out_date)}</div>
                </div>
                <div>
                  <div className="text-muted-foreground">Check-in</div>
                  <div className="font-medium">{new Date(booking.check_in_date).toLocaleDateString('en-GB')}</div>
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

export default function BookingsPage() {
  const [modalOpen, setModalOpen] = useState(false)
  const [extendModalOpen, setExtendModalOpen] = useState(false)
  const [selectedBooking, setSelectedBooking] = useState<any>(null)
  const router = useRouter()
  
  const statusColors = {
    reserved: 'bg-blue-500/10 text-blue-700 border-blue-200',
    checked_in: 'bg-green-500/10 text-green-700 border-green-200',
    checked_out: 'bg-gray-500/10 text-gray-700 border-gray-200',
    no_show: 'bg-orange-500/10 text-orange-700 border-orange-200',
    cancelled: 'bg-red-500/10 text-red-700 border-red-200',
  }

  const paymentColors = {
    paid: 'bg-green-500/10 text-green-700 border-green-200',
    partial: 'bg-yellow-500/10 text-yellow-700 border-yellow-200',
    pending: 'bg-orange-500/10 text-orange-700 border-orange-200',
    cancelled: 'bg-red-500/10 text-red-700 border-red-200',
  }

  return (
    <div className="space-y-6">
      <NewBookingModal open={modalOpen} onClose={() => setModalOpen(false)} />
      {selectedBooking && (
        <ExtendStayModal 
          open={extendModalOpen} 
          onClose={() => {
            setExtendModalOpen(false)
            setSelectedBooking(null)
          }}
          booking={selectedBooking}
        />
      )}
      
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Bookings</h1>
          <p className="text-muted-foreground">Manage active bookings and check-ins</p>
        </div>
        <Button onClick={() => setModalOpen(true)}>
          <Plus className="mr-2 h-4 w-4" />
          New Booking
        </Button>
      </div>

      <EnhancedDataTable
        data={mockGuests}
        searchKeys={['name', 'room', 'folioId']}
        dateField="checkIn"
        filters={[
          {
            key: 'payment',
            label: 'All Payment',
            options: [
              { value: 'paid', label: 'Paid' },
              { value: 'partial', label: 'Partial' },
              { value: 'pending', label: 'Pending' },
            ],
          },
        ]}
        columns={[
          {
            key: 'folioId',
            label: 'Folio ID',
            render: (guest) => (
              <div 
                className="font-mono text-sm cursor-pointer hover:text-primary"
                onClick={() => router.push(`/bookings/${guest.folioId}`)}
              >
                {guest.folioId}
              </div>
            ),
          },
          {
            key: 'name',
            label: 'Guest',
            render: (guest) => (
              <div 
                className="cursor-pointer hover:text-primary"
                onClick={() => router.push(`/bookings/${guest.folioId}`)}
              >
                <div className="font-medium">{guest.name}</div>
                <div className="text-xs text-muted-foreground">{guest.phone}</div>
              </div>
            ),
          },
          {
            key: 'room',
            label: 'Room',
            render: (guest) => (
              <div 
                className="cursor-pointer"
                onClick={() => router.push(`/bookings/${guest.folioId}`)}
              >
                <div className="font-medium">Room {guest.room}</div>
                <div className="text-xs text-muted-foreground">{guest.type}</div>
              </div>
            ),
          },
          {
            key: 'checkIn',
            label: 'Check-in',
            render: (guest) => (
              <div className="text-sm">
                {new Date(guest.checkIn).toLocaleDateString('en-GB')}
              </div>
            ),
          },
          {
            key: 'checkOut',
            label: 'Check-out',
            render: (guest) => (
              <div className="text-sm">
                {new Date(guest.checkOut).toLocaleDateString('en-GB')}
              </div>
            ),
          },
          {
            key: 'payment',
            label: 'Payment',
            render: (guest) => (
              <div className="space-y-1">
                <Badge variant="outline" className={paymentColors[guest.payment]}>
                  {guest.payment}
                </Badge>
                {guest.balance > 0 && (
                  <div className="text-xs text-muted-foreground">
                    Bal: {formatNaira(guest.balance)}
                  </div>
                )}
              </div>
            ),
          },
          {
            key: 'actions',
            label: 'Actions',
            render: (guest) => (
              <Button 
                size="sm" 
                variant="outline"
                onClick={(e) => {
                  e.stopPropagation()
                  setSelectedBooking({
                    folioId: guest.folioId,
                    guestName: guest.name,
                    room: `Room ${guest.room}`,
                    currentCheckOut: guest.checkOut,
                    ratePerNight: guest.amount / guest.nights,
                  })
                  setExtendModalOpen(true)
                }}
              >
                Extend Stay
              </Button>
            ),
          },
        ]}
        renderCard={(guest) => (
          <CardContent className="p-4">
            <div className="space-y-3">
              <div className="flex items-start justify-between">
                <div>
                  <div className="font-semibold">{guest.name}</div>
                  <div className="text-sm text-muted-foreground">{guest.phone}</div>
                </div>
                <Badge variant="outline" className={statusColors[guest.status]}>
                  {guest.status.replace('_', ' ')}
                </Badge>
              </div>
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div>
                  <div className="text-muted-foreground">Room</div>
                  <div className="font-medium">{guest.room} - {guest.type}</div>
                </div>
                <div>
                  <div className="text-muted-foreground">Nights</div>
                  <div className="font-medium">{guest.nights}</div>
                </div>
                <div>
                  <div className="text-muted-foreground">Check-in</div>
                  <div className="font-medium">{new Date(guest.checkIn).toLocaleDateString('en-GB')}</div>
                </div>
                <div>
                  <div className="text-muted-foreground">Payment</div>
                  <Badge variant="outline" className={paymentColors[guest.payment]}>
                    {guest.payment}
                  </Badge>
                </div>
              </div>
              {guest.balance > 0 && (
                <div className="pt-2 border-t text-sm">
                  <span className="text-muted-foreground">Balance:</span>{' '}
                  <span className="font-semibold text-destructive">{formatNaira(guest.balance)}</span>
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
