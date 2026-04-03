'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { ArrowLeft, UserCheck, Trash2, CreditCard, AlertCircle, Loader2 } from 'lucide-react'
import { formatNaira } from '@/lib/utils/currency'
import { toast } from 'sonner'
import { createClient } from '@/lib/supabase/client'
import { format, isBefore, startOfDay } from 'date-fns'

export default function ReservationDetailPage({
  params,
}: {
  params: Promise<{ id: string }> | { id: string }
}) {
  const router = useRouter()
  const [rid, setRid] = useState('')
  const [reservation, setReservation] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [actionLoading, setActionLoading] = useState(false)
  const [paymentModalOpen, setPaymentModalOpen] = useState(false)
  const [paymentAmount, setPaymentAmount] = useState('')
  const [paymentMethod, setPaymentMethod] = useState('')
  const [paymentLoading, setPaymentLoading] = useState(false)

  useEffect(() => {
    let cancelled = false
    const init = async () => {
      const resolved = await Promise.resolve(params)
      if (cancelled) return
      setRid(resolved.id)
      loadReservation(resolved.id)
    }
    init()
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function loadReservation(bookingId: string) {
    try {
      setLoading(true)
      setError(null)
      const supabase = createClient()

      const { data, error } = await supabase
        .from('bookings')
        .select(
          `id, folio_id, check_in, check_out, status, payment_status,
           rate_per_night, total_amount, deposit, balance, number_of_nights,
           notes, created_at,
           guests:guest_id(id, name, phone, email, address),
           rooms:room_id(id, room_number, room_type, price_per_night)`
        )
        .eq('id', bookingId)
        .single()

      if (error) {
        setError(error.message || 'Failed to load reservation')
        return
      }
      if (!data) {
        setError('Reservation not found')
        return
      }
      setReservation(data)
    } catch (err: any) {
      setError(err.message || 'Failed to load reservation')
    } finally {
      setLoading(false)
    }
  }

  // Disable check-in until the check-in date has arrived
  const checkInNotReached = reservation?.check_in
    ? isBefore(startOfDay(new Date()), startOfDay(new Date(reservation.check_in)))
    : false

  function handleCheckin() {
    toast(
      (t) => (
        <div className="flex flex-col gap-3">
          <div className="flex gap-2 items-start">
            <AlertCircle className="w-5 h-5 text-blue-600 mt-0.5 shrink-0" />
            <div>
              <p className="font-semibold">Check in Guest?</p>
              <p className="text-sm text-muted-foreground">
                The guest will be moved to active bookings.
              </p>
            </div>
          </div>
          <div className="flex gap-2 justify-end">
            <Button variant="outline" size="sm" onClick={() => toast.dismiss(t)}>
              Cancel
            </Button>
            <Button
              size="sm"
              disabled={actionLoading}
              onClick={async () => {
                toast.dismiss(t)
                setActionLoading(true)
                try {
                  const supabase = createClient()
                  const { error } = await supabase
                    .from('bookings')
                    .update({ status: 'checked_in' })
                    .eq('id', rid)
                  if (error) throw error
                  if (reservation?.rooms?.id) {
                    await supabase
                      .from('rooms')
                      .update({ status: 'occupied' })
                      .eq('id', reservation.rooms.id)
                  }
                  toast.success('Guest checked in successfully')
                  router.push('/bookings')
                } catch (err: any) {
                  toast.error(err.message || 'Check-in failed')
                } finally {
                  setActionLoading(false)
                }
              }}
            >
              {actionLoading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                'Check-in'
              )}
            </Button>
          </div>
        </div>
      ),
      { duration: Infinity }
    )
  }

  async function handlePaymentUpdate() {
    if (!paymentAmount || !paymentMethod) {
      toast.error('Please enter amount and select payment method')
      return
    }
    try {
      setPaymentLoading(true)
      const supabase = createClient()
      const amount = Number(paymentAmount)
      const newDeposit = (reservation?.deposit || 0) + amount
      const newBalance = Math.max(
        0,
        (reservation?.total_amount || 0) - newDeposit
      )
      const newStatus =
        newBalance <= 0 ? 'paid' : newDeposit > 0 ? 'partial' : 'unpaid'

      const {
        data: { user },
      } = await supabase.auth.getUser()
      let orgId: string | null = null
      if (user) {
        const { data: profile } = await supabase
          .from('profiles')
          .select('organization_id')
          .eq('id', user.id)
          .single()
        orgId = profile?.organization_id || null
      }

      await supabase
        .from('bookings')
        .update({
          deposit: newDeposit,
          balance: newBalance,
          payment_status: newStatus,
        })
        .eq('id', rid)

      try {
        const gName = Array.isArray(reservation?.guests)
          ? reservation.guests[0]?.name
          : reservation?.guests?.name
        const rNum = Array.isArray(reservation?.rooms)
          ? reservation.rooms[0]?.room_number
          : reservation?.rooms?.room_number
        await supabase.from('transactions').insert([
          {
            organization_id: orgId,
            booking_id: rid,
            transaction_id: 'PAY-' + rid + '-' + Date.now(),
            guest_name: gName || 'Guest',
            room: rNum || null,
            amount,
            payment_method: paymentMethod,
            status: 'paid',
            description: 'Reservation payment',
            received_by: null,
          },
        ])
      } catch {
        // non-fatal
      }

      toast.success('Payment of ' + formatNaira(amount) + ' recorded')
      setPaymentModalOpen(false)
      setPaymentAmount('')
      setPaymentMethod('')
      loadReservation(rid)
    } catch (err: any) {
      toast.error(err.message || 'Failed to record payment')
    } finally {
      setPaymentLoading(false)
    }
  }

  function handleDelete() {
    toast(
      (t) => (
        <div className="flex flex-col gap-3">
          <div className="flex gap-2 items-start">
            <AlertCircle className="w-5 h-5 text-red-600 mt-0.5 shrink-0" />
            <div>
              <p className="font-semibold">Cancel Reservation?</p>
              <p className="text-sm text-muted-foreground">
                This action cannot be undone.
              </p>
            </div>
          </div>
          <div className="flex gap-2 justify-end">
            <Button variant="outline" size="sm" onClick={() => toast.dismiss(t)}>
              Keep
            </Button>
            <Button
              variant="destructive"
              size="sm"
              disabled={actionLoading}
              onClick={async () => {
                toast.dismiss(t)
                setActionLoading(true)
                try {
                  const supabase = createClient()
                  await supabase
                    .from('bookings')
                    .update({ status: 'cancelled' })
                    .eq('id', rid)
                  if (reservation?.rooms?.id) {
                    await supabase
                      .from('rooms')
                      .update({ status: 'available' })
                      .eq('id', reservation.rooms.id)
                  }
                  toast.success('Reservation cancelled')
                  router.push('/reservations')
                } catch (err: any) {
                  toast.error(err.message || 'Cancellation failed')
                } finally {
                  setActionLoading(false)
                }
              }}
            >
              Cancel Reservation
            </Button>
          </div>
        </div>
      ),
      { duration: Infinity }
    )
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (error) {
    return (
      <div className="space-y-6">
        <Button asChild variant="ghost">
          <Link href="/reservations">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Reservations
          </Link>
        </Button>
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <AlertCircle className="h-12 w-12 text-destructive mb-4" />
            <h2 className="text-xl font-semibold mb-2">Failed to Load Reservation</h2>
            <p className="text-muted-foreground mb-4">{error}</p>
            <Button onClick={() => rid && loadReservation(rid)}>Try Again</Button>
          </CardContent>
        </Card>
      </div>
    )
  }

  if (!reservation) return null

  const guest = Array.isArray(reservation.guests)
    ? reservation.guests[0]
    : reservation.guests
  const room = Array.isArray(reservation.rooms)
    ? reservation.rooms[0]
    : reservation.rooms
  const balance =
    reservation.balance != null
      ? reservation.balance
      : (reservation.total_amount || 0) - (reservation.deposit || 0)
  const amountPaid = reservation.deposit || 0

  const statusColors: Record<string, string> = {
    reserved: 'bg-blue-500/10 text-blue-700',
    confirmed: 'bg-green-500/10 text-green-700',
    cancelled: 'bg-red-500/10 text-red-700',
  }

  return (
    <div className="space-y-6">
      <Dialog open={paymentModalOpen} onOpenChange={setPaymentModalOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Update Payment</DialogTitle>
            <DialogDescription className="sr-only">
              Record a payment for this reservation
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Amount (NGN)</Label>
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
                  <SelectItem value="cash">Cash</SelectItem>
                  <SelectItem value="pos">POS</SelectItem>
                  <SelectItem value="transfer">Bank Transfer</SelectItem>
                  <SelectItem value="card">Card</SelectItem>
                  <SelectItem value="city_ledger">City Ledger</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Button
              onClick={handlePaymentUpdate}
              className="w-full"
              disabled={paymentLoading}
            >
              {paymentLoading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  {'Recording...'}
                </>
              ) : (
                'Record Payment'
              )}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <div className="flex items-center justify-between">
        <Button variant="ghost" onClick={() => router.push('/reservations')}>
          <ArrowLeft className="mr-2 h-4 w-4" />
          {'Back to Reservations'}
        </Button>
        <div className="flex gap-2">
          <Button
            variant="default"
            size="sm"
            onClick={handleCheckin}
            disabled={actionLoading || checkInNotReached}
            title={checkInNotReached ? `Check-in available from ${format(new Date(reservation!.check_in), 'dd MMM yyyy')}` : undefined}
          >
            <UserCheck className="mr-2 h-4 w-4" />
            {checkInNotReached
              ? `Check-in on ${format(new Date(reservation!.check_in), 'dd MMM')}`
              : 'Check-in Guest'}
          </Button>
          <Button
            variant="destructive"
            size="sm"
            onClick={handleDelete}
            disabled={actionLoading}
          >
            <Trash2 className="mr-2 h-4 w-4" />
            {'Cancel'}
          </Button>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>Reservation Details</CardTitle>
              <div className="flex gap-2">
                <Badge
                  variant="outline"
                  className={
                    statusColors[reservation.status] ||
                    'bg-muted text-muted-foreground'
                  }
                >
                  {String(reservation.status || '').charAt(0).toUpperCase() +
                    String(reservation.status || '').slice(1)}
                </Badge>
                <Badge
                  variant="outline"
                  className={
                    reservation.payment_status === 'paid'
                      ? 'bg-green-500/10 text-green-700'
                      : reservation.payment_status === 'partial'
                        ? 'bg-yellow-500/10 text-yellow-700'
                        : 'bg-red-500/10 text-red-700'
                  }
                >
                  {String(reservation.payment_status || 'unpaid').charAt(0).toUpperCase() +
                    String(reservation.payment_status || 'unpaid').slice(1)}
                </Badge>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <div className="text-sm text-muted-foreground">Guest Name</div>
                <div className="font-semibold">{guest?.name || '-'}</div>
              </div>
              <div>
                <div className="text-sm text-muted-foreground">Phone</div>
                <div className="font-semibold">{guest?.phone || '-'}</div>
              </div>
              <div>
                <div className="text-sm text-muted-foreground">Email</div>
                <div className="font-semibold">{guest?.email || '-'}</div>
              </div>
              <div>
                <div className="text-sm text-muted-foreground">Room</div>
                <div className="font-semibold">
                  {room
                    ? 'Room ' + room.room_number + ' - ' + room.room_type
                    : '-'}
                </div>
              </div>
              <div>
                <div className="text-sm text-muted-foreground">Folio ID</div>
                <div className="font-semibold font-mono text-sm">
                  {reservation.folio_id || '-'}
                </div>
              </div>
              <div>
                <div className="text-sm text-muted-foreground">
                  {'Rate / Night'}
                </div>
                <div className="font-semibold">
                  {formatNaira(reservation.rate_per_night || 0)}
                </div>
              </div>
              <div>
                <div className="text-sm text-muted-foreground">Check-in</div>
                <div className="font-semibold">
                  {reservation.check_in
                    ? format(new Date(reservation.check_in), 'dd MMM yyyy')
                    : '-'}
                </div>
              </div>
              <div>
                <div className="text-sm text-muted-foreground">Check-out</div>
                <div className="font-semibold">
                  {reservation.check_out
                    ? format(new Date(reservation.check_out), 'dd MMM yyyy')
                    : '-'}
                </div>
              </div>
              <div>
                <div className="text-sm text-muted-foreground">Nights</div>
                <div className="font-semibold">
                  {reservation.number_of_nights || '-'}
                </div>
              </div>
              <div>
                <div className="text-sm text-muted-foreground">
                  {'Payment Method'}
                </div>
                <div className="font-semibold capitalize">
                  {reservation.payment_method
                    ? String(reservation.payment_method).replace('_', ' ')
                    : '-'}
                </div>
              </div>
              {reservation.notes && (
                <div className="col-span-2">
                  <div className="text-sm text-muted-foreground">Notes</div>
                  <div className="font-semibold">{reservation.notes}</div>
                </div>
              )}
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
                <span className="font-semibold">
                  {formatNaira(reservation.total_amount || 0)}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Amount Paid</span>
                <span className="font-semibold text-green-600">
                  {formatNaira(amountPaid)}
                </span>
              </div>
              <div className="h-px bg-border" />
              <div className="flex justify-between text-lg">
                <span className="font-semibold">Balance</span>
                <span
                  className={
                    'font-bold ' +
                    (balance > 0 ? 'text-destructive' : 'text-green-600')
                  }
                >
                  {formatNaira(balance)}
                </span>
              </div>
              {balance > 0 && (
                <Button
                  className="w-full"
                  onClick={() => setPaymentModalOpen(true)}
                >
                  <CreditCard className="mr-2 h-4 w-4" />
                  {'Update Payment'}
                </Button>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Actions</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <Button
                className="w-full"
                variant="default"
                onClick={handleCheckin}
                disabled={actionLoading || checkInNotReached}
                title={checkInNotReached ? `Check-in available from ${format(new Date(reservation!.check_in), 'dd MMM yyyy')}` : undefined}
              >
                <UserCheck className="mr-2 h-4 w-4" />
                {checkInNotReached
                  ? `Check-in on ${format(new Date(reservation!.check_in), 'dd MMM')}`
                  : 'Check-in Guest'}
              </Button>
              <Button
                className="w-full"
                variant="destructive"
                onClick={handleDelete}
                disabled={actionLoading}
              >
                <Trash2 className="mr-2 h-4 w-4" />
                {'Cancel Reservation'}
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
