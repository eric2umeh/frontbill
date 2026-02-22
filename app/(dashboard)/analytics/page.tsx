'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { EnhancedDataTable } from '@/components/shared/enhanced-data-table'
import { Badge } from '@/components/ui/badge'
import { formatNaira } from '@/lib/utils/currency'
import { DollarSign, TrendingUp, Users, ArrowUpRight, Loader2 } from 'lucide-react'
import { toast } from 'sonner'

export default function AnalyticsPage() {
  const [payments, setPayments] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const router = useRouter()

  useEffect(() => {
    fetchPayments()
  }, [])

  const fetchPayments = async () => {
    try {
      setLoading(true)
      const supabase = createClient()
      
      if (!supabase) {
        // No Supabase configured - show empty state
        setPayments([])
        setLoading(false)
        return
      }

      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        router.push('/auth/login')
        return
      }

      const { data: profile } = await supabase
        .from('profiles')
        .select('organization_id')
        .eq('id', user.id)
        .single()

      if (!profile) {
        toast.error('Organization not found')
        return
      }

      const { data, error } = await supabase
        .from('payments')
        .select('*')
        .eq('organization_id', profile.organization_id)
        .order('payment_date', { ascending: false })

      if (error) throw error
      setPayments(data || [])
    } catch (error: any) {
      console.error('Error fetching payments:', error)
      toast.error('Failed to load analytics')
    } finally {
      setLoading(false)
    }
  }

  const totalRevenue = payments.reduce((sum, payment) => sum + payment.amount, 0)
  const today = new Date()
  const todayRevenue = payments
    .filter(p => new Date(p.payment_date).toDateString() === today.toDateString())
    .reduce((sum, payment) => sum + payment.amount, 0)
  const thisMonth = payments
    .filter(p => new Date(p.payment_date).getMonth() === today.getMonth())
    .reduce((sum, payment) => sum + payment.amount, 0)
  const totalTransactions = payments.length

  const paymentMethodColors = {
    cash: 'bg-green-500/10 text-green-700 border-green-200',
    pos: 'bg-blue-500/10 text-blue-700 border-blue-200',
    transfer: 'bg-purple-500/10 text-purple-700 border-purple-200',
    city_ledger: 'bg-orange-500/10 text-orange-700 border-orange-200',
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Revenue Analytics</h1>
        <p className="text-muted-foreground">
          Detailed financial performance and revenue breakdown
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Revenue</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatNaira(totalRevenue)}</div>
            <p className="text-xs text-muted-foreground flex items-center gap-1">
              <ArrowUpRight className="h-3 w-3 text-green-600" />
              From all transactions
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Today's Revenue</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatNaira(todayRevenue)}</div>
            <p className="text-xs text-muted-foreground flex items-center gap-1">
              <ArrowUpRight className="h-3 w-3 text-green-600" />
              Current day
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Month Revenue</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatNaira(thisMonth)}</div>
            <p className="text-xs text-muted-foreground">This month</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Transactions</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalTransactions}</div>
            <p className="text-xs text-muted-foreground">Total transactions</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Payment Breakdown by Method</CardTitle>
        </CardHeader>
        <CardContent>
          <EnhancedDataTable
            data={payments}
            searchKeys={['method', 'booking_id']}
            filters={[
              {
                key: 'method',
                label: 'Payment Method',
                options: [
                  { value: 'cash', label: 'Cash' },
                  { value: 'pos', label: 'POS' },
                  { value: 'transfer', label: 'Transfer' },
                ],
              },
            ]}
            columns={[
              {
                key: 'payment_date',
                label: 'Date',
                render: (p) => new Date(p.payment_date).toLocaleDateString('en-GB'),
              },
              {
                key: 'method',
                label: 'Method',
                render: (p) => (
                  <Badge variant="outline" className={paymentMethodColors[p.method]}>
                    {p.method}
                  </Badge>
                ),
              },
              {
                key: 'amount',
                label: 'Amount',
                render: (p) => formatNaira(p.amount),
              },
            ]}
            itemsPerPage={15}
          />
        </CardContent>
      </Card>
    </div>
  )
}
