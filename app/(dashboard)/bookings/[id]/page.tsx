'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { ArrowLeft, CreditCard, Trash2, Edit, Plus } from 'lucide-react'
import { formatNaira } from '@/lib/utils/currency'
import { toast } from 'sonner'

export default function BookingDetailPage({ params }: { params: { id: string } }) {
  const router = useRouter()
  const [paymentModalOpen, setPaymentModalOpen] = useState(false)
  const [paymentAmount, setPaymentAmount] = useState('')
  const [paymentMethod, setPaymentMethod] = useState('')

  // Mock booking data with folio
  const booking = {
    folioId: params.id,
    guestName: 'Mr. Adewale Johnson',
    phone: '+234 803 456 7890',
    email: 'adewale.j@email.com',
    room: '205',
    roomType: 'Deluxe',
    checkIn: '2024-01-15',
    checkOut: '2024-01-18',
    nights: 3,
    ratePerNight: 25000,
    totalAmount: 75000,
    amountPaid: 25000,
    balance: 50000,
    status: 'checked_in',
    paymentStatus: 'partial',
    organization: null,
  }

  // Mock folio charges
  const [folioCharges, setFolioCharges] = useState([
    { id: '1', date: '2024-01-15', description: 'Room Charge (Night 1)', amount: 25000, type: 'room' },
    { id: '2', date: '2024-01-15', description: 'Payment Received', amount: -25000, type: 'payment' },
    { id: '3', date: '2024-01-16', description: 'Room Charge (Night 2)', amount: 25000, type: 'room' },
    { id: '4', date: '2024-01-16', description: 'Restaurant - Dinner', amount: 15000, type: 'food' },
    { id: '5', date: '2024-01-17', description: 'Room Charge (Night 3)', amount: 25000, type: 'room' },
    { id: '6', date: '2024-01-17', description: 'Bar - Drinks', amount: 8000, type: 'beverage' },
  ])

  const handlePaymentUpdate = () => {
    if (!paymentAmount || !paymentMethod) {
      toast.error('Please enter amount and select payment method')
      return
    }

    const newCharge = {
      id: Date.now().toString(),
      date: new Date().toISOString().split('T')[0],
      description: `Payment Received - ${paymentMethod}`,
      amount: -Number(paymentAmount),
      type: 'payment',
    }

    setFolioCharges([...folioCharges, newCharge])
    toast.success(`Payment of ${formatNaira(Number(paymentAmount))} recorded`)
    setPaymentModalOpen(false)
    setPaymentAmount('')
    setPaymentMethod('')
  }

  const handleDelete = () => {
    if (confirm('Are you sure you want to delete this booking?')) {
      toast.success('Booking deleted')
      router.push('/bookings')
    }
  }

  const totalCharges = folioCharges.reduce((sum, charge) => sum + charge.amount, 0)

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
          Back to Bookings
        </Button>
        <div className="flex gap-2">
          <Button variant="outline" size="sm">
            <Edit className="mr-2 h-4 w-4" />
            Edit
          </Button>
          <Button variant="destructive" size="sm" onClick={handleDelete}>
            <Trash2 className="mr-2 h-4 w-4" />
            Delete
          </Button>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>Booking Details - Folio {booking.folioId}</CardTitle>
              <Badge variant="outline" className="bg-green-500/10 text-green-700">
                {booking.status.replace('_', ' ')}
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <div className="text-sm text-muted-foreground">Guest Name</div>
                <div className="font-semibold">{booking.guestName}</div>
              </div>
              <div>
                <div className="text-sm text-muted-foreground">Phone</div>
                <div className="font-semibold">{booking.phone}</div>
              </div>
              <div>
                <div className="text-sm text-muted-foreground">Room</div>
                <div className="font-semibold">Room {booking.room} - {booking.roomType}</div>
              </div>
              <div>
                <div className="text-sm text-muted-foreground">Rate/Night</div>
                <div className="font-semibold">{formatNaira(booking.ratePerNight)}</div>
              </div>
              <div>
                <div className="text-sm text-muted-foreground">Check-in</div>
                <div className="font-semibold">{new Date(booking.checkIn).toLocaleDateString('en-GB')}</div>
              </div>
              <div>
                <div className="text-sm text-muted-foreground">Check-out</div>
                <div className="font-semibold">{new Date(booking.checkOut).toLocaleDateString('en-GB')}</div>
              </div>
            </div>

            <Separator />

            <div>
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-semibold text-lg">Folio - All Charges & Payments</h3>
                <Button size="sm" variant="outline">
                  <Plus className="mr-2 h-4 w-4" />
                  Add Charge
                </Button>
              </div>
              <div className="space-y-2">
                {folioCharges.map((charge) => (
                  <div key={charge.id} className="flex items-center justify-between p-3 border rounded-lg">
                    <div>
                      <div className="font-medium">{charge.description}</div>
                      <div className="text-xs text-muted-foreground">
                        {new Date(charge.date).toLocaleDateString('en-GB')} · {charge.type}
                      </div>
                    </div>
                    <div className={`font-semibold ${charge.amount < 0 ? 'text-green-600' : 'text-foreground'}`}>
                      {charge.amount < 0 ? '' : '+'}{formatNaira(charge.amount)}
                    </div>
                  </div>
                ))}
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
                <span className="text-muted-foreground">Total Charges</span>
                <span className="font-semibold">{formatNaira(Math.abs(totalCharges))}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Amount Paid</span>
                <span className="font-semibold text-green-600">
                  {formatNaira(Math.abs(folioCharges.filter(c => c.amount < 0).reduce((sum, c) => sum + c.amount, 0)))}
                </span>
              </div>
              <Separator />
              <div className="flex justify-between text-lg">
                <span className="font-semibold">Balance</span>
                <span className={`font-bold ${totalCharges > 0 ? 'text-red-600' : 'text-green-600'}`}>
                  {totalCharges > 0 ? '-' : ''}{formatNaira(Math.abs(totalCharges))}
                </span>
              </div>
              <Button className="w-full" onClick={() => setPaymentModalOpen(true)}>
                <CreditCard className="mr-2 h-4 w-4" />
                Update Payment
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Activity Log</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3 text-sm">
                <div className="flex gap-2">
                  <div className="text-muted-foreground">15 Jan 2024</div>
                  <div>Checked in by Front Desk</div>
                </div>
                <div className="flex gap-2">
                  <div className="text-muted-foreground">15 Jan 2024</div>
                  <div>Payment received (Cash)</div>
                </div>
                <div className="flex gap-2">
                  <div className="text-muted-foreground">16 Jan 2024</div>
                  <div>Food order added</div>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
