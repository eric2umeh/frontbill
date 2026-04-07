'use client'

import { useEffect, useState, useMemo } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Calendar } from '@/components/ui/calendar'
import { formatNaira } from '@/lib/utils/currency'
import { useAuth } from '@/lib/auth-context'
import {
  BarChart, Bar, LineChart, Line, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer
} from 'recharts'
import {
  TrendingUp, DollarSign, CreditCard, Users, Building2,
  AlertCircle, Download, Loader2, CalendarDays, Banknote,
  Smartphone, ArrowRightLeft, Clock, CheckCircle2, XCircle, CalendarIcon
} from 'lucide-react'
import { format, subDays, startOfMonth, endOfMonth, startOfWeek, endOfWeek, eachDayOfInterval, parseISO, startOfDay, endOfDay } from 'date-fns'

type Period = '7d' | '30d' | 'this_month' | 'this_week' | 'today' | 'custom'

const METHOD_COLORS: Record<string, string> = {
  cash: '#16a34a',
  pos: '#2563eb',
  transfer: '#7c3aed',
  bank_transfer: '#7c3aed',
  city_ledger: '#ea580c',
}

const CHART_COLORS = ['#16a34a', '#2563eb', '#7c3aed', '#ea580c', '#0891b2']

export default function AnalyticsPage() {
  const [payments, setPayments] = useState<any[]>([])
  const [bookings, setBookings] = useState<any[]>([])
  const [cityLedger, setCityLedger] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [period, setPeriod] = useState<Period>('30d')
  const [customDate, setCustomDate] = useState<Date>(new Date())
  const [calOpen, setCalOpen] = useState(false)
  const [paymentMethodFilter, setPaymentMethodFilter] = useState<string>('all')
  const { organizationId } = useAuth()

  const dateRange = useMemo(() => {
    const now = new Date()
    switch (period) {
      case 'today':     return { from: startOfDay(now), to: endOfDay(now) }
      case '7d':        return { from: subDays(now, 7), to: now }
      case '30d':       return { from: subDays(now, 30), to: now }
      case 'this_month': return { from: startOfMonth(now), to: endOfMonth(now) }
      case 'this_week':  return { from: startOfWeek(now, { weekStartsOn: 1 }), to: endOfWeek(now, { weekStartsOn: 1 }) }
      case 'custom':    return { from: startOfDay(customDate), to: endOfDay(customDate) }
    }
  }, [period, customDate])

  useEffect(() => { fetchData() }, [dateRange])

  const fetchData = async () => {
    setLoading(true)
    const supabase = createClient()
    if (!supabase) { setLoading(false); return }

    const [paymentsRes, bookingsRes, ledgerRes] = await Promise.all([
      supabase
        .from('payments')
        .select(`id, amount, payment_method, payment_date, booking_id, guest_id,
          guests:guest_id(name), bookings:booking_id(folio_id, check_in, check_out, payment_status)`)
        .eq('organization_id', organizationId)
        .gte('payment_date', dateRange.from.toISOString())
        .lte('payment_date', dateRange.to.toISOString())
        .order('payment_date', { ascending: true }),
      supabase
        .from('bookings')
        .select('id, folio_id, payment_status, rate_per_night, check_in, check_out, status,guests:guest_id(name)')
        .eq('organization_id', organizationId)
        .order('check_in', { ascending: false })
        .limit(200),
      supabase
        .from('city_ledger_accounts')
        .select('id, account_name, account_type, balance, contact_phone')
        .eq('organization_id', organizationId)
        .order('balance', { ascending: false }),
    ])

    setPayments(paymentsRes.data || [])
    setBookings(bookingsRes.data || [])
    setCityLedger(ledgerRes.data || [])
    setLoading(false)
  }

  // ---- computed metrics ----
  // Filter payments by method if selected
  const filteredPayments = useMemo(() => {
    if (!paymentMethodFilter || paymentMethodFilter === 'all') return payments
    return payments.filter(p => {
      if (paymentMethodFilter === 'transfer') return ['transfer', 'bank_transfer'].includes(p.payment_method)
      return p.payment_method === paymentMethodFilter
    })
  }, [payments, paymentMethodFilter])

  const totalRevenue = useMemo(() => filteredPayments.reduce((s, p) => s + p.amount, 0), [filteredPayments])
  const today = new Date()
  const todayRevenue = useMemo(() =>
    filteredPayments.filter(p => format(parseISO(p.payment_date), 'yyyy-MM-dd') === format(today, 'yyyy-MM-dd'))
      .reduce((s, p) => s + p.amount, 0), [filteredPayments])
  const outstandingBalance = useMemo(() =>
    cityLedger.reduce((s, a) => s + (a.balance || 0), 0), [cityLedger])
  const totalBookings = bookings.length
  const paidBookings = bookings.filter(b => b.payment_status === 'paid').length
  const unpaidBookings = bookings.filter(b => b.payment_status === 'unpaid').length
  const partialBookings = bookings.filter(b => b.payment_status === 'partial').length

  // Revenue by method
  const revenueByMethod = useMemo(() => {
    const map: Record<string, number> = {}
    filteredPayments.forEach(p => {
      const m = p.payment_method === 'bank_transfer' ? 'transfer' : p.payment_method
      map[m] = (map[m] || 0) + p.amount
    })
    return Object.entries(map).map(([method, amount]) => ({
      method: method.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase()),
      amount,
      fill: METHOD_COLORS[method] || '#6b7280',
    }))
  }, [filteredPayments])

  // Daily revenue trend
  const dailyRevenue = useMemo(() => {
    const days = eachDayOfInterval({ start: dateRange.from, end: dateRange.to })
    return days.map(day => {
      const key = format(day, 'yyyy-MM-dd')
      const dayPayments = filteredPayments.filter(p => format(parseISO(p.payment_date), 'yyyy-MM-dd') === key)
      const cash = dayPayments.filter(p => p.payment_method === 'cash').reduce((s, p) => s + p.amount, 0)
      const pos = dayPayments.filter(p => p.payment_method === 'pos').reduce((s, p) => s + p.amount, 0)
      const transfer = dayPayments.filter(p => ['transfer', 'bank_transfer'].includes(p.payment_method)).reduce((s, p) => s + p.amount, 0)
      const ledger = dayPayments.filter(p => p.payment_method === 'city_ledger').reduce((s, p) => s + p.amount, 0)
      return {
        date: format(day, period === '7d' || period === 'this_week' ? 'EEE dd' : 'MMM dd'),
        Cash: cash, POS: pos, Transfer: transfer, 'City Ledger': ledger,
        Total: cash + pos + transfer + ledger,
      }
    })
  }, [filteredPayments, dateRange, period])

  // Folio-level breakdown for audit trail
  const folioBreakdown = useMemo(() => {
    const map: Record<string, { folio_id: string; guest_name: string; total_paid: number; payment_status: string; check_in: string }> = {}
    filteredPayments.forEach(p => {
      const folio = p.bookings?.folio_id || '—'
      const guestName = p.guests?.name || 'Unknown'
      if (!map[folio]) {
        map[folio] = {
          folio_id: folio,
          guest_name: guestName,
          total_paid: 0,
          payment_status: p.bookings?.payment_status || 'unpaid',
          check_in: p.bookings?.check_in || '',
        }
      }
      map[folio].total_paid += p.amount
    })
    return Object.values(map).sort((a, b) => b.total_paid - a.total_paid)
  }, [payments])

  const paymentStatusDistribution = useMemo(() => [
    { name: 'Paid', value: paidBookings, fill: '#16a34a' },
    { name: 'Partial', value: partialBookings, fill: '#d97706' },
    { name: 'Unpaid', value: unpaidBookings, fill: '#dc2626' },
  ].filter(d => d.value > 0), [paidBookings, partialBookings, unpaidBookings])

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Revenue Analytics</h1>
          <p className="text-muted-foreground">Comprehensive financial overview — every naira accounted for</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Select value={period} onValueChange={(v) => setPeriod(v as Period)}>
            <SelectTrigger className="w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="today">Today</SelectItem>
              <SelectItem value="7d">Last 7 Days</SelectItem>
              <SelectItem value="this_week">This Week</SelectItem>
              <SelectItem value="30d">Last 30 Days</SelectItem>
              <SelectItem value="this_month">This Month</SelectItem>
              <SelectItem value="custom">Custom Date</SelectItem>
            </SelectContent>
          </Select>
          {period === 'custom' && (
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
          <Select value={paymentMethodFilter} onValueChange={setPaymentMethodFilter}>
            <SelectTrigger className="w-40">
              <SelectValue placeholder="All Methods" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Payment Methods</SelectItem>
              <SelectItem value="cash">Cash</SelectItem>
              <SelectItem value="pos">POS</SelectItem>
              <SelectItem value="transfer">Transfer</SelectItem>
              <SelectItem value="bank_transfer">Bank Transfer</SelectItem>
              <SelectItem value="city_ledger">City Ledger</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Total Revenue</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatNaira(totalRevenue)}</div>
            <p className="text-xs text-muted-foreground mt-1">All payment methods</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Today's Revenue</CardTitle>
            <CalendarDays className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatNaira(todayRevenue)}</div>
            <p className="text-xs text-muted-foreground mt-1">Collected today</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Outstanding (Ledger)</CardTitle>
            <AlertCircle className="h-4 w-4 text-orange-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-orange-600">{formatNaira(outstandingBalance)}</div>
            <p className="text-xs text-muted-foreground mt-1">City ledger accounts</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Payment Status</CardTitle>
            <CreditCard className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalBookings}</div>
            <div className="flex gap-2 mt-1 flex-wrap">
              <span className="text-xs text-green-600">{paidBookings} paid</span>
              <span className="text-xs text-yellow-600">{partialBookings} partial</span>
              <span className="text-xs text-red-600">{unpaidBookings} unpaid</span>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Method breakdown cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { key: 'cash', label: 'Cash', icon: <Banknote className="h-4 w-4" />, color: 'text-green-700', bg: 'bg-green-50 border-green-200' },
          { key: 'pos', label: 'POS / Card', icon: <Smartphone className="h-4 w-4" />, color: 'text-blue-700', bg: 'bg-blue-50 border-blue-200' },
          { key: 'transfer', label: 'Transfer', icon: <ArrowRightLeft className="h-4 w-4" />, color: 'text-purple-700', bg: 'bg-purple-50 border-purple-200' },
          { key: 'city_ledger', label: 'City Ledger', icon: <Building2 className="h-4 w-4" />, color: 'text-orange-700', bg: 'bg-orange-50 border-orange-200' },
        ].map(m => {
          const amt = filteredPayments
            .filter(p => m.key === 'transfer' ? ['transfer', 'bank_transfer'].includes(p.payment_method) : p.payment_method === m.key)
            .reduce((s, p) => s + p.amount, 0)
          const count = filteredPayments.filter(p => m.key === 'transfer' ? ['transfer', 'bank_transfer'].includes(p.payment_method) : p.payment_method === m.key).length
          return (
            <Card key={m.key} className={`border ${m.bg}`}>
              <CardContent className="p-4">
                <div className={`flex items-center gap-2 text-sm font-medium ${m.color} mb-2`}>
                  {m.icon} {m.label}
                </div>
                <div className={`text-xl font-bold ${m.color}`}>{formatNaira(amt)}</div>
                <div className="text-xs text-muted-foreground mt-1">{count} transaction{count !== 1 ? 's' : ''}</div>
              </CardContent>
            </Card>
          )
        })}
      </div>

      <Tabs defaultValue="trends">
        <TabsList>
          <TabsTrigger value="trends">Revenue Trend</TabsTrigger>
          <TabsTrigger value="methods">By Method</TabsTrigger>
          <TabsTrigger value="folios">Folio Audit Trail</TabsTrigger>
          <TabsTrigger value="ledger">City Ledger</TabsTrigger>
        </TabsList>

        {/* Revenue Trend */}
        <TabsContent value="trends" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle>Daily Revenue Breakdown</CardTitle>
              <CardDescription>Revenue by payment method per day — identifies which front desk session collected what</CardDescription>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={320}>
                <BarChart data={dailyRevenue} margin={{ top: 4, right: 16, left: 0, bottom: 4 }}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                  <YAxis tickFormatter={(v) => `₦${(v / 1000).toFixed(0)}k`} tick={{ fontSize: 11 }} />
                  <Tooltip formatter={(v: number) => formatNaira(v)} />
                  <Legend />
                  <Bar dataKey="Cash" stackId="a" fill="#16a34a" radius={[0, 0, 0, 0]} />
                  <Bar dataKey="POS" stackId="a" fill="#2563eb" />
                  <Bar dataKey="Transfer" stackId="a" fill="#7c3aed" />
                  <Bar dataKey="City Ledger" stackId="a" fill="#ea580c" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          <Card className="mt-4">
            <CardHeader>
              <CardTitle>Revenue Line Trend</CardTitle>
              <CardDescription>Total daily revenue over the selected period</CardDescription>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={240}>
                <LineChart data={dailyRevenue} margin={{ top: 4, right: 16, left: 0, bottom: 4 }}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                  <YAxis tickFormatter={(v) => `₦${(v / 1000).toFixed(0)}k`} tick={{ fontSize: 11 }} />
                  <Tooltip formatter={(v: number) => formatNaira(v)} />
                  <Line type="monotone" dataKey="Total" stroke="hsl(var(--primary))" strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </TabsContent>

        {/* By Method */}
        <TabsContent value="methods" className="mt-4">
          <div className="grid md:grid-cols-2 gap-4">
            <Card>
              <CardHeader>
                <CardTitle>Revenue Share by Method</CardTitle>
                <CardDescription>Pie chart distribution for the period</CardDescription>
              </CardHeader>
              <CardContent className="flex justify-center">
                <ResponsiveContainer width="100%" height={280}>
                  <PieChart>
                    <Pie data={revenueByMethod} dataKey="amount" nameKey="method" cx="50%" cy="50%" outerRadius={100} label={({ method, percent }) => `${method} ${(percent * 100).toFixed(0)}%`}>
                      {revenueByMethod.map((entry, idx) => (
                        <Cell key={idx} fill={entry.fill || CHART_COLORS[idx]} />
                      ))}
                    </Pie>
                    <Tooltip formatter={(v: number) => formatNaira(v)} />
                  </PieChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Payment Status Distribution</CardTitle>
                <CardDescription>Overall booking payment completion</CardDescription>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={200}>
                  <PieChart>
                    <Pie data={paymentStatusDistribution} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={80} label={({ name, value }) => `${name} (${value})`}>
                      {paymentStatusDistribution.map((entry, idx) => (
                        <Cell key={idx} fill={entry.fill} />
                      ))}
                    </Pie>
                    <Tooltip />
                  </PieChart>
                </ResponsiveContainer>
                <div className="mt-4 space-y-2">
                  {[
                    { label: 'Fully Paid', value: paidBookings, color: 'bg-green-500' },
                    { label: 'Partial Payment', value: partialBookings, color: 'bg-yellow-500' },
                    { label: 'Unpaid / City Ledger', value: unpaidBookings, color: 'bg-red-500' },
                  ].map(s => (
                    <div key={s.label} className="flex items-center justify-between text-sm">
                      <div className="flex items-center gap-2">
                        <div className={`h-2.5 w-2.5 rounded-full ${s.color}`} />
                        <span>{s.label}</span>
                      </div>
                      <span className="font-medium">{s.value}</span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Folio Audit Trail */}
        <TabsContent value="folios" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle>Folio-Level Payment Audit Trail</CardTitle>
              <CardDescription>
                Every payment tied to a folio with exact date and time — front desk cannot misrepresent payment history
              </CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              <div className="divide-y">
                {payments.length === 0 ? (
                  <div className="p-8 text-center text-muted-foreground">No payment records for this period</div>
                ) : (
                  payments.map((p, i) => {
                    const method = p.payment_method === 'bank_transfer' ? 'transfer' : p.payment_method
                    return (
                      <div key={p.id} className="flex flex-col sm:flex-row sm:items-center gap-2 px-4 py-3 hover:bg-muted/40 text-sm">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="font-mono text-xs text-muted-foreground">{p.bookings?.folio_id || '—'}</span>
                            <span className="font-medium truncate">{p.guests?.name || 'Unknown Guest'}</span>
                          </div>
                          <div className="flex items-center gap-1 text-xs text-muted-foreground mt-0.5">
                            <Clock className="h-3 w-3" />
                            {format(parseISO(p.payment_date), 'dd MMM yyyy, HH:mm')}
                            <span className="mx-1">·</span>
                            Check-in: {p.bookings?.check_in ? format(parseISO(p.bookings.check_in), 'dd MMM') : '—'}
                          </div>
                        </div>
                        <div className="flex items-center gap-3 shrink-0">
                          <Badge variant="outline" style={{ borderColor: METHOD_COLORS[method], color: METHOD_COLORS[method] }}>
                            {method.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase())}
                          </Badge>
                          <span className="font-bold">{formatNaira(p.amount)}</span>
                          {p.bookings?.payment_status === 'paid' ? (
                            <CheckCircle2 className="h-4 w-4 text-green-600 shrink-0" />
                          ) : p.bookings?.payment_status === 'partial' ? (
                            <Clock className="h-4 w-4 text-yellow-600 shrink-0" />
                          ) : (
                            <XCircle className="h-4 w-4 text-red-500 shrink-0" />
                          )}
                        </div>
                      </div>
                    )
                  })
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* City Ledger */}
        <TabsContent value="ledger" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle>City Ledger Account Status</CardTitle>
              <CardDescription>
                Outstanding balances per individual and organization — shows exactly what is owed and by whom
              </CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              {cityLedger.length === 0 ? (
                <div className="p-8 text-center text-muted-foreground">No city ledger accounts</div>
              ) : (
                <div className="divide-y">
                  {cityLedger.map(account => (
                    <div key={account.id} className="flex flex-col sm:flex-row sm:items-center gap-2 px-4 py-3 hover:bg-muted/40">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-medium">{account.account_name}</span>
                          <Badge variant="outline" className="text-xs capitalize">{account.account_type}</Badge>
                        </div>
                        {account.contact_phone && (
                          <div className="text-xs text-muted-foreground mt-0.5">{account.contact_phone}</div>
                        )}
                      </div>
                      <div className="flex items-center gap-4 shrink-0 text-sm">
                        <div className="text-right">
                          <div className="text-xs text-muted-foreground">Outstanding</div>
                          <div className={`font-bold ${account.balance > 0 ? 'text-red-600' : 'text-green-600'}`}>
                            {formatNaira(account.balance || 0)}
                          </div>
                        </div>
                        {account.balance > 0 ? (
                          <XCircle className="h-5 w-5 text-red-500" />
                        ) : (
                          <CheckCircle2 className="h-5 w-5 text-green-500" />
                        )}
                      </div>
                    </div>
                  ))}
                  <div className="px-4 py-3 bg-muted/30 flex items-center justify-between font-semibold text-sm">
                    <span>Total Outstanding</span>
                    <span className="text-red-600 text-base">{formatNaira(outstandingBalance)}</span>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}
