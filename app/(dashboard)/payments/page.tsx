'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter, useSearchParams } from 'next/navigation'
import { PaymentsTable } from '@/components/payments/payments-table'
import { Button } from '@/components/ui/button'
import { Plus, Download, Loader2 } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { formatNaira } from '@/lib/utils/currency'
import { usePageData } from '@/hooks/use-page-data'
import { toast } from 'sonner'

interface Payment {
  id: string
  booking_id: string
  amount: number
  method: string
  payment_date: string
  created_at: string
}

export default function PaymentsPage() {
  const [payments, setPayments] = useState<Payment[]>([])
  const [bookings, setBookings] = useState<any[]>([])
  const [organizationId, setOrganizationId] = useState('')
  const [recordOpen, setRecordOpen] = useState(false)
  const [recording, setRecording] = useState(false)
  const [selectedBookingId, setSelectedBookingId] = useState('')
  const [amount, setAmount] = useState('')
  const [paymentMethod, setPaymentMethod] = useState('cash')
  const { initialLoading, startFetch, endFetch } = usePageData()
  const router = useRouter()
  const searchParams = useSearchParams()

  useEffect(() => { fetchPayments() }, [])
  useEffect(() => {
    if (searchParams.get('action') === 'new') setRecordOpen(true)
  }, [searchParams])

  const fetchPayments = async () => {
    try {
      startFetch()
      const supabase = createClient()
      if (!supabase) { setPayments([]); endFetch(); return }

      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/auth/login'); return }

      const { data: profile } = await supabase
        .from('profiles').select('organization_id').eq('id', user.id).single()
      if (!profile) { toast.error('Organization not found'); return }
      setOrganizationId(profile.organization_id)

      const [{ data, error }, { data: bookingData, error: bookingError }] = await Promise.all([
        supabase
          .from('payments')
          .select('*, guests:guest_id(id, name), bookings:booking_id(id, folio_id, balance, rooms:room_id(room_number))')
          .eq('organization_id', profile.organization_id)
          .order('payment_date', { ascending: false }),
        supabase
          .from('bookings')
          .select('id, folio_id, guest_id, balance, deposit, payment_status, guests:guest_id(id, name), rooms:room_id(room_number)')
          .eq('organization_id', profile.organization_id)
          .gt('balance', 0)
          .in('status', ['confirmed', 'checked_in', 'reserved'])
          .order('created_at', { ascending: false }),
      ])

      if (error) throw error
      if (bookingError) throw bookingError
      setPayments(data || [])
      setBookings(bookingData || [])
    } catch (error) {
      console.error('Error fetching payments:', error)
      toast.error('Failed to load payments')
    } finally {
      endFetch()
    }
  }

  const totalReceived = payments.reduce((sum, p) => sum + Number(p.amount), 0)
  const cashPayments = payments.filter((p: any) => p.payment_method === 'cash').reduce((sum, p) => sum + Number(p.amount), 0)
  const posPayments = payments.filter((p: any) => p.payment_method === 'pos').reduce((sum, p) => sum + Number(p.amount), 0)
  const transferPayments = payments.filter((p: any) => p.payment_method === 'transfer').reduce((sum, p) => sum + Number(p.amount), 0)

  const handleExport = () => {
    const headers = ['Reference', 'Guest', 'Folio', 'Amount', 'Method', 'Date', 'Notes']
    const rows = payments.map((payment: any) => [
      payment.reference_number || payment.payment_reference || payment.id,
      payment.guests?.name || '',
      payment.bookings?.folio_id || '',
      payment.amount,
      payment.payment_method,
      payment.payment_date,
      payment.notes || '',
    ])
    const csv = [headers, ...rows]
      .map((row) => row.map((cell) => `"${String(cell ?? '').replace(/"/g, '""')}"`).join(','))
      .join('\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `payments-${new Date().toISOString().split('T')[0]}.csv`
    link.click()
    URL.revokeObjectURL(url)
  }

  const handleRecordPayment = async () => {
    const paymentAmount = Number(amount)
    if (!selectedBookingId || !paymentAmount || paymentAmount <= 0 || !paymentMethod) {
      toast.error('Select a booking, amount, and payment method')
      return
    }
    const booking = bookings.find((item) => item.id === selectedBookingId)
    if (!booking) {
      toast.error('Booking not found')
      return
    }

    setRecording(true)
    try {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      const appliedAmount = Math.min(paymentAmount, Number(booking.balance || 0))
      const newBalance = Math.max(0, Number(booking.balance || 0) - appliedAmount)
      const newDeposit = Number(booking.deposit || 0) + appliedAmount
      const reference = `PAY-${Date.now().toString(36).toUpperCase()}`

      const { error: paymentError } = await supabase.from('payments').insert([{
        organization_id: organizationId,
        booking_id: booking.id,
        guest_id: booking.guest_id,
        amount: appliedAmount,
        payment_method: paymentMethod,
        payment_date: new Date().toISOString(),
        reference_number: reference,
        received_by: user?.id || null,
        notes: `Payment received for folio ${booking.folio_id}`,
      }])
      if (paymentError) throw paymentError

      await supabase.from('folio_charges').insert([{
        booking_id: booking.id,
        organization_id: organizationId,
        description: `Payment Received - ${paymentMethod.replace(/_/g, ' ')}`,
        amount: -appliedAmount,
        charge_type: 'payment',
        payment_method: paymentMethod,
        payment_status: 'paid',
        created_by: user?.id || null,
      }])

      await supabase.from('bookings').update({
        balance: newBalance,
        deposit: newDeposit,
        payment_status: newBalance === 0 ? 'paid' : 'partial',
      }).eq('id', booking.id)

      await supabase.from('transactions').insert([{
        organization_id: organizationId,
        booking_id: booking.id,
        transaction_id: reference,
        guest_name: booking.guests?.name || 'Guest',
        room: booking.rooms?.room_number || null,
        amount: appliedAmount,
        payment_method: paymentMethod,
        status: 'paid',
        description: `Payment received - ${paymentMethod.replace(/_/g, ' ')}`,
        received_by: user?.id || null,
      }])

      toast.success('Payment recorded')
      setRecordOpen(false)
      setSelectedBookingId('')
      setAmount('')
      setPaymentMethod('cash')
      fetchPayments()
    } catch (error: any) {
      toast.error(error.message || 'Failed to record payment')
    } finally {
      setRecording(false)
    }
  }

  if (initialLoading) {
    return (
      <div className="flex items-center justify-center h-96">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Payments</h1>
          <p className="text-muted-foreground">
            Track all payment transactions
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={handleExport} disabled={payments.length === 0}>
            <Download className="mr-2 h-4 w-4" />
            Export
          </Button>
          <Button onClick={() => setRecordOpen(true)}>
            <Plus className="mr-2 h-4 w-4" />
            Record Payment
          </Button>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardContent className="pt-6">
            <div className="text-sm text-muted-foreground">Total Received</div>
            <div className="text-2xl font-bold text-green-600">{formatNaira(totalReceived)}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-sm text-muted-foreground">Cash</div>
            <div className="text-2xl font-bold">{formatNaira(cashPayments)}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-sm text-muted-foreground">POS</div>
            <div className="text-2xl font-bold">{formatNaira(posPayments)}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-sm text-muted-foreground">Transfer</div>
            <div className="text-2xl font-bold">{formatNaira(transferPayments)}</div>
          </CardContent>
        </Card>
      </div>

      <PaymentsTable payments={payments} />

      <Dialog open={recordOpen} onOpenChange={setRecordOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Record Payment</DialogTitle>
            <DialogDescription>Apply a payment to an outstanding booking balance.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Booking / Folio</Label>
              <Select value={selectedBookingId} onValueChange={(id) => {
                setSelectedBookingId(id)
                const booking = bookings.find((item) => item.id === id)
                setAmount(booking?.balance ? String(booking.balance) : '')
              }}>
                <SelectTrigger>
                  <SelectValue placeholder={bookings.length ? 'Select booking' : 'No outstanding bookings'} />
                </SelectTrigger>
                <SelectContent>
                  {bookings.map((booking) => (
                    <SelectItem key={booking.id} value={booking.id}>
                      {booking.folio_id} - {booking.guests?.name || 'Guest'} - {formatNaira(booking.balance || 0)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Amount</Label>
              <Input type="number" min="1" value={amount} onChange={(event) => setAmount(event.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Payment Method</Label>
              <Select value={paymentMethod} onValueChange={setPaymentMethod}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="cash">Cash</SelectItem>
                  <SelectItem value="pos">POS</SelectItem>
                  <SelectItem value="card">Card</SelectItem>
                  <SelectItem value="transfer">Transfer</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Button className="w-full" onClick={handleRecordPayment} disabled={recording || bookings.length === 0}>
              {recording && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Record Payment
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
