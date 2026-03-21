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
import { ArrowLeft, CreditCard, Trash2, Edit, Plus, Clock, AlertCircle, Loader2 } from 'lucide-react'
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
  const [chargeType, setChargeType] = useState('charge')
  const [chargePaymentMethod, setChargePaymentMethod] = useState('')
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
  const [addChargeLoading, setAddChargeLoading] = useState(false)

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

      // Note: booking.balance is maintained by handlers (add-charge, extend-stay, record-payment)
      // We no longer sync/recalculate it here to avoid double-counting issues

      setLoading(false)
  } catch (error: any) {
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
    if (!chargeAmount || Number(chargeAmount) <= 0) {
      toast.error('Please enter a valid amount')
      return
    }
    // Only require description for ADD CHARGE tab, not for RECORD PAYMENT tab
    if (chargeType === 'charge' && !chargeDescription) {
      toast.error('Please enter a description')
      return
    }

    // Determine if this charge goes onto the city ledger (unpaid bill) or is settled immediately
    try {
      const supabase = createClient()

      // -- ADD CHARGE tab --
      if (chargeType === 'charge') {
        const isPaidNow = chargePaymentMethod !== '' && chargePaymentMethod !== 'city_ledger' && chargePaymentMethod !== 'deferred'
        const paymentStatus = isPaidNow ? 'paid' : 'pending'

        const { error: chargeInsertError } = await supabase.from('folio_charges').insert([{
          booking_id: bookingId,
          description: chargeDescription,
          amount: Number(chargeAmount),
          charge_type: 'charge',
          payment_method: isPaidNow ? chargePaymentMethod : null,
          payment_status: paymentStatus,
        }])
        if (chargeInsertError) throw chargeInsertError

        // Also write to transactions table (non-fatal if it fails)
        try {
          await supabase.from('transactions').insert([{
            organization_id: booking.organization_id || null,
            booking_id: bookingId,
            transaction_id: `CHG-${bookingId}-${Date.now()}`,
            guest_name: booking.guests?.name || booking.guestName || 'Guest',
            room: booking.rooms?.room_number || null,
            amount: Number(chargeAmount),
            payment_method: chargePaymentMethod || 'pending',
            status: paymentStatus,
            description: chargeDescription,
            received_by: null,
          }])
        } catch (_) { /* non-fatal */ }

        if (!isPaidNow) {
          // Deferred / city_ledger - increment booking balance
          const { data: freshBk } = await supabase
            .from('bookings')
            .select('balance')
            .eq('id', bookingId)
            .single()
          const newBalance = (Number(freshBk?.balance) || 0) + Number(chargeAmount)
          const { error: balUpdateErr } = await supabase
            .from('bookings')
            .update({ balance: newBalance })
            .eq('id', bookingId)
          if (balUpdateErr) {
            toast.error('Failed to update bill balance - please refresh')
          } else {
            setBooking((prev: any) => prev ? { ...prev, balance: newBalance } : prev)
          }

          // If city_ledger: also bump guests.balance and create/update city_ledger_accounts
          if (chargePaymentMethod === 'city_ledger' && booking.guest_id) {
            const chargeAmt = Number(chargeAmount)
            const { data: guestRow } = await supabase
              .from('guests')
              .select('balance, name')
              .eq('id', booking.guest_id)
              .single()
            if (guestRow) {
              await supabase
                .from('guests')
                .update({ balance: ((guestRow.balance as number) || 0) + chargeAmt })
                .eq('id', booking.guest_id)
              if (guestRow.name) {
                const { data: existingAcct } = await supabase
                  .from('city_ledger_accounts')
                  .select('id, balance')
                  .eq('organization_id', booking.organization_id)
                  .ilike('account_name', guestRow.name)
                  .maybeSingle()
                if (existingAcct) {
                  await supabase
                    .from('city_ledger_accounts')
                    .update({ balance: (existingAcct.balance || 0) + chargeAmt })
                    .eq('id', existingAcct.id)
                } else {
                  await supabase.from('city_ledger_accounts').insert([{
                    organization_id: booking.organization_id,
                    account_name: guestRow.name,
                    account_type: 'individual',
                    balance: chargeAmt,
                  }])
                }
              }
            }
          }
        } else {
          // Paid immediately (cash/pos/transfer/etc) - increment deposit so Amount Paid is accurate
          const { data: freshBk } = await supabase
            .from('bookings')
            .select('deposit')
            .eq('id', bookingId)
            .single()
          const newDeposit = (Number(freshBk?.deposit) || 0) + Number(chargeAmount)
          await supabase
            .from('bookings')
            .update({ deposit: newDeposit })
            .eq('id', bookingId)
          setBooking((prev: any) => prev ? { ...prev, deposit: newDeposit } : prev)
        }

        toast.success(
          isPaidNow
            ? `Charge of ${formatNaira(Number(chargeAmount))} recorded as paid (${chargePaymentMethod.replace(/_/g, ' ')})`
            : chargePaymentMethod === 'city_ledger'
              ? `${formatNaira(Number(chargeAmount))} added to city ledger - Bill Balance updated`
              : `${formatNaira(Number(chargeAmount))} deferred - Bill Balance updated`
        )

      // -- RECORD PAYMENT tab: reduces existing Bill Balance --
      } else {
        if (!paymentMethod) {
          toast.error('Please select a payment method')
          return
        }

        const paymentEntry = {
          booking_id: bookingId,
          description: `Payment Received - ${paymentMethod.replace('_', ' ')}`,
          amount: -Number(chargeAmount), // negative = money coming in
          charge_type: 'payment',
          payment_method: paymentMethod,
          payment_status: 'paid',
        }

        await supabase.from('folio_charges').insert([paymentEntry])

        // Fetch fresh balance from DB before reducing it
        const { data: freshBk2 } = await supabase
          .from('bookings')
          .select('balance, deposit')
          .eq('id', bookingId)
          .single()
        const newBalance = Math.max(0, (freshBk2?.balance || 0) - Number(chargeAmount))
        const newDeposit = (freshBk2?.deposit || 0) + Number(chargeAmount)
        await supabase
          .from('bookings')
          .update({
            balance: newBalance,
            deposit: newDeposit,
            payment_status: newBalance === 0 ? 'paid' : 'partial',
          })
          .eq('id', bookingId)

        // Optimistically update local booking state so UI shows 0 immediately
        setBooking((prev: any) => prev ? { ...prev, balance: newBalance, deposit: newDeposit, payment_status: newBalance === 0 ? 'paid' : 'partial' } : prev)

        // Mark all pending folio_charges as paid (they've now been settled)
        const { data: pendingCharges } = await supabase
          .from('folio_charges')
          .select('id')
          .eq('booking_id', bookingId)
          .eq('payment_status', 'pending')
        if (pendingCharges && pendingCharges.length > 0) {
          await supabase
            .from('folio_charges')
            .update({ payment_status: 'paid' })
            .eq('booking_id', bookingId)
            .eq('payment_status', 'pending')
        }

        // Optimistically mark all pending charges as paid in local state
          // and append the payment entry - so Bill Balance immediately shows 0
        setFolioCharges((prev: any[]) => {
          const updated = prev.map((c: any) =>
            (c.paymentStatus === 'pending' || c.paymentStatus === 'unpaid') && Number(c.amount) > 0
              ? { ...c, paymentStatus: 'paid' }
              : c
          )
          const paymentRow = {
            id: `local-pay-${Date.now()}`,
            description: `Payment Received - ${paymentMethod.replace(/_/g, ' ')}`,
            amount: -Number(chargeAmount),
            chargeType: 'payment',
            paymentMethod,
            paymentStatus: 'paid',
            createdAt: new Date().toISOString(),
            createdBy: 'You',
          }
          return [paymentRow, ...updated]
        })

        // Also decrement guests.balance and city_ledger_accounts.balance so the
        // guest database shows the correct outstanding amount after settlement
        const guestId = booking?.guest_id || booking?.guests?.id
        if (guestId) {
          const { data: guestRow } = await supabase
            .from('guests')
            .select('balance')
            .eq('id', guestId)
            .single()
          if (guestRow && guestRow.balance > 0) {
            const newGuestBalance = Math.max(0, (guestRow.balance || 0) - Number(chargeAmount))
            await supabase.from('guests').update({ balance: newGuestBalance }).eq('id', guestId)
          }

          // Also reduce city_ledger_accounts balance if one exists for this guest
          const { data: ledgerAcct } = await supabase
            .from('city_ledger_accounts')
            .select('id, balance')
            .ilike('account_name', booking?.guests?.name || '')
            .maybeSingle()
          if (ledgerAcct && ledgerAcct.balance > 0) {
            const newLedgerBalance = Math.max(0, (ledgerAcct.balance || 0) - Number(chargeAmount))
            await supabase
              .from('city_ledger_accounts')
              .update({ balance: newLedgerBalance })
              .eq('id', ledgerAcct.id)
          }
        }

        // Log to transactions table (non-fatal)
        try {
          await supabase.from('transactions').insert([{
            organization_id: booking.organization_id || null,
            booking_id: bookingId,
            transaction_id: `PAY-${bookingId}-${Date.now()}`,
            guest_name: booking.guests?.name || 'Guest',
            room: booking.rooms?.room_number || null,
            amount: Number(chargeAmount),
            payment_method: paymentMethod,
            status: 'paid',
            description: `Payment received - ${paymentMethod.replace(/_/g, ' ')}`,
            received_by: null,
          }])
        } catch (_) { /* non-fatal */ }

        toast.success(`Payment of ${formatNaira(Number(chargeAmount))} recorded`)
      }

      // Close modal and reset fields
      setAddChargeModalOpen(false)
      setChargeAmount('')
      setChargeDescription('')
      setChargeType('charge')
      setChargePaymentMethod('')
      setPaymentMethod('')

      // Append new charge directly to local folio state - no DB re-read needed.
      // This avoids a stale read race where DB write hasn't propagated yet.
      const newChargeEntry = {
        id: `local-${Date.now()}`, // replaced on next full refresh
        description: chargeType === 'charge' ? chargeDescription : `Payment Received - ${paymentMethod.replace(/_/g, ' ')}`,
        amount: chargeType === 'charge' ? Number(chargeAmount) : -Number(chargeAmount),
        chargeType: chargeType === 'charge' ? 'charge' : 'payment',
        paymentMethod: chargeType === 'charge' ? chargePaymentMethod : paymentMethod,
        paymentStatus: chargeType === 'charge'
          ? (chargePaymentMethod === 'city_ledger' || chargePaymentMethod === 'deferred' ? 'pending' : 'paid')
          : 'paid',
        createdAt: new Date().toISOString(),
        createdBy: 'You',
      }
      setFolioCharges((prev: any[]) => [newChargeEntry, ...prev])
    } catch (error: any) {
      toast.error(error.message || 'Failed to save')
    } finally {
      setAddChargeLoading(false)
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
    setAddChargeLoading(true)
    const supabase = createClient()
                  
                  // Get the charge to check its payment status
                  const { data: chargeData } = await supabase
                    .from('folio_charges')
                    .select('payment_status, amount')
                    .eq('id', chargeId)
                    .single()
                  
                  // Delete the charge
                  const { error: deleteError } = await supabase
                    .from('folio_charges')
                    .delete()
                    .eq('id', chargeId)
                  if (deleteError) throw deleteError
                  
                  // If this was a pending/city-ledger charge, reduce the booking balance
                  if (chargeData?.payment_status === 'pending') {
                    const newBalance = Math.max(0, (booking.balance || 0) - Math.abs(chargeData.amount))
                    await supabase
                      .from('bookings')
                      .update({ balance: newBalance })
                      .eq('id', bookingId)
                  }
                  // If this was a paid charge, don't touch balance
                  
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
              onClick={async () => {
                toast.dismiss(t)
                setDeleteLoading(true)
                try {
                  const supabase = createClient()
                  const { error } = await supabase
                    .from('bookings')
                    .delete()
                    .eq('id', bookingId)
                  if (error) throw error
                  toast.success('Booking deleted')
                  router.push('/bookings')
                } catch (err: any) {
                  toast.error(err.message || 'Failed to delete booking')
                } finally {
                  setDeleteLoading(false)
                }
              }}
            >
              {deleteLoading ? 'Deleting...' : 'Delete'}
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

  // Pending (city ledger / deferred) additional charges - excludes cash/card/pos paid charges
  const pendingAdditionalCharges = folioCharges
    .filter(c => c.paymentStatus === 'pending' && c.amount > 0)
    .reduce((sum, c) => sum + c.amount, 0)

  // Paid additional charges (cash/card/pos/bank_transfer on the spot) - for folio display only
  const paidAdditionalCharges = folioCharges
    .filter(c => c.paymentStatus === 'paid' && c.amount > 0 && c.type === 'charge')
    .reduce((sum, c) => sum + c.amount, 0)

  // Bill Balance (Unpaid) = sum of all pending/unpaid folio charges
  // Derived entirely from folioCharges state - no reliance on bookings.balance column.
  // This avoids RLS-blocked DB writes and stale-read race conditions.
  const totalBillBalance = folioCharges
    .filter((c: any) => (c.paymentStatus === 'pending' || c.paymentStatus === 'unpaid') && Number(c.amount) > 0)
    .reduce((sum: number, c: any) => sum + Number(c.amount), 0)

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
        onSuccess={() => fetchBookingDetails(bookingId)}
        booking={{
          id: booking.id,
          folioId: booking.folio_id,
          guestName: booking.guests?.name,
          room: `Room ${booking.rooms?.room_number}`,
          currentCheckOut: booking.check_out,
          ratePerNight: booking.rate_per_night,
          guestId: booking.guest_id,
          organization_id: booking.organization_id,
        }}
      />
      
      <Dialog open={addChargeModalOpen} onOpenChange={setAddChargeModalOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Charge or Payment</DialogTitle>
            <DialogDescription>Add additional charges or record payments to the folio</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <Tabs value={chargeType} onValueChange={(v) => { setChargeType(v); setChargeAmount(''); setChargeDescription(''); setChargePaymentMethod(''); setPaymentMethod('') }}>
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="charge">Add Charge</TabsTrigger>
                <TabsTrigger value="payment">Record Payment</TabsTrigger>
              </TabsList>

              {/* ── ADD CHARGE tab ── */}
              <TabsContent value="charge" className="space-y-4 mt-4">
                <div className="space-y-2">
                  <Label>Amount</Label>
                  <Input
                    type="number"
                    min="0"
                    placeholder="Enter amount"
                    value={chargeAmount}
                    onChange={(e) => setChargeAmount(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Description</Label>
                  <Input
                    placeholder="e.g., Restaurant - Dinner, Laundry"
                    value={chargeDescription}
                    onChange={(e) => setChargeDescription(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label>How is this charge being settled?</Label>
                  <Select value={chargePaymentMethod} onValueChange={setChargePaymentMethod}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select settlement method" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="cash">Cash (paid now - not added to Bill Balance)</SelectItem>
                      <SelectItem value="pos">POS (paid now - not added to Bill Balance)</SelectItem>
                      <SelectItem value="card">Card (paid now - not added to Bill Balance)</SelectItem>
                      <SelectItem value="transfer">Bank Transfer (paid now - not added to Bill Balance)</SelectItem>
                      <SelectItem value="bank_transfer">Bank Transfer / Wire (paid now - not added to Bill Balance)</SelectItem>
                      <SelectItem value="cheque">Cheque (paid now - not added to Bill Balance)</SelectItem>
                      <SelectItem value="city_ledger">City Ledger (bill to account - adds to Bill Balance)</SelectItem>
                      <SelectItem value="deferred">Defer / Not yet paid (adds to Bill Balance)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                {(chargePaymentMethod === 'city_ledger' || chargePaymentMethod === 'deferred') && (
                  <p className="text-xs text-orange-600 bg-orange-50 border border-orange-200 rounded px-3 py-2">
                    This charge will be added to the Bill Balance (Unpaid).
                  </p>
                )}
                {chargePaymentMethod !== '' && chargePaymentMethod !== 'city_ledger' && (
                  <p className="text-xs text-green-600 bg-green-50 border border-green-200 rounded px-3 py-2">
                      Paid on the spot - this will be recorded in the folio but will NOT affect the Bill Balance.
                  </p>
                )}
              </TabsContent>

              {/* ── RECORD PAYMENT tab ── */}
              <TabsContent value="payment" className="space-y-4 mt-4">
                <p className="text-sm text-muted-foreground">Record a payment that reduces the current Bill Balance (Unpaid).</p>
                <div className="space-y-2">
                  <Label>Payment Amount</Label>
                  <Input
                    type="number"
                    min="0"
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
                      <SelectItem value="pos">POS</SelectItem>
                      <SelectItem value="card">Card</SelectItem>
                      <SelectItem value="transfer">Bank Transfer</SelectItem>
                      <SelectItem value="bank_transfer">Bank Transfer (Wire)</SelectItem>
                      <SelectItem value="cheque">Cheque</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </TabsContent>
            </Tabs>
            
            <Button onClick={handleAddCharge} className="w-full" disabled={addChargeLoading}>
              {addChargeLoading ? (
                <><Loader2 className="mr-2 h-4 w-4 animate-spin" />{chargeType === 'payment' ? 'Recording...' : 'Adding...'}</>
              ) : (
                chargeType === 'payment' ? 'Record Payment' : 'Add Charge'
              )}
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
          <Button variant="outline" size="sm" onClick={() => setExtendStayModalOpen(true)} disabled={addChargeLoading}>
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
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium">{charge.description}</span>
                        {charge.type === 'charge' && charge.paymentStatus === 'paid' && (
                          <Badge variant="outline" className="text-xs bg-green-50 text-green-700 border-green-200">Paid on Spot</Badge>
                        )}
                        {charge.type === 'charge' && charge.paymentStatus === 'pending' && charge.paymentMethod === 'city_ledger' && (
                          <Badge variant="outline" className="text-xs bg-orange-50 text-orange-700 border-orange-200">City Ledger</Badge>
                        )}
                        {charge.type === 'charge' && charge.paymentStatus === 'pending' && !charge.paymentMethod && (
                          <Badge variant="outline" className="text-xs bg-yellow-50 text-yellow-700 border-yellow-200">Pending</Badge>
                        )}
                        {charge.type === 'payment' && (
                          <Badge variant="outline" className="text-xs bg-blue-50 text-blue-700 border-blue-200">Payment</Badge>
                        )}
                      </div>
                      <div className="text-xs text-muted-foreground mt-1 space-y-0.5">
                        <div>{new Date(charge.timestamp).toLocaleString('en-GB')} {charge.paymentMethod ? `· ${charge.paymentMethod.replace('_', ' ')}` : ''}</div>
                        <div>By {charge.createdBy}</div>
                      </div>
                    </div>
                    <div className="flex items-center gap-3 ml-4">
                      <div className={`font-semibold text-right min-w-[100px] ${charge.amount < 0 ? 'text-green-600' : charge.paymentStatus === 'paid' && charge.type === 'charge' ? 'text-muted-foreground' : 'text-foreground'}`}>
                        {charge.amount < 0 ? '-' : '+'}{formatNaira(Math.abs(charge.amount))}
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
              {paidAdditionalCharges > 0 && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Other Charges (Paid on Spot)</span>
                  <span className="font-semibold text-green-600">+{formatNaira(paidAdditionalCharges)}</span>
                </div>
              )}
              {pendingAdditionalCharges > 0 && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">City Ledger / Deferred Charges</span>
                  <span className="font-semibold text-orange-600">+{formatNaira(pendingAdditionalCharges)}</span>
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
              {totalBillBalance > 0 && (
                <Button
                  className="w-full mt-4"
                  disabled={addChargeLoading}
                  onClick={() => {
                    setChargeType('payment')
                    setChargeAmount(String(totalBillBalance))
                    setAddChargeModalOpen(true)
                  }}
                >
                  <CreditCard className="mr-2 h-4 w-4" />
                  Settle Balance
                </Button>
              )}
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

