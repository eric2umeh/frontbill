'use client'

import { EnhancedDataTable } from '@/components/shared/enhanced-data-table'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { CardContent } from '@/components/ui/card'
import { generateEnhancedMockGuests } from '@/lib/mock-data'
import { formatNaira } from '@/lib/utils/currency'
import { Eye, UserPlus } from 'lucide-react'

const mockGuests = generateEnhancedMockGuests(50)

export default function GuestsPage() {
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
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Guests</h1>
          <p className="text-muted-foreground">Manage guest reservations and check-ins</p>
        </div>
        <Button>
          <UserPlus className="mr-2 h-4 w-4" />
          New Guest
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
              { value: 'reserved', label: 'Reserved' },
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
            key: 'guestType',
            label: 'Type',
            options: [
              { value: 'walkin', label: 'Walk-in' },
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
              <div>
                <div className="font-medium">{guest.name}</div>
                <div className="text-xs text-muted-foreground">{guest.phone}</div>
              </div>
            ),
          },
          {
            key: 'room',
            label: 'Room',
            render: (guest) => (
              <div>
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
            key: 'nights',
            label: 'Nights',
            render: (guest) => <div className="text-center">{guest.nights}</div>,
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
          {
            key: 'actions',
            label: '',
            render: (guest) => (
              <Button variant="ghost" size="sm">
                <Eye className="h-4 w-4" />
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
