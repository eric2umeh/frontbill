'use client'

import { useState, useMemo, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { EnhancedDataTable } from '@/components/shared/enhanced-data-table'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Calendar } from '@/components/ui/calendar'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { formatNaira } from '@/lib/utils/currency'
import { usePageData } from '@/hooks/use-page-data'
import { useAuth } from '@/lib/auth-context'
import {
  Calendar as CalendarIcon, TrendingUp, CreditCard, Loader2,
  Banknote, Smartphone, ArrowRightLeft, Building2, Clock
} from 'lucide-react'
import { format, startOfDay, endOfDay, startOfMonth, endOfMonth, startOfWeek, endOfWeek, subDays } from 'date-fns'

interface Payment {
  id: string
  booking_id: string | null
  guest_id: string | null
  guest_name: string
  room?: string
  amount: number
  payment_method: string
  payment_date: string
  reference_number: string | null
  notes: string | null
  received_by: string | null
  guest_phone?: string
  folio_id?: string
  received_by_name?: string
  status?: string
  description?: string
  source: 'payment' | 'transaction'
}

type DateRange = 'today' | 'yesterday' | 'this_week' | 'this_month' | 'custom'

export default function TransactionsPage() {
  const [payments, setPayments] = useState<Payment[]>([])
  const { initialLoading, startFetch, endFetch } = usePageData()
  const { organizationId } = useAuth()
  const [dateRange, setDateRange] = useState<DateRange>('this_month')
  const [customDate, setCustomDate] = useState<Date>(new Date())
  const [calOpen, setCalOpen] = useState(false)
  const router = useRouter()

  const dateFilter = useMemo(() => {
    const now = new Date()
    switch (dateRange) {
      case 'today':     return { from: startOfDay(now),           to: endOfDay(now) }
      case 'yesterday': return { from: startOfDay(subDays(now,1)), to: endOfDay(subDays(now,1)) }
      case 'this_week': return { from: startOfWeek(now,{weekStartsOn:1}), to: endOfWeek(now,{weekStartsOn:1}) }
      case 'this_month':return { from: startOfMonth(now),         to: endOfMonth(now) }
      case 'custom':    return { from: startOfDay(customDate),    to: endOfDay(customDate) }
    }
  }, [dateRange, customDate])

  const fetchPayments = useCallback(async () => {
    try {
      startFetch()
      const supabase = createClient()
      if (!supabase) { setPayments([]); endFetch(); return }

      const { data: txData, error: txError } = await supabase
        .from('transactions')
        .select('*')
        .eq('organization_id', organizationId)
        .order('created_at', { ascending: false })
        .limit(1000)

      if (txError) {
        console.error('Transactions query error:', txError)
        setPayments([])
        return
      }

      const all: Payment[] = (txData || [])
        .map((t: any) => ({
          id: t.id,
          booking_id: t.booking_id,
          guest_id: null,
          guest_name: t.guest_name || 'Unknown Guest',
          room: t.room || '',
          amount: t.amount,
          payment_method: t.payment_method,
          payment_date: t.created_at,
          reference_number: t.transaction_id || null,
          notes: t.description || null,
          received_by: null,
          guest_phone: '',
          folio_id: t.transaction_id || '—',
          received_by_name: t.received_by || 'System',
          status: t.status,
          description: t.description,
          source: 'transaction' as const,
        }))
        .filter((p) => {
          const pDate = new Date(p.payment_date).getTime()
          return pDate >= dateFilter.from.getTime() && pDate <= dateFilter.to.getTime()
        })

      setPayments(all)
    } catch (err: any) {
      console.error('Error fetching transactions:', err)
      setPayments([])
    } finally {
      endFetch()
    }
  }, [dateFilter, organizationId])

  useEffect(() => { fetchPayments() }, [fetchPayments])

  const summary = useMemo(() => {
    const cash     = payments.filter(p => p.payment_method === 'cash').reduce((s,p) => s + p.amount, 0)
    const pos      = payments.filter(p => p.payment_method === 'pos').reduce((s,p) => s + p.amount, 0)
    const transfer = payments.filter(p => ['transfer','bank_transfer'].includes(p.payment_method)).reduce((s,p) => s + p.amount, 0)
    const ledger   = payments.filter(p => p.payment_method === 'city_ledger').reduce((s,p) => s + p.amount, 0)
    const total    = payments.reduce((s,p) => s + p.amount, 0)
    return { cash, pos, transfer, ledger, total, count: payments.length }
  }, [payments])

  const methodConfig: Record<string, { label: string; color: string; bg: string; icon: React.ReactNode }> = {
    cash:         { label: 'Cash',        color: 'text-green-700',  bg: 'bg-green-50 border-green-200',   icon: <Banknote className="h-3.5 w-3.5" /> },
    pos:          { label: 'POS',         color: 'text-blue-700',   bg: 'bg-blue-50 border-blue-200',     icon: <Smartphone className="h-3.5 w-3.5" /> },
    transfer:     { label: 'Transfer',    color: 'text-purple-700', bg: 'bg-purple-50 border-purple-200', icon: <ArrowRightLeft className="h-3.5 w-3.5" /> },
    bank_transfer:{ label: 'Transfer',    color: 'text-purple-700', bg: 'bg-purple-50 border-purple-200', icon: <ArrowRightLeft className="h-3.5 w-3.5" /> },
    city_ledger:  { label: 'City Ledger', color: 'text-orange-700', bg: 'bg-orange-50 border-orange-200', icon: <Building2 className="h-3.5 w-3.5" /> },
  }

  const rangeLabel = () => {
    switch (dateRange) {
      case 'today':      return 'Today'
      case 'yesterday':  return 'Yesterday'
      case 'this_week':  return 'This Week'
      case 'this_month': return 'This Month'
      case 'custom':     return format(customDate, 'dd MMM yyyy')
    }
  }

  if (initialLoading) {
    return (
      <div className="flex items-center justify-center h-96">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Transactions</h1>
          <p className="text-muted-foreground">Full payment history with guest and folio details</p>
        </div>
        <div className="flex items-center gap-2">
          <Select value={dateRange} onValueChange={(v) => setDateRange(v as DateRange)}>
            <SelectTrigger className="w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="today">Today</SelectItem>
              <SelectItem value="yesterday">Yesterday</SelectItem>
              <SelectItem value="this_week">This Week</SelectItem>
              <SelectItem value="this_month">This Month</SelectItem>
              <SelectItem value="custom">Custom Date</SelectItem>
            </SelectContent>
          </Select>
          {dateRange === 'custom' && (
            <Popover open={calOpen} onOpenChange={setCalOpen}>
              <PopoverTrigger asChild>
                <Button variant="outline" className="gap-2">
                  <CalendarIcon className="h-4 w-4" />
                  {format(customDate, 'dd MMM yyyy')}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="end">
                <Calendar
                  mode="single"
                  selected={customDate}
                  onSelect={(d) => { if (d) { setCustomDate(d); setCalOpen(false) } }}
                />
              </PopoverContent>
            </Popover>
          )}
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="col-span-2 md:col-span-1 bg-primary text-primary-foreground">
          <CardContent className="p-5">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-sm opacity-80">{rangeLabel()} Total</p>
                <p className="text-3xl font-bold mt-1">{formatNaira(summary.total)}</p>
                <p className="text-xs opacity-70 mt-1 flex items-center gap-1">
                  <TrendingUp className="h-3 w-3" /> {summary.count} transaction{summary.count !== 1 ? 's' : ''}
                </p>
              </div>
              <CreditCard className="h-7 w-7 opacity-60" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5 flex flex-col gap-1">
            <div className="flex items-center gap-1.5 text-sm text-muted-foreground"><Banknote className="h-4 w-4 text-green-600" /> Cash</div>
            <p className="text-2xl font-bold">{formatNaira(summary.cash)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5 flex flex-col gap-1">
            <div className="flex items-center gap-1.5 text-sm text-muted-foreground"><Smartphone className="h-4 w-4 text-blue-600" /> POS</div>
            <p className="text-2xl font-bold">{formatNaira(summary.pos)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5 flex flex-col gap-1">
            <div className="flex items-center gap-1.5 text-sm text-muted-foreground"><Building2 className="h-4 w-4 text-orange-600" /> City Ledger</div>
            <p className="text-2xl font-bold">{formatNaira(summary.ledger)}</p>
          </CardContent>
        </Card>
      </div>

      {/* Table */}
      <EnhancedDataTable
        data={payments}
        searchKeys={['guest_name', 'folio_id', 'reference_number', 'notes']}
        onRowClick={(p) => router.push(`/transactions/${p.id}`)}
        filters={[
          {
            key: 'payment_method',
            label: 'Payment Method',
            options: [
              { value: 'cash',         label: 'Cash' },
              { value: 'pos',          label: 'POS' },
              { value: 'transfer',     label: 'Transfer' },
              { value: 'bank_transfer',label: 'Bank Transfer' },
              { value: 'city_ledger',  label: 'City Ledger' },
            ],
          },
        ]}
        columns={[
          {
            key: 'folio_id',
            label: 'Folio Ref',
            render: (p) => <span className="font-mono text-xs text-muted-foreground">{p.folio_id}</span>,
          },
          {
            key: 'guest_name',
            label: 'Guest',
            render: (p) => (
              <div>
                <div className="font-medium">{p.guest_name}</div>
                {p.room && <div className="text-xs text-muted-foreground">{p.room}</div>}
              </div>
            ),
          },
          {
            key: 'payment_date',
            label: 'Date & Time',
            render: (p) => (
              <div>
                <div className="text-sm">{format(new Date(p.payment_date), 'dd MMM yyyy')}</div>
                <div className="text-xs text-muted-foreground flex items-center gap-1">
                  <Clock className="h-3 w-3" />
                  {format(new Date(p.payment_date), 'HH:mm')}
                </div>
              </div>
            ),
          },
          {
            key: 'amount',
            label: 'Amount',
            render: (p) => <span className="font-semibold">{formatNaira(p.amount)}</span>,
          },
          {
            key: 'payment_method',
            label: 'Method',
            render: (p) => {
              const cfg = methodConfig[p.payment_method] || { label: p.payment_method, color: 'text-gray-700', bg: 'bg-gray-50 border-gray-200', icon: null }
              return (
                <div className="space-y-1">
                  <Badge variant="outline" className={`${cfg.bg} ${cfg.color} gap-1`}>
                    {cfg.icon}{cfg.label}
                  </Badge>
                  {p.payment_method === 'city_ledger' && p.notes && (
                    <div className="text-xs text-muted-foreground truncate max-w-[130px]">
                      {p.notes.replace(/^City Ledger:\s*/, '')}
                    </div>
                  )}
                </div>
              )
            },
          },
          {
            key: 'received_by_name',
            label: 'Received By',
            render: (p) => <span className="text-sm text-muted-foreground">{p.received_by_name}</span>,
          },
        ]}
        renderCard={(p) => {
          const cfg = methodConfig[p.payment_method] || { label: p.payment_method, color: 'text-gray-700', bg: 'bg-gray-50', icon: null }
          return (
            <CardContent className="p-4 space-y-3">
              <div className="flex justify-between items-start">
                <div>
                  <p className="font-semibold">{p.guest_name}</p>
                  <p className="text-xs text-muted-foreground font-mono">{p.folio_id}</p>
                </div>
                <span className="font-bold text-lg">{formatNaira(p.amount)}</span>
              </div>
              <div className="flex justify-between items-center text-sm border-t pt-2">
                <Badge variant="outline" className={`${cfg.bg} ${cfg.color} gap-1 text-xs`}>
                  {cfg.icon}{cfg.label}
                </Badge>
                <span className="text-muted-foreground">{format(new Date(p.payment_date), 'dd MMM, HH:mm')}</span>
              </div>
            </CardContent>
          )
        }}
        itemsPerPage={25}
      />
    </div>
  )
}
