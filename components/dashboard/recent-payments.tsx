'use client'

import { useEffect, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { CreditCard, Loader2 } from 'lucide-react'
import { formatNaira } from '@/lib/utils/currency'
import { createClient } from '@/lib/supabase/client'
import { useAuth } from '@/lib/auth-context'
import { format, parseISO } from 'date-fns'

type PaymentRow = {
  id: string
  description: string
  amount: number
  payment_method: string
  payment_date: string
}

export function RecentPayments() {
  const { organizationId } = useAuth()
  const [payments, setPayments] = useState<PaymentRow[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!organizationId) return
    void fetchPayments()
  }, [organizationId])

  const fetchPayments = async () => {
    if (!organizationId) return
    try {
      setLoading(true)
      const supabase = createClient()

      if (!supabase) {
        setPayments([])
        return
      }

      const { data, error } = await supabase
        .from('payments')
        .select(
          `id, amount, payment_method, payment_date, notes,
           guests:guest_id(name),
           bookings:booking_id(folio_id)`,
        )
        .eq('organization_id', organizationId)
        .gt('amount', 0)
        .order('payment_date', { ascending: false })
        .limit(5)

      if (error) {
        console.error('Error fetching payments:', error.message || error.code || error)
        setPayments([])
        return
      }

      const rows: PaymentRow[] = (data ?? []).map((p: Record<string, unknown>) => {
        const guest = p.guests as { name?: string } | null
        const booking = p.bookings as { folio_id?: string } | null
        const folio = booking?.folio_id
        const guestName = guest?.name
        const notes = String(p.notes || '').trim()
        const method = String(p.payment_method || 'cash').replace('_', ' ')
        const description =
          notes ||
          (folio && guestName ? `${guestName} · ${folio}` : folio || guestName || `Payment (${method})`)

        return {
          id: String(p.id),
          description,
          amount: Number(p.amount) || 0,
          payment_method: String(p.payment_method || 'cash'),
          payment_date: String(p.payment_date || ''),
        }
      })

      setPayments(rows)
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error)
      console.error('Error fetching payments:', msg)
      setPayments([])
    } finally {
      setLoading(false)
    }
  }

  const formatPaymentDate = (iso: string) => {
    try {
      return format(parseISO(iso), 'd MMM yyyy')
    } catch {
      return iso ? new Date(iso).toLocaleDateString('en-GB') : '—'
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex gap-2 items-center">
          <CreditCard className="w-5 h-5" />
          Recent Payments
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {loading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : payments.length === 0 ? (
          <p className="text-center text-sm text-muted-foreground py-4">No payments yet</p>
        ) : (
          payments.map((p) => (
            <div
              key={p.id}
              className="flex justify-between items-center border-b pb-3 last:border-0 gap-3"
            >
              <div className="min-w-0">
                <p className="font-medium text-sm truncate">{p.description}</p>
                <p className="text-xs text-muted-foreground">{formatPaymentDate(p.payment_date)}</p>
              </div>
              <div className="flex gap-2 items-center shrink-0">
                <Badge variant="secondary" className="text-[10px] uppercase">
                  {p.payment_method.replace('_', ' ')}
                </Badge>
                <p className="font-semibold text-green-600 tabular-nums">
                  {formatNaira(p.amount)}
                </p>
              </div>
            </div>
          ))
        )}
      </CardContent>
    </Card>
  )
}
