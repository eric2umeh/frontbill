'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { ArrowLeft, CreditCard, Trash2, Edit, Plus, Clock, AlertCircle } from 'lucide-react'
import { formatNaira } from '@/lib/utils/currency'
import { toast } from 'sonner'
import { ExtendStayModal } from '@/components/bookings/extend-stay-modal'
import { createClient } from '@/lib/supabase/client'

export default function BookingDetailPage({ params }: { params: Promise<{ id: string }> | { id: string } }) {
  const router = useRouter()
  const [booking, setBooking] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [bookingId, setBookingId] = useState<string>('')
  const [addChargeModalOpen, setAddChargeModalOpen] = useState(false)
  const [extendStayModalOpen, setExtendStayModalOpen] = useState(false)
  const [chargeAmount, setChargeAmount] = useState('')
  const [chargeDescription, setChargeDescription] = useState('')
  const [chargeType, setChargeType] = useState('payment')
  const [paymentMethod, setPaymentMethod] = useState('')
  const [deleteLoading, setDeleteLoading] = useState(false)
  const [folioCharges, setFolioCharges] = useState<any[]>([])
  const [createdByUser, setCreatedByUser] = useState<any>(null)
  const [updatedByUser, setUpdatedByUser] = useState<any>(null)

  useEffect(() => {
    const getParamsAndFetch = async () => {
      const resolvedParams = await Promise.resolve(params)
      setBookingId(resolvedParams.id)
      await fetchBookingDetails(resolvedParams.id)
    }
    getParamsAndFetch()
  }, [])

  const fetchBookingDetails = async (id: string) => {
    try {
      const supabase = createClient()
      
      // Fetch booking with related data
      const { data: bookingData, error: bookingError } = await supabase
        .from('bookings')
        .select('*, guests(name, phone, email, address), rooms(room_number, room_type, price_per_night)')
        .eq('id', id)
        .single()

      if (bookingError) throw bookingError

      setBooking(bookingData)

      // Fetch user info for created_by
      if (bookingData.created_by) {
        const { data: userData } = await supabase
          .from('users')
          .select('full_name')
          .eq('id', bookingData.created_by)
          .single()
        setCreatedByUser(userData)
      }

      // Fetch user info for updated_by if exists
      if (bookingData.updated_by) {
        const { data: userData } = await supabase
          .from('users')
          .select('full_name')
          .eq('id', bookingData.updated_by)
          .single()
        setUpdatedByUser(userData)
      }

      // Initialize folio charges - only show room charges based on nights
      const charges = []
      const checkInDate = new Date(bookingData.check_in)
      const nightsCount = bookingData.number_of_nights

      for (let i = 0; i < nightsCount; i++) {
        const chargeDate = new Date(checkInDate)
        chargeDate.setDate(chargeDate.getDate() + i)
        charges.push({
          id: `room-${i}`,
          date: chargeDate.toISOString().split('T')[0],
          description: `Room Charge (Night ${i + 1})`,
          amount: bookingData.rate_per_night,
          type: 'room'
        })
      }

      // Add payment if fully paid
      if (bookingData.payment_status === 'paid' && bookingData.deposit > 0) {
        charges.push({
          id: 'payment-1',
          date: bookingData.created_at?.split('T')[0],
          description: 'Payment Received - Full Amount',
          amount: -bookingData.total_amount,
          type: 'payment'
        })
      }

      setFolioCharges(charges)
      setLoading(false)
    } catch (error: any) {
      console.error('[v0] Error fetching booking details:', error)
      
      // Check if it's an auth error
      if (error?.status === 401 || error?.code === 'PGRST') {
        toast.error('Session expired. Please log in again.')
        router.push('/login')
        return
      }
      
      toast.error(error.message || 'Failed to fetch booking details')
      setLoading(false)
    }
  }

  const handleAddCharge = () => {
    if (!chargeAmount) {
      toast.error('Please enter amount')
      return
    }

    if (chargeType === 'payment' && !paymentMethod) {
      toast.error('Please select payment method')
      return
    }

    if (chargeType !== 'payment' && !chargeDescription) {
      toast.error('Please enter charge description')
      return
    }

    const newCharge = {
      id: Date.now().toString(),
      date: new Date().toISOString().split('T')[0],
      description: chargeType === 'payment' 
        ? `Payment Received - ${paymentMethod}`
        : chargeDescription,
      amount: chargeType === 'payment' ? -Number(chargeAmount) : Number(chargeAmount),
      type: chargeType,
    }

    setFolioCharges([...folioCharges, newCharge])
    
    if (chargeType === 'payment') {
      toast.success(`Payment of ${formatNaira(Number(chargeAmount))} recorded`)
    } else {
      toast.success(`Charge of ${formatNaira(Number(chargeAmount))} added`)
    }
    
    setAddChargeModalOpen(false)
    setChargeAmount('')
    setChargeDescription('')
    setChargeType('payment')
    setPaymentMethod('')
  }

  const handleDelete = () => {
    toast(
      (t) => (
        <div className="flex flex-col gap-3">
          <div className="flex gap-2 items-start">
            <AlertCircle className="w-5 h-5 text-red-600 mt-0.5 flex-shrink-0" />
            <div>
              <p className="font-semibold">Delete Booking?</p>
              <p className="text-sm text-muted-foreground">This action cannot be undone.</p>
            </div>
          </div>
          <div className="flex gap-2 justify-end">
            <Button
              variant="outline"
              size="sm"
              onClick={() => toast.dismiss(t)}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              size="sm"
              disabled={deleteLoading}
              onClick={() => {
                setDeleteLoading(true)
                toast.success('Booking deleted')
                setTimeout(() => router.push('/bookings'), 500)
                toast.dismiss(t)
              }}
            >
              Delete
            </Button>
          </div>
        </div>
      ),
      {
        duration: Infinity,
        className: 'bg-red-50 border-red-200',
      }
    )
  }

  const totalCharges = folioCharges.reduce((sum, charge) => sum + charge.amount, 0)

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <p>Loading booking details...</p>
      </div>
    )
  }

  if (!booking) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <p>Booking not found</p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <ExtendStayModal 
        open={extendStayModalOpen}
        onClose={() => setExtendStayModalOpen(false)}
        booking={{
          folioId: booking.folio_id,
          guestName: booking.guests?.name,
          room: `Room ${booking.rooms?.room_number}`,
          currentCheckOut: booking.check_out,
          ratePerNight: booking.rate_per_night,
        }}
      />
      
      <Dialog open={addChargeModalOpen} onOpenChange={setAddChargeModalOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Charge or Payment</DialogTitle>
            <DialogDescription>Add additional charges or record payments to the folio</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <Tabs value={chargeType} onValueChange={(value) => setChargeType(value)}>
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="charge">Add Charge</TabsTrigger>
                <TabsTrigger value="payment">Record Payment</TabsTrigger>
              </TabsList>
              
              <TabsContent value="charge" className="space-y-4 mt-4">
                <div className="space-y-2">
                  <Label>Charge Amount</Label>
                  <Input
                    type="number"
                    placeholder="Enter amount"
                    value={chargeAmount}
                    onChange={(e) => setChargeAmount(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Description</Label>
                  <Input
                    placeholder="e.g., Restaurant - Dinner"
                    value={chargeDescription}
                    onChange={(e) => setChargeDescription(e.target.value)}
                  />
                </div>
              </TabsContent>
              
              <TabsContent value="payment" className="space-y-4 mt-4">
                <div className="space-y-2">
                  <Label>Payment Amount</Label>
                  <Input
                    type="number"
                    placeholder="Enter amount"
                    value={chargeAmount}
                    onChange={(e) => setChargeAmount(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Payment Method</Label>
                  <Select value={paymentMethod} onValueChange={setPaymentMethod}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select method" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="cash">Cash</SelectItem>
                      <SelectItem value="card">Card</SelectItem>
                      <SelectItem value="bank_transfer">Bank Transfer</SelectItem>
                      <SelectItem value="cheque">Cheque</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </TabsContent>
            </Tabs>
            
            <Button onClick={handleAddCharge} className="w-full">
              {chargeType === 'payment' ? 'Record Payment' : 'Add Charge'}
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
          <Button variant="outline" size="sm" onClick={() => setExtendStayModalOpen(true)}>
            <Clock className="mr-2 h-4 w-4" />
            Extend Stay
          </Button>
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
              <CardTitle>Booking Details - Folio {booking.folio_id}</CardTitle>
              <Badge variant="outline" className="bg-green-500/10 text-green-700">
                {booking.status.replace('_', ' ')}
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <div className="text-sm text-muted-foreground">Guest Name</div>
                <div className="font-semibold">{booking.guests?.name}</div>
              </div>
              <div>
                <div className="text-sm text-muted-foreground">Phone</div>
                <div className="font-semibold">{booking.guests?.phone}</div>
              </div>
              <div>
                <div className="text-sm text-muted-foreground">Room</div>
                <div className="font-semibold">Room {booking.rooms?.room_number} - {booking.rooms?.room_type}</div>
              </div>
              <div>
                <div className="text-sm text-muted-foreground">Rate/Night</div>
                <div className="font-semibold">{formatNaira(booking.rate_per_night)}</div>
              </div>
              <div>
                <div className="text-sm text-muted-foreground">Check-in</div>
                <div className="font-semibold">{new Date(booking.check_in).toLocaleDateString('en-GB')}</div>
              </div>
              <div>
                <div className="text-sm text-muted-foreground">Check-out</div>
                <div className="font-semibold">{new Date(booking.check_out).toLocaleDateString('en-GB')}</div>
              </div>
            </div>

            <Separator />

            <div>
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-semibold text-lg">Folio - All Charges & Payments</h3>
                <Button size="sm" variant="outline" onClick={() => setAddChargeModalOpen(true)}>
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
                <span className="text-muted-foreground">Total Amount</span>
                <span className="font-semibold">{formatNaira(booking.total_amount)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Amount Paid</span>
                <span className="font-semibold text-green-600">
                  {formatNaira(booking.deposit)}
                </span>
              </div>
              <Separator />
              <div className="flex justify-between text-lg">
                <span className="font-semibold">Balance</span>
                <span className={`font-bold ${booking.balance > 0 ? 'text-red-600' : 'text-green-600'}`}>
                  {formatNaira(booking.balance)}
                </span>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Activity Log</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div className="flex gap-2 flex-col">
                <div className="text-muted-foreground">
                  {new Date(booking.created_at).toLocaleDateString('en-GB')}
                </div>
                <div>
                  Booking created by {createdByUser?.full_name || 'System'}
                </div>
              </div>
              {booking.payment_status === 'paid' && (
                <div className="flex gap-2 flex-col">
                  <div className="text-muted-foreground">
                    {new Date(booking.created_at).toLocaleDateString('en-GB')}
                  </div>
                  <div>Full payment received</div>
                </div>
              )}
              {updatedByUser && (
                <div className="flex gap-2 flex-col">
                  <div className="text-muted-foreground">
                    {booking.updated_at ? new Date(booking.updated_at).toLocaleDateString('en-GB') : 'N/A'}
                  </div>
                  <div>
                    Updated by {updatedByUser?.full_name || 'System'}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
                    onChange={(e) => setChargeDescription(e.target.value)}
                  />
                </div>
              </TabsContent>
              
              <TabsContent value="payment" className="space-y-4 mt-4">
                <div className="space-y-2">
                  <Label>Payment Amount</Label>
                  <Input
                    type="number"
                    placeholder="Enter amount"
                    value={chargeAmount}
                    onChange={(e) => setChargeAmount(e.target.value)}
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
              </TabsContent>
            </Tabs>
            
            <Button onClick={handleAddCharge} className="w-full">
              {chargeType === 'payment' ? 'Record Payment' : 'Add Charge'}
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
          <Button variant="outline" size="sm" onClick={() => setExtendStayModalOpen(true)}>
            <Clock className="mr-2 h-4 w-4" />
            Extend Stay
          </Button>
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
                <Button size="sm" variant="outline" onClick={() => setAddChargeModalOpen(true)}>
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
