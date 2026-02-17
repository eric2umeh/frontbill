'use client'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { EnhancedDataTable } from '@/components/shared/enhanced-data-table'
import { Badge } from '@/components/ui/badge'
import { formatNaira } from '@/lib/utils/currency'
import { DollarSign, TrendingUp, Users, Calendar, ArrowUpRight, ArrowDownRight } from 'lucide-react'

// Mock analytics data
const mockPayments = [
  { id: 'TXN001', date: '2024-01-15', guestName: 'Mr. Adewale Johnson', room: '101', amount: 45000, method: 'Cash', payer: 'Individual' },
  { id: 'TXN002', date: '2024-01-15', guestName: 'Mrs. Fatima Bello', room: '205', amount: 120000, method: 'Transfer', payer: 'Shell Nigeria' },
  { id: 'TXN003', date: '2024-01-14', guestName: 'Chief Emeka Okafor', room: '301', amount: 85000, method: 'POS', payer: 'Individual' },
  { id: 'TXN004', date: '2024-01-14', guestName: 'Dr. Sarah Williams', room: '202', amount: 95000, method: 'City Ledger', payer: 'WHO' },
  { id: 'TXN005', date: '2024-01-13', guestName: 'Mr. Pierre Dubois', room: '401', amount: 150000, method: 'Transfer', payer: 'TotalEnergies' },
]

export default function AnalyticsPage() {
  const totalRevenue = 4850000
  const todayRevenue = 275000
  const monthRevenue = 3420000
  const totalTransactions = 156

  const paymentMethodColors = {
    Cash: 'bg-green-500/10 text-green-700 border-green-200',
    POS: 'bg-blue-500/10 text-blue-700 border-blue-200',
    Transfer: 'bg-purple-500/10 text-purple-700 border-purple-200',
    'City Ledger': 'bg-orange-500/10 text-orange-700 border-orange-200',
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
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Total Revenue
            </CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatNaira(totalRevenue)}</div>
            <p className="text-xs text-green-600 mt-1 flex items-center gap-1">
              <ArrowUpRight className="h-3 w-3" />
              +12.5% from last month
            </p>
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
            <p className="text-xs text-muted-foreground mt-1">12 transactions today</p>
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
            <p className="text-xs text-green-600 mt-1 flex items-center gap-1">
              <ArrowUpRight className="h-3 w-3" />
              89 transactions
            </p>
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
            <div className="text-2xl font-bold">{totalTransactions}</div>
            <p className="text-xs text-muted-foreground mt-1">All time payments</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Revenue Breakdown</CardTitle>
        </CardHeader>
        <CardContent>
          <EnhancedDataTable
            data={mockPayments}
            searchKeys={['id', 'guestName', 'payer']}
            filters={[
              {
                key: 'method',
                label: 'Payment Method',
                options: [
                  { value: 'Cash', label: 'Cash' },
                  { value: 'POS', label: 'POS' },
                  { value: 'Transfer', label: 'Transfer' },
                  { value: 'City Ledger', label: 'City Ledger' },
                ],
              },
            ]}
            columns={[
              {
                key: 'id',
                label: 'Transaction ID',
                render: (payment) => <div className="font-mono text-sm">{payment.id}</div>,
              },
              {
                key: 'date',
                label: 'Date',
                render: (payment) => (
                  <div className="text-sm">{new Date(payment.date).toLocaleDateString('en-GB')}</div>
                ),
              },
              {
                key: 'guestName',
                label: 'Guest',
                render: (payment) => (
                  <div>
                    <div className="font-medium">{payment.guestName}</div>
                    <div className="text-xs text-muted-foreground">Room {payment.room}</div>
                  </div>
                ),
              },
              {
                key: 'amount',
                label: 'Amount',
                render: (payment) => <div className="font-semibold">{formatNaira(payment.amount)}</div>,
              },
              {
                key: 'method',
                label: 'Method',
                render: (payment) => (
                  <Badge variant="outline" className={paymentMethodColors[payment.method as keyof typeof paymentMethodColors]}>
                    {payment.method}
                  </Badge>
                ),
              },
              {
                key: 'payer',
                label: 'Payer',
                render: (payment) => <div className="text-sm">{payment.payer}</div>,
              },
            ]}
            itemsPerPage={10}
          />
        </CardContent>
      </Card>
    </div>
  )
}
