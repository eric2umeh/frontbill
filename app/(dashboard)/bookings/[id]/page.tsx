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
  // Edit charge state
  const [editChargeModalOpen, setEditChargeModalOpen] = useState(false)
  const [editingCharge, setEditingCharge] = useState<any>(null)
  const [editChargeAmount, setEditChargeAmount] = useState('')
  const [editChargeDescription, setEditChargeDescription] = useState('')
  const [editChargeLoading, setEditChargeLoading] = useState(false)

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
        .select('*, guests(name, phone, email, address, balance), rooms(room_number, room_type, price_per_night)')
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

      // Fetch folio charges from database
      const { data: chargesData, error: chargesError } = await supabase
        .from('folio_charges')
        .select('*')
        .eq('booking_id', id)
        .order('created_at', { ascending: true })

      if (chargesError) throw chargesError

      // Fetch creator info for each charge
      const chargesWithCreator = await Promise.all(chargesData.map(async (charge) => {
        let creatorName = 'System'
        if (charge.created_by) {
          const { data: userData } = await supabase
            .from('profiles')
            .select('full_name')
            .eq('id', charge.created_by)
            .single()
          creatorName = userData?.full_name || 'Unknown User'
        }
        
        return {
          id: charge.id,
          date: charge.created_at?.split('T')[0],
          timestamp: charge.created_at,
          description: charge.description,
          amount: charge.amount,
          type: charge.charge_type,
          createdBy: creatorName,
          paymentStatus: charge.payment_status,
          paymentMethod: charge.payment_method,
        }
      }))

      setFolioCharges(chargesWithCreator)
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

  const handleAddCharge = async () => {
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

    try {
      const supabase = createClient()
      const chargeData = {
        booking_id: bookingId,
        description: chargeType === 'payment' 
          ? `Payment Received - ${paymentMethod}`
          : chargeDescription,
        amount: chargeType === 'payment' ? -Number(chargeAmount) : Number(chargeAmount),
        charge_type: chargeType,
        payment_method: paymentMethod || null,
        ledger_account_id: paymentMethod === 'city_ledger' ? booking?.guest_id : null,
        ledger_account_type: paymentMethod === 'city_ledger' ? 'guest' : null,
        payment_status: chargeType === 'payment' ? 'paid' : 'pending',
      }

      // Save charge to database
      const { data: newCharge, error } = await supabase
        .from('folio_charges')
        .insert([chargeData])
        .select()
        .single()

      if (error) throw error

      // Update booking balance if it's a payment
      if (chargeType === 'payment') {
        const newBalance = Math.max(0, booking.balance - Number(chargeAmount))
        await supabase
          .from('bookings')
          .update({ 
            balance: newBalance,
            deposit: booking.deposit + Number(chargeAmount),
            payment_status: newBalance === 0 ? 'paid' : 'partial'
          })
          .eq('id', bookingId)

        // If using ledger, update guest balance
        if (paymentMethod === 'city_ledger') {
          await supabase
            .from('guests')
            .update({ 
              balance: booking.guests.balance ? booking.guests.balance - Number(chargeAmount) : -Number(chargeAmount)
            })
            .eq('id', booking.guest_id)
        }
      } else {
        // Update booking balance with new charge
        const newBalance = booking.balance + Number(chargeAmount)
        await supabase
          .from('bookings')
          .update({ balance: newBalance })
          .eq('id', bookingId)
      }

      // Refresh folio charges
      await fetchBookingDetails(bookingId)

      toast.success(chargeType === 'payment' 
        ? `Payment of ${formatNaira(Number(chargeAmount))} recorded`
        : `Charge of ${formatNaira(Number(chargeAmount))} added`)
      
      setAddChargeModalOpen(false)
      setChargeAmount('')
      setChargeDescription('')
      setChargeType('payment')
      setPaymentMethod('')
    } catch (error: any) {
      console.error('[v0] Error adding charge:', error)
      toast.error(error.message || 'Failed to add charge')
    }
  }

  const handleDeleteCharge = (chargeId: string, chargeAmount: number) => {
    toast(
      (t) => (
        <div className="flex flex-col gap-3">
          <div className="flex gap-2 items-start">
            <AlertCircle className="w-5 h-5 text-red-600 mt-0.5 flex-shrink-0" />
            <div>
              <p className="font-semibold">Delete this charge?</p>
              <p className="text-sm text-muted-foreground">Amount: {formatNaira(chargeAmount)}. This cannot be undone.</p>
            </div>
          </div>
          <div className="flex gap-2 justify-end">
            <Button variant="outline" size="sm" onClick={() => toast.dismiss(t)}>Cancel</Button>
            <Button
              variant="destructive"
              size="sm"
              onClick={async () => {
                toast.dismiss(t)
                try {
                  const supabase = createClient()
                  const { error: deleteError } = await supabase
                    .from('folio_charges')
                    .delete()
                    .eq('id', chargeId)
                  if (deleteError) throw deleteError
                  // Recalculate balance from remaining charges after deletion
                  await fetchBookingDetails(bookingId)
                  toast.success('Charge deleted')
                } catch (error: any) {
                  toast.error(error.message || 'Failed to delete charge')
                }
              }}
            >
              Delete
            </Button>
          </div>
        </div>
      ),
      { duration: Infinity }
    )
  }

  const openEditCharge = (charge: any) => {
    setEditingCharge(charge)
    setEditChargeAmount(String(Math.abs(charge.amount)))
    setEditChargeDescription(charge.description)
    setEditChargeModalOpen(true)
  }

  const handleUpdateCharge = async () => {
    if (!editingCharge || !editChargeAmount) {
      toast.error('Please enter an amount')
      return
    }
    try {
      setEditChargeLoading(true)
      const supabase = createClient()
      // Preserve sign: payments are stored as negative
      const newAmount = editingCharge.amount < 0
        ? -Math.abs(Number(editChargeAmount))
        : Math.abs(Number(editChargeAmount))

      const { error } = await supabase
        .from('folio_charges')
        .update({ description: editChargeDescription, amount: newAmount })
        .eq('id', editingCharge.id)

      if (error) throw error

      // Recalculate booking balance from all charges
      const { data: allCharges } = await supabase
        .from('folio_charges')
        .select('amount, payment_status')
        .eq('booking_id', bookingId)

      const unpaidTotal = (allCharges || [])
        .filter(c => c.payment_status !== 'paid')
        .reduce((sum, c) => sum + Number(c.amount), 0)

      await supabase
        .from('bookings')
        .update({ balance: Math.max(0, unpaidTotal) })
        .eq('id', bookingId)

      toast.success('Charge updated successfully')
      setEditChargeModalOpen(false)
      setEditingCharge(null)
      await fetchBookingDetails(bookingId)
    } catch (error: any) {
      toast.error(error.message || 'Failed to update charge')
    } finally {
      setEditChargeLoading(false)
    }
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
  // All unpaid charges (positive charges with pending status)
  const totalUnpaid = folioCharges
    .filter(c => c.paymentStatus === 'pending' && c.amount > 0)
    .reduce((sum, c) => sum + c.amount, 0)
  // Add the original booking balance for unpaid room charge
  const totalBillBalance = booking ? (booking.balance || 0) + totalUnpaid : 0

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
                      <SelectItem value="city_ledger">City Ledger</SelectItem>
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

      {/* Edit Charge Dialog */}
      <Dialog open={editChargeModalOpen} onOpenChange={(o) => { if (!o) { setEditChargeModalOpen(false); setEditingCharge(null) } }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Edit Charge</DialogTitle>
            <DialogDescription>Update the amount or description for this folio entry.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Amount</Label>
              <Input
                type="number"
                min="0"
                placeholder="Enter amount"
                value={editChargeAmount}
                onChange={(e) => setEditChargeAmount(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>Description</Label>
              <Input
                placeholder="Charge description"
                value={editChargeDescription}
                onChange={(e) => setEditChargeDescription(e.target.value)}
              />
            </div>
            <div className="flex gap-3 justify-end">
              <Button variant="outline" onClick={() => { setEditChargeModalOpen(false); setEditingCharge(null) }}>Cancel</Button>
              <Button onClick={handleUpdateCharge} disabled={editChargeLoading}>
                {editChargeLoading ? 'Saving...' : 'Save Changes'}
              </Button>
            </div>
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
                  <div key={charge.id} className="flex items-start justify-between p-3 border rounded-lg hover:bg-accent/50 transition-colors">
                    <div className="flex-1">
                      <div className="font-medium">{charge.description}</div>
                      <div className="text-xs text-muted-foreground mt-1 space-y-0.5">
                        <div>{new Date(charge.timestamp).toLocaleString('en-GB')} · {charge.type}</div>
                        <div>Created by {charge.createdBy}</div>
                        {charge.paymentStatus && <div>Status: {charge.paymentStatus}</div>}
                      </div>
                    </div>
                    <div className="flex items-center gap-3 ml-4">
                      <div className={`font-semibold text-right min-w-[100px] ${charge.amount < 0 ? 'text-green-600' : 'text-foreground'}`}>
                        {charge.amount < 0 ? '' : '+'}{formatNaira(charge.amount)}
                      </div>
                      <div className="flex gap-1">
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => openEditCharge(charge)}
                          title="Edit charge"
                        >
                          <Edit className="h-4 w-4" />
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="text-red-600 hover:text-red-700 hover:bg-red-50"
                          onClick={() => handleDeleteCharge(charge.id, charge.amount)}
                          title="Delete charge"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
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
                <span className="text-muted-foreground">Room Charge</span>
                <span className="font-semibold">{formatNaira(booking.total_amount)}</span>
              </div>
              {totalUnpaid > 0 && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Additional Charges (Unpaid)</span>
                  <span className="font-semibold text-orange-600">+{formatNaira(totalUnpaid)}</span>
                </div>
              )}
              <div className="flex justify-between">
                <span className="text-muted-foreground">Amount Paid</span>
                <span className="font-semibold text-green-600">{formatNaira(booking.deposit)}</span>
              </div>
              <Separator />
              <div className="flex justify-between text-lg">
                <span className="font-semibold">Bill Balance (Unpaid)</span>
                <span className={`font-bold ${totalBillBalance > 0 ? 'text-red-600' : 'text-green-600'}`}>
                  {formatNaira(totalBillBalance)}
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
  )
}

