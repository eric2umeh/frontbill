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
  created_by?: string
  created_by_name?: string
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
        // No Supabase configured - show empty state
        setBookings([])
        setLoading(false)
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
        .select('*, guests(name, phone), rooms(room_number, room_type), created_by')
        .eq('organization_id', profile.organization_id)
        .order('check_in', { ascending: false })

      if (error) throw error
      
      // Fetch creator profiles for all bookings
      const creatorIds = Array.from(new Set((data || []).map((b: any) => b.created_by).filter(Boolean)))
      let creatorMap: { [key: string]: string } = {}
      
      if (creatorIds.length > 0) {
        const { data: profiles } = await supabase
          .from('profiles')
          .select('id, full_name')
          .in('id', creatorIds)
        
        profiles?.forEach(profile => {
          creatorMap[profile.id] = profile.full_name || 'Unknown User'
        })
      }
      
      // Add created_by_name to each booking
      const bookingsWithCreator = (data || []).map((booking: any) => ({
        ...booking,
        created_by_name: booking.created_by ? creatorMap[booking.created_by] || 'Unknown User' : 'System'
      }))
      
      setBookings(bookingsWithCreator)
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

  const calculateNights = (checkIn: string | Date, checkOut: string | Date) => {
    const start = typeof checkIn === 'string' ? new Date(checkIn) : checkIn
    const end = typeof checkOut === 'string' ? new Date(checkOut) : checkOut
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
