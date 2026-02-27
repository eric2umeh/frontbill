'use client'

import { useState, useMemo, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { EnhancedDataTable } from '@/components/shared/enhanced-data-table'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Calendar } from '@/components/ui/calendar'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { formatNaira } from '@/lib/utils/currency'
import {
  Calendar as CalendarIcon, TrendingUp, CreditCard, Loader2,
  Banknote, Smartphone, ArrowRightLeft, Building2, Clock
} from 'lucide-react'
import { format, startOfDay, endOfDay, startOfMonth, endOfMonth, startOfWeek, endOfWeek, subDays } from 'date-fns'

interface Payment {
  id: string
  booking_id: string | null
  guest_id: string | null
  amount: number
  payment_method: string
  payment_date: string
  reference_number: string | null
  notes: string | null
  received_by: string | null
  // joined
  guest_name?: string
  guest_phone?: string
  folio_id?: string
  received_by_name?: string
}

type DateRange = 'today' | 'yesterday' | 'this_week' | 'this_month' | 'custom'

export default function TransactionsPage() {
  const [payments, setPayments] = useState<Payment[]>([])
  const [loading, setLoading] = useState(true)
  const [dateRange, setDateRange] = useState<DateRange>('today')
  const [customDate, setCustomDate] = useState<Date>(new Date())
  const [calOpen, setCalOpen] = useState(false)
  const router = useRouter()

  const dateFilter = useMemo(() => {
    const now = new Date()
    switch (dateRange) {
      case 'today':
        return { from: startOfDay(now), to: endOfDay(now) }
      case 'yesterday':
        return { from: startOfDay(subDays(now, 1)), to: endOfDay(subDays(now, 1)) }
      case 'this_week':
        return { from: startOfWeek(now, { weekStartsOn: 1 }), to: endOfWeek(now, { weekStartsOn: 1 }) }
      case 'this_month':
        return { from: startOfMonth(now), to: endOfMonth(now) }
      case 'custom':
        return { from: startOfDay(customDate), to: endOfDay(customDate) }
    }
  }, [dateRange, customDate])

  const fetchPayments = useCallback(async () => {
    try {
      setLoading(true)
      const supabase = createClient()
      if (!supabase) { setPayments([]); setLoading(false); return }

      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/auth/login'); return }

      const { data: profile } = await supabase
        .from('profiles').select('organization_id').eq('id', user.id).single()
      if (!profile) { setPayments([]); return }

      const { data, error } = await supabase
        .from('payments')
        .select(`
          id, booking_id, guest_id, amount, payment_method, payment_date,
          reference_number, notes, received_by,
          guests:guest_id ( name, phone ),
          bookings:booking_id ( folio_id ),
          received_by_profile:profiles!payments_received_by_fkey ( full_name )
        `)
        .eq('organization_id', profile.organization_id)
        .gte('payment_date', dateFilter.from.toISOString())
        .lte('payment_date', dateFilter.to.toISOString())
        .order('payment_date', { ascending: false })

      if (error) throw error

      const mapped: Payment[] = (data || []).map((p: any) => ({
        ...p,
        guest_name: p.guests?.name || 'Walk-in / Unknown',
        guest_phone: p.guests?.phone || '',
        folio_id: p.bookings?.folio_id || '—',
        received_by_name: p.received_by_profile?.full_name || 'System',
      }))

      setPayments(mapped)
    } catch (err: any) {
      console.error('[v0] Error fetching payments:', err)
      setPayments([])
    } finally {
      setLoading(false)
    }
  }, [dateFilter, router])

  useEffect(() => { fetchPayments() }, [fetchPayments])

  // Summary calculations
  const summary = useMemo(() => {
    const completed = payments
    const cash   = completed.filter(p => p.payment_method === 'cash').reduce((s, p) => s + p.amount, 0)
    const pos    = completed.filter(p => p.payment_method === 'pos').reduce((s, p) => s + p.amount, 0)
    const transfer = completed.filter(p => p.payment_method === 'transfer' || p.payment_method === 'bank_transfer').reduce((s, p) => s + p.amount, 0)
    const ledger = completed.filter(p => p.payment_method === 'city_ledger').reduce((s, p) => s + p.amount, 0)
    const total  = completed.reduce((s, p) => s + p.amount, 0)
    return { cash, pos, transfer, ledger, total, count: completed.length }
  }, [payments])

  const methodConfig: Record<string, { label: string; color: string; bg: string; icon: React.ReactNode }> = {
    cash:         { label: 'Cash',         color: 'text-green-700',  bg: 'bg-green-50 border-green-200',  icon: <Banknote className="h-3.5 w-3.5" /> },
    pos:          { label: 'POS',          color: 'text-blue-700',   bg: 'bg-blue-50 border-blue-200',    icon: <Smartphone className="h-3.5 w-3.5" /> },
    transfer:     { label: 'Transfer',     color: 'text-purple-700', bg: 'bg-purple-50 border-purple-200',icon: <ArrowRightLeft className="h-3.5 w-3.5" /> },
    bank_transfer:{ label: 'Transfer',     color: 'text-purple-700', bg: 'bg-purple-50 border-purple-200',icon: <ArrowRightLeft className="h-3.5 w-3.5" /> },
    city_ledger:  { label: 'City Ledger',  color: 'text-orange-700', bg: 'bg-orange-50 border-orange-200',icon: <Building2 className="h-3.5 w-3.5" /> },
  }

  const rangeLabel = () => {
    switch (dateRange) {
      case 'today': return "Today"
      case 'yesterday': return "Yesterday"
      case 'this_week': return "This Week"
      case 'this_month': return "This Month"
      case 'custom': return format(customDate, 'dd MMM yyyy')
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
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

      {/* Revenue summary card */}
      <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
        <Card className="md:col-span-2 bg-primary text-primary-foreground">
          <CardContent className="p-6">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-sm opacity-80">{rangeLabel()} — Total Revenue</p>
                <p className="text-4xl font-bold mt-1">{formatNaira(summary.total)}</p>
                <p className="text-sm opacity-70 mt-1 flex items-center gap-1">
                  <TrendingUp className="h-3.5 w-3.5" />
                  {summary.count} transaction{summary.count !== 1 ? 's' : ''}
                </p>
              </div>
              <CreditCard className="h-8 w-8 opacity-60" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-5 flex flex-col gap-1">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Banknote className="h-4 w-4 text-green-600" /> Cash
            </div>
            <p className="text-2xl font-bold">{formatNaira(summary.cash)}</p>
            <p className="text-xs text-muted-foreground">{payments.filter(p => p.payment_method === 'cash').length} txn</p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-5 flex flex-col gap-1">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Smartphone className="h-4 w-4 text-blue-600" /> POS
            </div>
            <p className="text-2xl font-bold">{formatNaira(summary.pos)}</p>
            <p className="text-xs text-muted-foreground">{payments.filter(p => p.payment_method === 'pos').length} txn</p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-5 flex flex-col gap-1">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Building2 className="h-4 w-4 text-orange-600" /> City Ledger
            </div>
            <p className="text-2xl font-bold">{formatNaira(summary.ledger)}</p>
            <p className="text-xs text-muted-foreground text-orange-600">Outstanding / billed</p>
          </CardContent>
        </Card>
      </div>

      {/* Table */}
      {loading ? (
        <div className="flex items-center justify-center h-64">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <EnhancedDataTable
          data={payments}
          searchKeys={['guest_name', 'folio_id', 'reference_number', 'notes']}
          filters={[
            {
              key: 'payment_method',
              label: 'Payment Method',
              options: [
                { value: 'cash', label: 'Cash' },
                { value: 'pos', label: 'POS' },
                { value: 'transfer', label: 'Transfer' },
                { value: 'bank_transfer', label: 'Bank Transfer' },
                { value: 'city_ledger', label: 'City Ledger' },
              ],
            },
          ]}
          columns={[
            {
              key: 'folio_id',
              label: 'Folio Ref',
              render: (p) => (
                <span className="font-mono text-xs text-muted-foreground">{p.folio_id}</span>
              ),
            },
            {
              key: 'guest_name',
              label: 'Guest',
              render: (p) => (
                <div>
                  <div className="font-medium">{p.guest_name}</div>
                  {p.guest_phone && <div className="text-xs text-muted-foreground">{p.guest_phone}</div>}
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
              render: (p) => (
                <span className="font-semibold text-base">{formatNaira(p.amount)}</span>
              ),
            },
            {
              key: 'payment_method',
              label: 'Method',
              render: (p) => {
                const cfg = methodConfig[p.payment_method] || { label: p.payment_method, color: 'text-gray-700', bg: 'bg-gray-50 border-gray-200', icon: null }
                return (
                  <Badge variant="outline" className={`${cfg.bg} ${cfg.color} gap-1`}>
                    {cfg.icon}
                    {cfg.label}
                  </Badge>
                )
              },
            },
            {
              key: 'reference_number',
              label: 'Reference',
              render: (p) => (
                <span className="font-mono text-xs">{p.reference_number || '—'}</span>
              ),
            },
            {
              key: 'received_by_name',
              label: 'Received By',
              render: (p) => (
                <span className="text-sm text-muted-foreground">{p.received_by_name}</span>
              ),
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
                <div className="text-xs text-muted-foreground">Received by: {p.received_by_name}</div>
              </CardContent>
            )
          }}
          itemsPerPage={25}
        />
      )}
    </div>
  )
}
