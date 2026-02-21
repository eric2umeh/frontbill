'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { EnhancedDataTable } from '@/components/shared/enhanced-data-table'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { CardContent } from '@/components/ui/card'
import { generateEnhancedMockGuests } from '@/lib/mock-data'
import { formatNaira } from '@/lib/utils/currency'
import { Plus, Users } from 'lucide-react'
import { BulkBookingModal } from '@/components/reservations/bulk-booking-modal'

// Filter only future bookings (reserved status)
const allGuests = generateEnhancedMockGuests(50)
const futureReservations = allGuests.filter(guest => 
  guest.status === 'reserved' || new Date(guest.checkIn) > new Date()
).map(g => ({
  ...g,
  reservationDate: new Date(Date.now() - Math.random() * 30 * 24 * 60 * 60 * 1000).toISOString(),
  amountPaid: Math.floor(g.amount * (g.payment === 'paid' ? 1 : g.payment === 'partial' ? 0.5 : 0)),
  paymentMethod: ['Cash', 'POS', 'Transfer'][Math.floor(Math.random() * 3)],
}))

export default function ReservationsPage() {
  const [bulkModalOpen, setBulkModalOpen] = useState(false)
  const router = useRouter()
  const statusColors = {
    reserved: 'bg-blue-500/10 text-blue-700 border-blue-200',
    confirmed: 'bg-green-500/10 text-green-700 border-green-200',
    cancelled: 'bg-red-500/10 text-red-700 border-red-200',
  }

  const paymentColors = {
    paid: 'bg-green-500/10 text-green-700 border-green-200',
    partial: 'bg-yellow-500/10 text-yellow-700 border-yellow-200',
    pending: 'bg-orange-500/10 text-orange-700 border-orange-200',
  }

  return (
    <div className="space-y-6">
      <BulkBookingModal open={bulkModalOpen} onClose={() => setBulkModalOpen(false)} />
      
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
          <Button onClick={() => router.push('/bookings')}>
            <Plus className="mr-2 h-4 w-4" />
            New Reservation
          </Button>
        </div>
      </div>

      <EnhancedDataTable
        data={futureReservations}
        searchKeys={['name', 'phone', 'email', 'room']}
        filters={[
          {
            key: 'payment',
            label: 'Payment Status',
            options: [
              { value: 'paid', label: 'Paid' },
              { value: 'partial', label: 'Partial' },
              { value: 'pending', label: 'Pending' },
            ],
          },
          {
            key: 'guestType',
            label: 'Type',
            options: [
              { value: 'reservation', label: 'Reservation' },
              { value: 'organization', label: 'Organization' },
            ],
          },
        ]}
        columns={[
          {
            key: 'name',
            label: 'Guest',
            render: (guest) => (
              <div 
                className="cursor-pointer hover:text-primary"
                onClick={() => router.push(`/reservations/${guest.id}`)}
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
              <div className="cursor-pointer" onClick={() => router.push(`/reservations/${guest.id}`)}>
                <div className="font-medium">Room {guest.room}</div>
                <div className="text-xs text-muted-foreground">{guest.type}</div>
              </div>
            ),
          },
          {
            key: 'reservationDate',
            label: 'Reservation Date',
            render: (guest) => (
              <div className="text-sm">
                {new Date(guest.reservationDate).toLocaleDateString('en-GB')}
              </div>
            ),
          },
          {
            key: 'checkIn',
            label: 'Check-in Date',
            render: (guest) => (
              <div className="text-sm">
                {new Date(guest.checkIn).toLocaleDateString('en-GB')}
              </div>
            ),
          },
          {
            key: 'amountPaid',
            label: 'Amount Paid',
            render: (guest) => (
              <div className="space-y-1">
                <div className="font-semibold">{formatNaira(guest.amountPaid)}</div>
                <div className="text-xs text-muted-foreground">{guest.paymentMethod}</div>
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
                onClick={() => router.push(`/reservations/${guest.id}`)}
              >
                View
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
                <Badge variant="outline" className={paymentColors[guest.payment]}>
                  {guest.payment}
                </Badge>
              </div>
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div>
                  <div className="text-muted-foreground">Room</div>
                  <div className="font-medium">{guest.room}</div>
                </div>
                <div>
                  <div className="text-muted-foreground">Check-in</div>
                  <div className="font-medium">{new Date(guest.checkIn).toLocaleDateString('en-GB')}</div>
                </div>
                <div>
                  <div className="text-muted-foreground">Nights</div>
                  <div className="font-medium">{guest.nights}</div>
                </div>
                <div>
                  <div className="text-muted-foreground">Amount</div>
                  <div className="font-semibold">{formatNaira(guest.amount)}</div>
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
