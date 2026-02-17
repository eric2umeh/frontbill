'use client'

import { useState } from 'react'
import { EnhancedDataTable } from '@/components/shared/enhanced-data-table'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { CardContent } from '@/components/ui/card'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { generateEnhancedMockGuests } from '@/lib/mock-data'
import { formatNaira } from '@/lib/utils/currency'
import { Eye, History } from 'lucide-react'

const mockGuests = generateEnhancedMockGuests(50)

// Generate unique guests with booking history
const uniqueGuests = mockGuests.reduce((acc: any[], guest) => {
  const existing = acc.find(g => g.name === guest.name)
  if (existing) {
    existing.bookings.push({
      id: Math.random().toString(),
      room: guest.room,
      checkIn: guest.checkIn,
      checkOut: guest.checkOut || new Date(new Date(guest.checkIn).getTime() + guest.nights * 24 * 60 * 60 * 1000).toISOString(),
      nights: guest.nights,
      amount: guest.amount,
      status: guest.status,
      payment: guest.payment,
    })
    existing.totalBookings += 1
    existing.totalSpent += guest.amount
  } else {
    acc.push({
      id: Math.random().toString(),
      name: guest.name,
      phone: guest.phone,
      email: guest.email,
      address: guest.address,
      balance: Math.random() > 0.7 ? (Math.random() * 50000 - 25000) : 0,
      totalBookings: 1,
      totalSpent: guest.amount,
      lastVisit: guest.checkIn,
      bookings: [{
        id: Math.random().toString(),
        room: guest.room,
        checkIn: guest.checkIn,
        checkOut: guest.checkOut || new Date(new Date(guest.checkIn).getTime() + guest.nights * 24 * 60 * 60 * 1000).toISOString(),
        nights: guest.nights,
        amount: guest.amount,
        status: guest.status,
        payment: guest.payment,
      }]
    })
  }
  return acc
}, [])

export default function GuestDatabasePage() {
  const [selectedGuest, setSelectedGuest] = useState<any>(null)

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Guest Database</h1>
          <p className="text-muted-foreground">All guests with booking history and balances</p>
        </div>
      </div>

      <EnhancedDataTable
        data={uniqueGuests}
        searchKeys={['name', 'phone', 'email']}
        filters={[]}
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
            key: 'totalBookings',
            label: 'Bookings',
            render: (guest) => (
              <div className="flex items-center gap-1">
                <History className="h-4 w-4 text-muted-foreground" />
                <span className="font-medium">{guest.totalBookings}</span>
              </div>
            ),
          },
          {
            key: 'balance',
            label: 'Balance',
            render: (guest) => (
              <div className={`font-semibold ${guest.balance > 0 ? 'text-red-600' : guest.balance < 0 ? 'text-green-600' : ''}`}>
                {formatNaira(Math.abs(guest.balance))}
                {guest.balance > 0 && <span className="text-xs ml-1">(Debit)</span>}
                {guest.balance < 0 && <span className="text-xs ml-1">(Credit)</span>}
              </div>
            ),
          },
          {
            key: 'actions',
            label: '',
            render: (guest) => (
              <Button variant="ghost" size="sm" onClick={() => setSelectedGuest(guest)}>
                <Eye className="h-4 w-4 mr-1" />
                View History
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
                <Badge variant="outline">
                  {guest.totalBookings} bookings
                </Badge>
              </div>
              <div className="flex items-center justify-between pt-2 border-t">
                <div>
                  <div className="text-sm text-muted-foreground">Balance</div>
                  <div className={`font-semibold ${guest.balance > 0 ? 'text-red-600' : guest.balance < 0 ? 'text-green-600' : ''}`}>
                    {formatNaira(Math.abs(guest.balance))}
                    {guest.balance > 0 && ' (Debit)'}
                    {guest.balance < 0 && ' (Credit)'}
                  </div>
                </div>
                <Button variant="outline" size="sm" onClick={() => setSelectedGuest(guest)}>
                  View History
                </Button>
              </div>
            </div>
          </CardContent>
        )}
        itemsPerPage={15}
      />

      {/* Guest History Dialog */}
      <Dialog open={!!selectedGuest} onOpenChange={() => setSelectedGuest(null)}>
        <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Booking History - {selectedGuest?.name}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4 p-4 bg-muted rounded-lg">
              <div>
                <div className="text-sm text-muted-foreground">Phone</div>
                <div className="font-medium">{selectedGuest?.phone}</div>
              </div>
              <div>
                <div className="text-sm text-muted-foreground">Email</div>
                <div className="font-medium">{selectedGuest?.email || 'N/A'}</div>
              </div>
              <div>
                <div className="text-sm text-muted-foreground">Total Bookings</div>
                <div className="font-medium">{selectedGuest?.totalBookings}</div>
              </div>
              <div>
                <div className="text-sm text-muted-foreground">Balance</div>
                <div className={`font-semibold ${selectedGuest?.balance > 0 ? 'text-red-600' : selectedGuest?.balance < 0 ? 'text-green-600' : ''}`}>
                  {formatNaira(Math.abs(selectedGuest?.balance || 0))}
                  {selectedGuest?.balance > 0 && ' (Debit)'}
                  {selectedGuest?.balance < 0 && ' (Credit)'}
                </div>
              </div>
            </div>

            <div className="space-y-2">
              <h3 className="font-semibold">All Bookings</h3>
              {selectedGuest?.bookings.map((booking: any) => (
                <div key={booking.id} className="p-3 border rounded-lg space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="font-medium">Room {booking.room}</div>
                    <Badge variant="outline">{booking.status}</Badge>
                  </div>
                  <div className="grid grid-cols-3 gap-2 text-sm">
                    <div>
                      <div className="text-muted-foreground">Check-in</div>
                      <div>{new Date(booking.checkIn).toLocaleDateString('en-GB')}</div>
                    </div>
                    <div>
                      <div className="text-muted-foreground">Nights</div>
                      <div>{booking.nights}</div>
                    </div>
                    <div>
                      <div className="text-muted-foreground">Amount</div>
                      <div className="font-semibold">{formatNaira(booking.amount)}</div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
