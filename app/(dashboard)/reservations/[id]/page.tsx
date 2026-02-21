'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { ArrowLeft, UserCheck, Trash2, Edit, CreditCard } from 'lucide-react'
import { formatNaira } from '@/lib/utils/currency'
import { toast } from 'sonner'

export default function ReservationDetailPage({ params }: { params: { id: string } }) {
  const router = useRouter()
  const [paymentModalOpen, setPaymentModalOpen] = useState(false)
  const [paymentAmount, setPaymentAmount] = useState('')
  const [paymentMethod, setPaymentMethod] = useState('')

  // Mock reservation data
  const reservation = {
    id: params.id,
    guestName: 'Mrs. Fatima Bello',
    phone: '+234 805 234 5678',
    email: 'fatima.b@email.com',
    room: '305',
    roomType: 'Royal Suite',
    checkIn: '2024-01-20',
    checkOut: '2024-01-23',
    nights: 3,
    ratePerNight: 50000,
    totalAmount: 150000,
    amountPaid: 50000,
    balance: 100000,
    status: 'reserved',
    reservationDate: '2024-01-10',
    paymentMethod: 'Transfer',
    organization: null,
  }

  const handleCheckin = () => {
    if (confirm('Check in this guest?')) {
      toast.success('Guest checked in successfully')
      router.push('/bookings')
    }
  }

  const handlePaymentUpdate = () => {
    if (!paymentAmount || !paymentMethod) {
      toast.error('Please enter amount and select payment method')
      return
    }

    toast.success(`Payment of ${formatNaira(Number(paymentAmount))} recorded`)
    setPaymentModalOpen(false)
    setPaymentAmount('')
    setPaymentMethod('')
  }

  const handleDelete = () => {
    if (confirm('Are you sure you want to cancel this reservation?')) {
      toast.success('Reservation cancelled')
      router.push('/reservations')
    }
  }

  return (
    <div className="space-y-6">
      <Dialog open={paymentModalOpen} onOpenChange={setPaymentModalOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Update Payment</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Amount</Label>
              <Input
                type="number"
                placeholder="Enter amount"
                value={paymentAmount}
                onChange={(e) => setPaymentAmount(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>Payment Method</Label>
              <Select value={paymentMethod} onValueChange={setPaymentMethod}>
                <SelectTrigger>
                  <SelectValue placeholder="Select method" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Cash">Cash</SelectItem>
                  <SelectItem value="POS">POS</SelectItem>
                  <SelectItem value="Transfer">Transfer</SelectItem>
                  <SelectItem value="City Ledger">City Ledger</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Button onClick={handlePaymentUpdate} className="w-full">
              Record Payment
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <div className="flex items-center justify-between">
        <Button variant="ghost" onClick={() => router.back()}>
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back to Reservations
        </Button>
        <div className="flex gap-2">
          <Button variant="default" size="sm" onClick={handleCheckin}>
            <UserCheck className="mr-2 h-4 w-4" />
            Check-in Guest
          </Button>
          <Button variant="outline" size="sm">
            <Edit className="mr-2 h-4 w-4" />
            Edit
          </Button>
          <Button variant="destructive" size="sm" onClick={handleDelete}>
            <Trash2 className="mr-2 h-4 w-4" />
            Cancel
          </Button>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>Reservation Details</CardTitle>
              <Badge variant="outline" className="bg-blue-500/10 text-blue-700">
                Reserved
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <div className="text-sm text-muted-foreground">Guest Name</div>
                <div className="font-semibold">{reservation.guestName}</div>
              </div>
              <div>
                <div className="text-sm text-muted-foreground">Phone</div>
                <div className="font-semibold">{reservation.phone}</div>
              </div>
              <div>
                <div className="text-sm text-muted-foreground">Email</div>
                <div className="font-semibold">{reservation.email}</div>
              </div>
              <div>
                <div className="text-sm text-muted-foreground">Room</div>
                <div className="font-semibold">Room {reservation.room} - {reservation.roomType}</div>
              </div>
              <div>
                <div className="text-sm text-muted-foreground">Reservation Date</div>
                <div className="font-semibold">{new Date(reservation.reservationDate).toLocaleDateString('en-GB')}</div>
              </div>
              <div>
                <div className="text-sm text-muted-foreground">Rate/Night</div>
                <div className="font-semibold">{formatNaira(reservation.ratePerNight)}</div>
              </div>
              <div>
                <div className="text-sm text-muted-foreground">Check-in</div>
                <div className="font-semibold">{new Date(reservation.checkIn).toLocaleDateString('en-GB')}</div>
              </div>
              <div>
                <div className="text-sm text-muted-foreground">Check-out</div>
                <div className="font-semibold">{new Date(reservation.checkOut).toLocaleDateString('en-GB')}</div>
              </div>
              <div>
                <div className="text-sm text-muted-foreground">Nights</div>
                <div className="font-semibold">{reservation.nights}</div>
              </div>
              <div>
                <div className="text-sm text-muted-foreground">Payment Method</div>
                <div className="font-semibold">{reservation.paymentMethod}</div>
              </div>
            </div>
          </CardContent>
        </Card>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Payment Summary</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Total Amount</span>
                <span className="font-semibold">{formatNaira(reservation.totalAmount)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Amount Paid</span>
                <span className="font-semibold text-green-600">{formatNaira(reservation.amountPaid)}</span>
              </div>
              <div className="h-px bg-border" />
              <div className="flex justify-between text-lg">
                <span className="font-semibold">Balance</span>
                <span className="font-bold text-red-600">{formatNaira(reservation.balance)}</span>
              </div>
              <Button className="w-full" onClick={() => setPaymentModalOpen(true)}>
                <CreditCard className="mr-2 h-4 w-4" />
                Update Payment
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Actions</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <Button className="w-full" variant="default" onClick={handleCheckin}>
                <UserCheck className="mr-2 h-4 w-4" />
                Check-in Guest
              </Button>
              <Button className="w-full" variant="outline">
                <Edit className="mr-2 h-4 w-4" />
                Edit Reservation
              </Button>
              <Button className="w-full" variant="destructive" onClick={handleDelete}>
                <Trash2 className="mr-2 h-4 w-4" />
                Cancel Reservation
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
