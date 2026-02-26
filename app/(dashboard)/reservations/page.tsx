'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { EnhancedDataTable } from '@/components/shared/enhanced-data-table'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { CardContent } from '@/components/ui/card'
import { formatNaira } from '@/lib/utils/currency'
import { Plus, Users, Loader2 } from 'lucide-react'
import { BulkBookingModal } from '@/components/reservations/bulk-booking-modal'
import { NewReservationModal } from '@/components/reservations/new-reservation-modal'

interface Reservation {
  id: string
  booking_reference: string
  guest_id: string
  room_id: string
  check_in: string
  check_out: string
  status: string
  payment_status: string
  rate_per_night: number
  created_by?: string
  created_by_name?: string
  updated_by?: string
  updated_by_name?: string
  guests?: { name: string; phone: string }
  rooms?: { room_number: string; room_type: string }
}

export default function ReservationsPage() {
  const [reservations, setReservations] = useState<Reservation[]>([])
  const [loading, setLoading] = useState(true)
  const [bulkModalOpen, setBulkModalOpen] = useState(false)
  const [newReservationOpen, setNewReservationOpen] = useState(false)
  const router = useRouter()

  useEffect(() => {
    fetchReservations()
  }, [])

  const fetchReservations = async () => {
    try {
      setLoading(true)
      const supabase = createClient()
      
      if (!supabase) {
        setReservations([])
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
        setReservations([])
        return
      }

      const { data, error } = await supabase
        .from('bookings')
        .select('id, booking_reference, guest_id, room_id, check_in, check_out, status, payment_status, rate_per_night, created_by, updated_by')
        .eq('organization_id', profile.organization_id)
        .eq('status', 'reserved')
        .order('check_in', { ascending: true })

      if (error) throw error
      
      // Fetch guests data
      const guestIds = Array.from(new Set((data || []).map((r: any) => r.guest_id).filter(Boolean)))
      let guestMap: { [key: string]: any } = {}
      
      if (guestIds.length > 0) {
        const { data: guestsData } = await supabase
          .from('guests')
          .select('id, name, phone')
          .in('id', guestIds)
        
        guestsData?.forEach(guest => {
          guestMap[guest.id] = guest
        })
      }

      // Fetch rooms data
      const roomIds = Array.from(new Set((data || []).map((r: any) => r.room_id).filter(Boolean)))
      let roomMap: { [key: string]: any } = {}
      
      if (roomIds.length > 0) {
        const { data: roomsData } = await supabase
          .from('rooms')
          .select('id, room_number, room_type')
          .in('id', roomIds)
        
        roomsData?.forEach(room => {
          roomMap[room.id] = room
        })
      }
      
      // Fetch creator and updater profiles for all reservations
      const userIds = Array.from(new Set(
        [...(data || []).map((r: any) => r.created_by), ...(data || []).map((r: any) => r.updated_by)].filter(Boolean)
      ))
      let userMap: { [key: string]: string } = {}
      
      if (userIds.length > 0) {
        const { data: profiles } = await supabase
          .from('profiles')
          .select('id, full_name')
          .in('id', userIds)
        
        profiles?.forEach(profile => {
          userMap[profile.id] = profile.full_name || 'Unknown User'
        })
      }
      
      // Add guest, room, and user data to each reservation
      const reservationsWithData = (data || []).map((reservation: any) => ({
        ...reservation,
        guests: guestMap[reservation.guest_id],
        rooms: roomMap[reservation.room_id],
        created_by_name: reservation.created_by ? userMap[reservation.created_by] || 'Unknown User' : 'System',
        updated_by_name: reservation.updated_by ? userMap[reservation.updated_by] || 'Unknown User' : null
      }))
      
      setReservations(reservationsWithData)
    } catch (error: any) {
      console.error('Error fetching reservations:', error)
      setReservations([])
    } finally {
      setLoading(false)
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

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <BulkBookingModal open={bulkModalOpen} onClose={() => { setBulkModalOpen(false); fetchReservations() }} />
      <NewReservationModal open={newReservationOpen} onClose={() => { setNewReservationOpen(false); fetchReservations() }} />
      
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Reservations</h1>
          <p className="text-muted-foreground">Manage future bookings and reservations</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setBulkModalOpen(true)}>
            <Users className="mr-2 h-4 w-4" />
            Bulk Booking
          </Button>
          <Button onClick={() => setNewReservationOpen(true)}>
            <Plus className="mr-2 h-4 w-4" />
            New Reservation
          </Button>
        </div>
      </div>

      <EnhancedDataTable
        data={reservations}
        searchKeys={['booking_reference', 'guests.name', 'rooms.room_number']}
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
        ]}
        columns={[
          {
            key: 'booking_reference',
            label: 'Booking Ref',
            render: (res) => (
              <div 
                className="font-mono text-sm cursor-pointer hover:text-primary"
                onClick={() => router.push(`/reservations/${res.id}`)}
              >
                {res.booking_reference}
              </div>
            ),
          },
          {
            key: 'guest',
            label: 'Guest',
            render: (res) => (
              <div 
                className="cursor-pointer hover:text-primary"
                onClick={() => router.push(`/reservations/${res.id}`)}
              >
                <div className="font-medium">{res.guests?.name}</div>
                <div className="text-xs text-muted-foreground">{res.guests?.phone}</div>
              </div>
            ),
          },
          {
            key: 'room',
            label: 'Room',
            render: (res) => (
              <div className="cursor-pointer" onClick={() => router.push(`/reservations/${res.id}`)}>
                <div className="font-medium">Room {res.rooms?.room_number}</div>
                <div className="text-xs text-muted-foreground">{res.rooms?.room_type}</div>
              </div>
            ),
          },
          {
            key: 'check_in',
            label: 'Check-in Date',
            render: (res) => (
              <div className="text-sm">
                {new Date(res.check_in).toLocaleDateString('en-GB')}
              </div>
            ),
          },
          {
            key: 'check_out',
            label: 'Check-out Date',
            render: (res) => (
              <div className="text-sm">
                {new Date(res.check_out).toLocaleDateString('en-GB')}
              </div>
            ),
          },
          {
            key: 'payment_status',
            label: 'Payment',
            render: (res) => (
              <Badge variant="outline" className={paymentColors[res.payment_status]}>
                {res.payment_status}
              </Badge>
            ),
          },
          {
            key: 'created_by_name',
            label: 'Created By',
            render: (res) => (
              <div className="text-sm text-muted-foreground">
                {res.created_by_name}
              </div>
            ),
          },
          {
            key: 'updated_by_name',
            label: 'Last Updated',
            render: (res) => (
              <div className="text-sm">
                {res.updated_by_name ? (
                  <div className="text-muted-foreground">
                    {res.updated_by_name}
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
            render: (res) => (
              <Button 
                size="sm" 
                variant="outline"
                onClick={() => router.push(`/reservations/${res.id}`)}
              >
                View
              </Button>
            ),
          },
        ]}
        renderCard={(res) => (
          <CardContent className="p-4">
            <div className="space-y-3">
              <div className="flex items-start justify-between">
                <div>
                  <div className="font-semibold">{res.guests?.name}</div>
                  <div className="text-sm text-muted-foreground">{res.guests?.phone}</div>
                </div>
                <Badge variant="outline" className={paymentColors[res.payment_status]}>
                  {res.payment_status}
                </Badge>
              </div>
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div>
                  <div className="text-muted-foreground">Room</div>
                  <div className="font-medium">Room {res.rooms?.room_number}</div>
                </div>
                <div>
                  <div className="text-muted-foreground">Check-in</div>
                  <div className="font-medium">{new Date(res.check_in).toLocaleDateString('en-GB')}</div>
                </div>
              </div>
            </div>
          </CardContent>
        )}
        itemsPerPage={15}
      />
    </div>
  )
}
