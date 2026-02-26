'use client'

import { useEffect, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { CreditCard, Loader2 } from 'lucide-react'
import { formatNaira } from '@/lib/utils/currency'
import { createClient } from '@/lib/supabase/client'

interface Payment {
  id: string
  description: string
  amount: number
  payment_status: string
  created_at: string
}

const methodColors = {
  cash: 'bg-green-500/10 text-green-700',
  pos: 'bg-blue-500/10 text-blue-700',
  transfer: 'bg-purple-500/10 text-purple-700',
  city_ledger: 'bg-orange-500/10 text-orange-700',
}

export function RecentPayments() {
  const [payments, setPayments] = useState<Payment[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchPayments()
  }, [])

  const fetchPayments = async () => {
    try {
      setLoading(true)
      const supabase = createClient()
      
      if (!supabase) {
        setPayments([])
        setLoading(false)
        return
      }

      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      const { data: profile } = await supabase
        .from('profiles')
        .select('organization_id')
        .eq('id', user.id)
        .single()

      if (!profile) {
        setPayments([])
        return
      }

      const { data, error } = await supabase
        .from('folio_charges')
        .select('id, description, amount, payment_status, created_at')
        .eq('payment_status', 'paid')
        .order('created_at', { ascending: false })
        .limit(5)

      if (error) throw error
      setPayments(data || [])
    } catch (error: any) {
      console.error('Error fetching payments:', error)
      setPayments([])
    } finally {
      setLoading(false)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex gap-2 items-center"><CreditCard className="w-5 h-5" />Recent Payments</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {loading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : payments.length === 0 ? (
          <p className="text-center text-sm text-muted-foreground py-4">No payments yet</p>
        ) : (
          payments.map(p => (
            <div key={p.id} className="flex justify-between items-center border-b pb-3 last:border-0">
              <div>
                <p className="font-medium text-sm">{p.description}</p>
                <p className="text-xs text-muted-foreground">{new Date(p.created_at).toLocaleDateString('en-GB')}</p>
              </div>
              <div className="flex gap-3 items-center">
                <Badge variant={p.payment_status === 'paid' ? 'default' : 'secondary'}>
                  {p.payment_status.replace('_', ' ').toUpperCase()}
                </Badge>
                <p className="font-semibold text-green-600">{formatNaira(Math.abs(p.amount))}</p>
              </div>
            </div>
          ))
        )}
      </CardContent>
    </Card>
  )
}
