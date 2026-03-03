'use client'

import { useState, useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { ArrowLeft, Calendar, User, DollarSign, CreditCard, File } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { formatNaira } from '@/lib/utils/currency'
import { format } from 'date-fns'
import { toast } from 'sonner'

export default function TransactionDetailPage() {
  const params = useParams()
  const router = useRouter()
  const transactionId = params.id as string

  const [transaction, setTransaction] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [booking, setBooking] = useState<any>(null)
  const [guest, setGuest] = useState<any>(null)

  useEffect(() => {
    fetchTransactionDetails()
  }, [transactionId])

  const fetchTransactionDetails = async () => {
    try {
      setLoading(true)
      const supabase = createClient()

      // First try to find in payments table
      let txData = null
      let source = 'unknown'

      const { data: paymentData } = await supabase
        .from('payments')
        .select('*')
        .eq('id', transactionId)
        .single()

      if (paymentData) {
        txData = paymentData
        source = 'payment'
      } else {
        // Try transactions table
        const { data: txnData } = await supabase
          .from('transactions')
          .select('*')
          .eq('id', transactionId)
          .single()
        if (txnData) {
          txData = txnData
          source = 'transaction'
        }
      }

      if (!txData) {
        toast.error('Transaction not found')
        router.back()
        return
      }

      // Fetch booking details if booking_id exists
      if (txData.booking_id) {
        const { data: bookingData } = await supabase
          .from('bookings')
          .select('*')
          .eq('id', txData.booking_id)
          .single()
        setBooking(bookingData)
      }

      // Fetch guest details if guest_id exists
      if (txData.guest_id) {
        const { data: guestData } = await supabase
          .from('guests')
          .select('*')
          .eq('id', txData.guest_id)
          .single()
        setGuest(guestData)
      }

      setTransaction({ ...txData, source })
    } catch (error: any) {
      console.error('Error fetching transaction:', error)
      toast.error('Failed to load transaction details')
      router.back()
    } finally {
      setLoading(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <p className="text-muted-foreground">Loading transaction details...</p>
      </div>
    )
  }

  if (!transaction) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <p className="text-muted-foreground">Transaction not found</p>
      </div>
    )
  }

  const getPaymentMethodIcon = (method: string) => {
    switch (method) {
      case 'cash': return <Banknote className="h-4 w-4" />
      case 'pos': return <CreditCard className="h-4 w-4" />
      case 'card': return <CreditCard className="h-4 w-4" />
      case 'bank_transfer': return <ArrowRightLeft className="h-4 w-4" />
      case 'city_ledger': return <File className="h-4 w-4" />
      default: return <DollarSign className="h-4 w-4" />
    }
  }

  const transactionDate = transaction.payment_date || transaction.created_at
  const transactionNotes = transaction.notes || transaction.description || 'No notes'
  const guestName = transaction.guest_name || guest?.name || 'Unknown Guest'
  const roomInfo = transaction.room || booking?.room_number || '-'

  return (
    <div className="min-h-screen bg-background p-6">
      <div className="max-w-2xl mx-auto">
        {/* Header */}
        <div className="flex items-center gap-4 mb-6">
          <Button variant="ghost" size="icon" onClick={() => router.back()}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <h1 className="text-3xl font-bold">Transaction Details</h1>
            <p className="text-sm text-muted-foreground">{transactionId}</p>
          </div>
        </div>

        {/* Amount Card */}
        <Card className="mb-6 bg-gradient-to-r from-primary/10 to-primary/5">
          <CardContent className="pt-6">
            <div className="flex items-end justify-between">
              <div>
                <p className="text-sm text-muted-foreground mb-1">Transaction Amount</p>
                <p className="text-4xl font-bold">{formatNaira(Math.abs(transaction.amount))}</p>
              </div>
              <Badge variant={transaction.amount > 0 ? 'default' : 'secondary'}>
                {transaction.amount > 0 ? 'Inflow' : 'Outflow'}
              </Badge>
            </div>
          </CardContent>
        </Card>

        {/* Details Grid */}
        <div className="grid md:grid-cols-2 gap-6 mb-6">
          {/* Left Column */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Transaction Information</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <p className="text-sm text-muted-foreground">Date & Time</p>
                <p className="font-medium flex items-center gap-2">
                  <Calendar className="h-4 w-4" />
                  {format(new Date(transactionDate), 'PPpp')}
                </p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Payment Method</p>
                <p className="font-medium flex items-center gap-2">
                  {getPaymentMethodIcon(transaction.payment_method)}
                  {transaction.payment_method.replace(/_/g, ' ').toUpperCase()}
                </p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Status</p>
                <Badge variant="outline" className="mt-1">
                  {transaction.payment_status || transaction.status || 'Completed'}
                </Badge>
              </div>
            </CardContent>
          </Card>

          {/* Right Column */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Guest & Booking</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <p className="text-sm text-muted-foreground">Guest Name</p>
                <p className="font-medium flex items-center gap-2">
                  <User className="h-4 w-4" />
                  {guestName}
                </p>
              </div>
              {booking && (
                <div>
                  <p className="text-sm text-muted-foreground">Folio ID / Room</p>
                  <p className="font-medium">{booking.folio_id} - Room {roomInfo}</p>
                </div>
              )}
              {guest?.phone && (
                <div>
                  <p className="text-sm text-muted-foreground">Contact</p>
                  <p className="font-medium">{guest.phone}</p>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Notes */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Notes</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm">{transactionNotes}</p>
          </CardContent>
        </Card>

        {/* Actions */}
        <div className="flex gap-2 mt-6">
          {booking && (
            <Button onClick={() => router.push(`/bookings/${booking.id}`)}>
              View Booking
            </Button>
          )}
          <Button variant="outline" onClick={() => router.back()}>
            Back
          </Button>
        </div>
      </div>
    </div>
  )
}
