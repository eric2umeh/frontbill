'use client'

import { useState } from 'react'
import { EnhancedDataTable } from '@/components/shared/enhanced-data-table'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { CardContent } from '@/components/ui/card'
import { NewBookingModal } from '@/components/bookings/new-booking-modal'
import { generateEnhancedMockGuests } from '@/lib/mock-data'
import { formatNaira } from '@/lib/utils/currency'
import { Plus } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { addDays } from 'date-fns'

const mockGuests = generateEnhancedMockGuests(50).map(g => ({
  ...g,
  folioId: `FL${Math.random().toString(36).substr(2, 9).toUpperCase()}`,
  checkOut: addDays(new Date(g.checkIn), g.nights).toISOString(),
}))

export default function BookingsPage() {
  const [modalOpen, setModalOpen] = useState(false)
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
        searchKeys={['name', 'phone', 'email', 'room']}
        filters={[
          {
            key: 'status',
            label: 'Status',
            options: [
              { value: 'checked_in', label: 'Checked In' },
              { value: 'checked_out', label: 'Checked Out' },
              { value: 'no_show', label: 'No Show' },
              { value: 'cancelled', label: 'Cancelled' },
            ],
          },
          {
            key: 'payment',
            label: 'Payment',
            options: [
              { value: 'paid', label: 'Paid' },
              { value: 'partial', label: 'Partial' },
              { value: 'pending', label: 'Pending' },
            ],
          },
          {
            key: 'checkIn',
            label: 'Check-in Date',
            options: [
              { value: 'today', label: 'Today' },
              { value: 'past', label: 'Past' },
              { value: 'future', label: 'Future' },
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
            key: 'status',
            label: 'Status',
            render: (guest) => (
              <Badge variant="outline" className={statusColors[guest.status]}>
                {guest.status.replace('_', ' ')}
              </Badge>
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
