import { createClient } from '@/lib/supabase/server'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { RevenueBreakdownTable } from '@/components/analytics/revenue-breakdown-table'
import { formatNaira } from '@/lib/utils/currency'
import { DollarSign, TrendingUp, Users, Calendar } from 'lucide-react'

export default async function AnalyticsPage() {
  const supabase = await createClient()
  
  const { data: payments } = await supabase
    .from('payments')
    .select('*, guest:guests(*), organization:organizations(*), booking:bookings(*, room:rooms(*))')
    .order('payment_date', { ascending: false })

  const totalRevenue = payments?.reduce((sum, p) => sum + Number(p.amount), 0) || 0
  
  const today = new Date()
  const todayPayments = payments?.filter(p => {
    const pDate = new Date(p.payment_date)
    return pDate.toDateString() === today.toDateString()
  }) || []
  const todayRevenue = todayPayments.reduce((sum, p) => sum + Number(p.amount), 0)

  const thisMonth = new Date(today.getFullYear(), today.getMonth(), 1)
  const monthPayments = payments?.filter(p => new Date(p.payment_date) >= thisMonth) || []
  const monthRevenue = monthPayments.reduce((sum, p) => sum + Number(p.amount), 0)

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
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Total Revenue
            </CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatNaira(totalRevenue)}</div>
            <p className="text-xs text-muted-foreground mt-1">All time</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Today's Revenue
            </CardTitle>
            <Calendar className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatNaira(todayRevenue)}</div>
            <p className="text-xs text-muted-foreground mt-1">{todayPayments.length} transactions</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              This Month
            </CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatNaira(monthRevenue)}</div>
            <p className="text-xs text-muted-foreground mt-1">{monthPayments.length} transactions</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Transactions
            </CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{payments?.length || 0}</div>
            <p className="text-xs text-muted-foreground mt-1">Total payments</p>
          </CardContent>
        </Card>
      </div>

      <RevenueBreakdownTable payments={payments || []} />
    </div>
  )
}
