'use client'

import { useState, useMemo, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { EnhancedDataTable } from '@/components/shared/enhanced-data-table'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Calendar } from '@/components/ui/calendar'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { formatNaira } from '@/lib/utils/currency'
import { Calendar as CalendarIcon, TrendingUp, CreditCard, Loader2 } from 'lucide-react'
import { format, isToday, isSameDay } from 'date-fns'

interface Transaction {
  id: string
  transaction_id: string
  booking_id: string
  amount: number
  method: string
  status: string
  payment_date: string
  guest_name: string
  description?: string
}

export default function TransactionsPage() {
  const [selectedDate, setSelectedDate] = useState<Date>(new Date())
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [loading, setLoading] = useState(true)
  const router = useRouter()

  useEffect(() => {
    fetchTransactions()
  }, [selectedDate])

  const fetchTransactions = async () => {
    try {
      setLoading(true)
      const supabase = createClient()
      
      if (!supabase) {
        setTransactions([])
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
        setTransactions([])
        return
      }

      const dateStr = format(selectedDate, 'yyyy-MM-dd')
      const { data, error } = await supabase
        .from('payments')
        .select('*')
        .eq('organization_id', profile.organization_id)
        .gte('payment_date', `${dateStr}T00:00:00`)
        .lte('payment_date', `${dateStr}T23:59:59`)
        .order('payment_date', { ascending: false })

      if (error) throw error
      setTransactions(data || [])
    } catch (error: any) {
      console.error('Error fetching transactions:', error)
      setTransactions([])
    } finally {
      setLoading(false)
    }
  }

  const filteredTransactions = useMemo(() => {
    return transactions.filter(txn => 
      isSameDay(new Date(txn.payment_date), selectedDate)
    )
  }, [transactions, selectedDate])

  const totalAmount = useMemo(() => {
    return filteredTransactions
      .filter(txn => txn.status === 'completed')
      .reduce((sum, txn) => sum + txn.amount, 0)
  }, [filteredTransactions])

  const methodColors: Record<string, string> = {
    cash: 'bg-green-500/10 text-green-700 border-green-200',
    pos: 'bg-blue-500/10 text-blue-700 border-blue-200',
    transfer: 'bg-purple-500/10 text-purple-700 border-purple-200',
    city_ledger: 'bg-orange-500/10 text-orange-700 border-orange-200',
  }

  const statusColors: Record<string, string> = {
    completed: 'bg-green-500/10 text-green-700 border-green-200',
    partial: 'bg-yellow-500/10 text-yellow-700 border-yellow-200',
    pending: 'bg-orange-500/10 text-orange-700 border-orange-200',
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
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Transactions</h1>
          <p className="text-muted-foreground">All payment transactions and records</p>
        </div>
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline" className="gap-2">
              <CalendarIcon className="h-4 w-4" />
              {format(selectedDate, 'PPP')}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0" align="end">
            <Calendar
              mode="single"
              selected={selectedDate}
              onSelect={(date) => date && setSelectedDate(date)}
            />
          </PopoverContent>
        </Popover>
      </div>

      {/* Credit Card Style Total Card */}
      <Card className="relative overflow-hidden bg-gradient-to-br from-primary to-primary/80 text-primary-foreground">
        <CardContent className="p-6">
          <div className="flex items-start justify-between">
            <div className="space-y-2">
              <p className="text-sm opacity-90">
                {isToday(selectedDate) ? "Today's Total Revenue" : `Total Revenue for ${format(selectedDate, 'MMM dd, yyyy')}`}
              </p>
              <p className="text-4xl font-bold tracking-tight">
                {formatNaira(totalAmount)}
              </p>
              <div className="flex items-center gap-2 text-sm opacity-90">
                <TrendingUp className="h-4 w-4" />
                <span>{filteredTransactions.length} transaction{filteredTransactions.length !== 1 ? 's' : ''}</span>
              </div>
            </div>
            <div className="rounded-full bg-primary-foreground/20 p-3">
              <CreditCard className="h-8 w-8" />
            </div>
          </div>
          <div className="mt-4 pt-4 border-t border-primary-foreground/20">
            <div className="grid grid-cols-3 gap-4 text-sm">
              <div>
                <p className="opacity-75">Cash</p>
                <p className="font-semibold">
                  {formatNaira(filteredTransactions.filter(t => t.method === 'cash' && t.status === 'completed').reduce((sum, t) => sum + t.amount, 0))}
                </p>
              </div>
              <div>
                <p className="opacity-75">POS</p>
                <p className="font-semibold">
                  {formatNaira(filteredTransactions.filter(t => t.method === 'pos' && t.status === 'completed').reduce((sum, t) => sum + t.amount, 0))}
                </p>
              </div>
              <div>
                <p className="opacity-75">Transfer</p>
                <p className="font-semibold">
                  {formatNaira(filteredTransactions.filter(t => t.method === 'transfer' && t.status === 'completed').reduce((sum, t) => sum + t.amount, 0))}
                </p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <EnhancedDataTable
        data={filteredTransactions}
        searchKeys={['guest_name', 'transaction_id', 'description']}
        dateField="payment_date"
        filters={[
          {
            key: 'method',
            label: 'Payment Method',
            options: [
              { value: 'cash', label: 'Cash' },
              { value: 'pos', label: 'POS' },
              { value: 'transfer', label: 'Transfer' },
              { value: 'city_ledger', label: 'City Ledger' },
            ],
          },
          {
            key: 'status',
            label: 'Status',
            options: [
              { value: 'completed', label: 'Completed' },
              { value: 'partial', label: 'Partial' },
              { value: 'pending', label: 'Pending' },
            ],
          },
        ]}
        columns={[
          {
            key: 'transaction_id',
            label: 'Transaction ID',
            render: (txn) => (
              <div className="font-mono text-sm">{txn.transaction_id}</div>
            ),
          },
          {
            key: 'guest_name',
            label: 'Guest',
            render: (txn) => (
              <div>
                <div className="font-medium">{txn.guest_name}</div>
                <div className="text-xs text-muted-foreground">{txn.description || 'Payment'}</div>
              </div>
            ),
          },
          {
            key: 'payment_date',
            label: 'Date',
            render: (txn) => (
              <div className="text-sm">
                {new Date(txn.payment_date).toLocaleDateString('en-GB')}
              </div>
            ),
          },
          {
            key: 'amount',
            label: 'Amount',
            render: (txn) => (
              <div className="font-semibold">{formatNaira(txn.amount)}</div>
            ),
          },
          {
            key: 'method',
            label: 'Method',
            render: (txn) => (
              <Badge variant="outline" className={methodColors[txn.method]}>
                {txn.method.replace('_', ' ').toUpperCase()}
              </Badge>
            ),
          },
        ]}
        renderCard={(txn) => (
          <CardContent className="p-4">
            <div className="space-y-3">
              <div className="flex items-start justify-between">
                <div>
                  <div className="font-mono text-sm text-muted-foreground">{txn.transaction_id}</div>
                  <div className="font-semibold mt-1">{txn.guest_name}</div>
                  <div className="text-sm text-muted-foreground">{txn.description || 'Payment'}</div>
                </div>
                <Badge variant="outline" className={statusColors[txn.status]}>
                  {txn.status}
                </Badge>
              </div>
              <div className="grid grid-cols-2 gap-2 text-sm pt-2 border-t">
                <div>
                  <div className="text-muted-foreground">Amount</div>
                  <div className="font-semibold">{formatNaira(txn.amount)}</div>
                </div>
                <div>
                  <div className="text-muted-foreground">Method</div>
                  <Badge variant="outline" className={methodColors[txn.method]} size="sm">
                    {txn.method.replace('_', ' ').toUpperCase()}
                  </Badge>
                </div>
              </div>
            </div>
          </CardContent>
        )}
        itemsPerPage={20}
      />
    </div>
  )
}
