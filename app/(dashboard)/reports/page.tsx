'use client'

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useAuth } from '@/lib/auth-context'
import { formatNaira } from '@/lib/utils/currency'
import { format, parseISO, startOfDay, endOfDay } from 'date-fns'
import { toast } from 'sonner'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Calendar } from '@/components/ui/calendar'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import {
  Loader2,
  CalendarIcon,
  Printer,
  FileBarChart,
  BedDouble,
  Users,
  Building2,
  ReceiptText,
  Wallet,
  Undo2,
  PieChart,
  TrendingDown,
  Scale,
} from 'lucide-react'
import { DailyExpenditurePanel } from '@/components/reports/daily-expenditure-panel'
import { MonthlyPlPanel } from '@/components/reports/monthly-pl-panel'
import { cn } from '@/lib/utils'
import { GuestDailyRevenueSummary } from '@/components/reports/guest-daily-revenue-summary'
import {
  DailyRevenueAccrualPanel,
  OccupancyRangePanel,
  SalesCollectionPanel,
  AccountantChargeSummaryPanel,
  RefundsPanel,
} from '@/components/reports/financial-and-refund-panels'

/* ------------------------------------------------------------------ */
/*  Date Picker                                                       */
/* ------------------------------------------------------------------ */

function DatePicker({
  date,
  onSelect,
  label,
}: {
  date?: Date
  onSelect: (d: Date | undefined) => void
  label?: string
}) {
  const [open, setOpen] = useState(false)
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" className={cn('w-[180px] justify-start text-left font-normal', !date && 'text-muted-foreground')}>
          <CalendarIcon className="mr-2 h-4 w-4" />
          {date ? format(date, 'dd MMM yyyy') : (label || 'Pick date')}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <Calendar
          mode="single"
          selected={date}
          onSelect={(d: Date | undefined) => {
            onSelect(d)
            setOpen(false)
          }}
          initialFocus
        />
      </PopoverContent>
    </Popover>
  )
}

/* ------------------------------------------------------------------ */
/*  Stat Card                                                         */
/* ------------------------------------------------------------------ */

function StatCard({ label, value }: { label: string; value: string | number }) {
  return (
    <Card>
      <CardContent className="p-4">
        <p className="text-sm text-muted-foreground">{label}</p>
        <p className="text-2xl font-bold">{value}</p>
      </CardContent>
    </Card>
  )
}

/* ------------------------------------------------------------------ */
/*  Print wrapper                                                     */
/* ------------------------------------------------------------------ */

function PrintButton({ label }: { label?: string }) {
  return (
    <Button variant="outline" size="sm" onClick={() => window.print()}>
      <Printer className="mr-2 h-4 w-4" />
      {label ?? 'Print Report'}
    </Button>
  )
}

/* ------------------------------------------------------------------ */
/*  Daily Revenue Report                                              */
/* ------------------------------------------------------------------ */

/* ------------------------------------------------------------------ */
/*  Guest Report                                                      */
/* ------------------------------------------------------------------ */

interface GuestRow {
  id: string
  name: string
  phone: string | null
  email: string | null
  balance: number
  last_visit: string | null
}

function GuestReport({ organizationId }: { organizationId: string }) {
  const [loading, setLoading] = useState(false)
  const [guests, setGuests] = useState<GuestRow[]>([])
  const [fetched, setFetched] = useState(false)
  const [startDate, setStartDate] = useState<Date | undefined>(undefined)
  const [endDate, setEndDate] = useState<Date | undefined>(undefined)

  const fetchData = useCallback(async () => {
    try {
      setLoading(true)
      const supabase = createClient()
      if (!supabase) { setGuests([]); return }

      const { data, error } = await supabase
        .from('guests')
        .select('id, name, phone, email, created_at')
        .eq('organization_id', organizationId)
        .order('name')

      if (error) throw error

      const guestIds = (data || []).map((g: any) => g.id)

      let bookingMap: Record<string, { balance: number; lastCheckIn: string | null }> = {}
      if (guestIds.length > 0) {
        const { data: bookings } = await supabase
          .from('bookings')
          .select('guest_id, balance, check_in')
          .in('guest_id', guestIds)

        if (bookings) {
          for (const b of bookings as any[]) {
            if (!bookingMap[b.guest_id]) {
              bookingMap[b.guest_id] = { balance: 0, lastCheckIn: null }
            }
            bookingMap[b.guest_id].balance += Number(b.balance || 0)
            if (!bookingMap[b.guest_id].lastCheckIn || b.check_in > bookingMap[b.guest_id].lastCheckIn!) {
              bookingMap[b.guest_id].lastCheckIn = b.check_in
            }
          }
        }
      }

      const mapped: GuestRow[] = (data || []).map((g: any) => ({
        id: g.id,
        name: g.name,
        phone: g.phone,
        email: g.email,
        balance: bookingMap[g.id]?.balance || 0,
        last_visit: bookingMap[g.id]?.lastCheckIn || null,
      }))

      setGuests(mapped)
      setFetched(true)
    } catch (err: any) {
      console.error('Error fetching guest data:', err)
      toast.error('Failed to fetch guest data')
      setGuests([])
    } finally {
      setLoading(false)
    }
  }, [organizationId])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  // Apply date filter
  const filteredGuests = guests.filter((g) => {
    if (!startDate && !endDate) return true
    if (!g.last_visit) return false
    const visitDate = new Date(g.last_visit)
    if (startDate && visitDate < startOfDay(startDate)) return false
    if (endDate && visitDate > endOfDay(endDate)) return false
    return true
  })

  const totalGuests = filteredGuests.length
  const withBalance = filteredGuests.filter((g) => g.balance > 0).length

  return (
    <div className="space-y-4 print-section">
      <div className="flex gap-2 items-center justify-between flex-wrap print:hidden mb-4">
        <div className="flex gap-2 items-center">
          <DatePicker date={startDate} onSelect={setStartDate} label="From" />
          <DatePicker date={endDate} onSelect={setEndDate} label="To" />
          {(startDate || endDate) && (
            <Button variant="ghost" size="sm" onClick={() => { setStartDate(undefined); setEndDate(undefined) }}>
              Clear
            </Button>
          )}
        </div>
        <PrintButton />
      </div>

      <div className="print:block hidden text-lg font-bold mb-2">Guest Report</div>

      {loading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin" />
        </div>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-3">
            <StatCard label="Total Guests" value={totalGuests} />
            <StatCard label="Outstanding Balance" value={withBalance} />
            <StatCard
              label="Total Outstanding"
              value={formatNaira(filteredGuests.reduce((s, g) => s + g.balance, 0))}
            />
          </div>

          {fetched && filteredGuests.length === 0 && (
            <p className="text-muted-foreground text-center py-8">No guests found{(startDate || endDate) ? ' for selected date range' : ''}.</p>
          )}

          {filteredGuests.length > 0 && (
            <div className="border rounded-lg overflow-auto">
              <div className="min-w-[640px]">
                <div className="grid grid-cols-5 gap-2 px-4 py-2 bg-muted text-sm font-medium">
                  <div>Guest Name</div>
                  <div>Phone</div>
                  <div>Email</div>
                  <div className="text-right">Balance</div>
                  <div>Last Visit</div>
                </div>
                {filteredGuests.map((g) => (
                  <div
                    key={g.id}
                    className="grid grid-cols-5 gap-2 px-4 py-2 border-t text-sm"
                  >
                    <div className="font-medium truncate">{g.name}</div>
                    <div className="text-muted-foreground truncate">{g.phone || '—'}</div>
                    <div className="text-muted-foreground truncate">{g.email || '—'}</div>
                    <div className={cn('text-right font-medium', g.balance > 0 ? 'text-red-600' : 'text-green-600')}>
                      {formatNaira(g.balance)}
                    </div>
                    <div className="text-muted-foreground">
                      {g.last_visit ? format(parseISO(g.last_visit), 'dd MMM yyyy') : '—'}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}

/* ------------------------------------------------------------------ */
/*  City Ledger Report                                                */
/* ------------------------------------------------------------------ */

interface LedgerRow {
  id: string
  account_name: string
  account_type: string
  balance: number
  contact_email: string | null
  contact_phone: string | null
}

function CityLedgerReport({ organizationId }: { organizationId: string }) {
  const [loading, setLoading] = useState(false)
  const [accounts, setAccounts] = useState<LedgerRow[]>([])
  const [fetched, setFetched] = useState(false)
  const [startDate, setStartDate] = useState<Date | undefined>(undefined)
  const [endDate, setEndDate] = useState<Date | undefined>(undefined)

  const fetchData = useCallback(async () => {
    try {
      setLoading(true)
      const supabase = createClient()
      if (!supabase) { setAccounts([]); return }

      const { data, error } = await supabase
        .from('city_ledger_accounts')
        .select('id, account_name, account_type, balance, contact_email, contact_phone, created_at')
        .eq('organization_id', organizationId)
        .order('account_name')

      if (error) throw error

      const mapped: LedgerRow[] = (data || []).map((a: any) => ({
        id: a.id,
        account_name: a.account_name,
        account_type: a.account_type || 'organization',
        balance: Number(a.balance || 0),
        contact_email: a.contact_email,
        contact_phone: a.contact_phone,
      }))

      setAccounts(mapped)
      setFetched(true)
    } catch (err: any) {
      console.error('Error fetching city ledger data:', err)
      toast.error('Failed to fetch city ledger data')
      setAccounts([])
    } finally {
      setLoading(false)
    }
  }, [organizationId])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  // Apply date filter based on account creation date
  const filteredAccounts = accounts.filter((a: any) => {
    if (!startDate && !endDate) return true
    if (!a.created_at) return false
    const createdDate = new Date(a.created_at)
    if (startDate && createdDate < startOfDay(startDate)) return false
    if (endDate && createdDate > endOfDay(endDate)) return false
    return true
  })

  const totalOutstanding = filteredAccounts.reduce((s, a) => s + a.balance, 0)

  return (
    <div className="space-y-4 print-section">
      <div className="flex gap-2 items-center justify-between flex-wrap print:hidden mb-4">
        <div className="flex gap-2 items-center">
          <DatePicker date={startDate} onSelect={setStartDate} label="From" />
          <DatePicker date={endDate} onSelect={setEndDate} label="To" />
          {(startDate || endDate) && (
            <Button variant="ghost" size="sm" onClick={() => { setStartDate(undefined); setEndDate(undefined) }}>
              Clear
            </Button>
          )}
        </div>
        <PrintButton />
      </div>

      <div className="print:block hidden text-lg font-bold mb-2">City Ledger Report</div>

      {loading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin" />
        </div>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2">
            <StatCard label="Total Accounts" value={filteredAccounts.length} />
            <StatCard label="Total Outstanding" value={formatNaira(totalOutstanding)} />
          </div>

          {fetched && filteredAccounts.length === 0 && (
            <p className="text-muted-foreground text-center py-8">
              No city ledger accounts found{(startDate || endDate) ? ' for selected date range' : ''}.
            </p>
          )}

          {filteredAccounts.length > 0 && (
            <div className="border rounded-lg overflow-auto">
              <div className="min-w-[640px]">
                <div className="grid grid-cols-4 gap-2 px-4 py-2 bg-muted text-sm font-medium">
                  <div>Account Name</div>
                  <div>Type</div>
                  <div className="text-right">Balance</div>
                  <div>Contact</div>
                </div>
                {filteredAccounts.map((a) => (
                  <div
                    key={a.id}
                    className="grid grid-cols-4 gap-2 px-4 py-2 border-t text-sm"
                  >
                    <div className="font-medium truncate">{a.account_name}</div>
                    <div className="capitalize text-muted-foreground">
                      {a.account_type.replace(/_/g, ' ')}
                    </div>
                    <div className={cn('text-right font-medium', a.balance > 0 ? 'text-red-600' : 'text-green-600')}>
                      {formatNaira(a.balance)}
                    </div>
                    <div className="text-muted-foreground truncate">
                      {a.contact_email || a.contact_phone || '—'}
                    </div>
                  </div>
                ))}
                <div className="grid grid-cols-4 gap-2 px-4 py-2 border-t bg-muted font-medium text-sm">
                  <div className="col-span-2">Total</div>
                  <div className="text-right">{formatNaira(totalOutstanding)}</div>
                  <div>{accounts.length} account(s)</div>
                </div>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}

/* ------------------------------------------------------------------ */
/*  Main Page                                                         */
/* ------------------------------------------------------------------ */

export default function ReportsPage() {
  const { organizationId, name, userId } = useAuth()

  return (
    <div className="space-y-6">
      <style jsx global>{`
        @media print {
          body * { visibility: hidden; }
          .print-section, .print-section * { visibility: visible; }
          .print-section { position: absolute; left: 0; top: 0; width: 100%; }
        }
      `}</style>

      <div>
        <h1 className="text-3xl font-bold tracking-tight">Reports</h1>
        <p className="text-muted-foreground">
          View and print operational reports powered by live data
        </p>
      </div>

      <Tabs defaultValue="revenue" className="w-full">
        <TabsList className="flex flex-wrap h-auto gap-1">
          <TabsTrigger value="revenue" className="gap-1.5">
            <FileBarChart className="h-4 w-4" />
            Daily revenue
          </TabsTrigger>
          <TabsTrigger value="sales-collection" className="gap-1.5">
            <Wallet className="h-4 w-4" />
            Sales collection
          </TabsTrigger>
          <TabsTrigger value="refunds" className="gap-1.5">
            <Undo2 className="h-4 w-4" />
            Refunds
          </TabsTrigger>
          <TabsTrigger value="accountant-charges" className="gap-1.5">
            <PieChart className="h-4 w-4" />
            Charge summary
          </TabsTrigger>
          <TabsTrigger value="occupancy" className="gap-1.5">
            <BedDouble className="h-4 w-4" />
            Occupancy
          </TabsTrigger>
          <TabsTrigger value="guests" className="gap-1.5">
            <Users className="h-4 w-4" />
            Guests
          </TabsTrigger>
          <TabsTrigger value="ledger" className="gap-1.5">
            <Building2 className="h-4 w-4" />
            City Ledger
          </TabsTrigger>
          <TabsTrigger value="guest-daily" className="gap-1.5">
            <ReceiptText className="h-4 w-4" />
            Guest daily summary
          </TabsTrigger>
          <TabsTrigger value="daily-expenditure" className="gap-1.5">
            <TrendingDown className="h-4 w-4" />
            Daily expenditure
          </TabsTrigger>
          <TabsTrigger value="monthly-pl" className="gap-1.5">
            <Scale className="h-4 w-4" />
            Monthly P&amp;L
          </TabsTrigger>
        </TabsList>

        <TabsContent value="revenue">
          <Card>
            <CardHeader>
              <CardTitle>Daily revenue (earned)</CardTitle>
              <CardDescription>
                Room-rate accrual for each night guests are in-house (even if prepaid earlier) plus folio charges posted
                that day. VAT 7.5% on top of the daily subtotal. Use date range and department filter.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {userId ? (
                <DailyRevenueAccrualPanel userId={userId} organizationId={organizationId} />
              ) : (
                <p className="text-sm text-muted-foreground">Sign in to load reports.</p>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="sales-collection">
          <Card>
            <CardHeader>
              <CardTitle>Sales collection (cash in)</CardTitle>
              <CardDescription>
                Payments and transaction receipts in the period minus refunds. Contrast with Daily revenue: a ₦200,000
                prepayment counts here in full; earned room revenue counts in Daily revenue at ₦100,000/night.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {userId ? <SalesCollectionPanel userId={userId} /> : <p className="text-sm text-muted-foreground">Sign in to load.</p>}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="refunds">
          <Card>
            <CardHeader>
              <CardTitle>Refunds</CardTitle>
              <CardDescription>
                Refunds reduce guest balance and net sales collection. They are excluded from earned revenue.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {userId ? (
                <RefundsPanel userId={userId} organizationId={organizationId} />
              ) : (
                <p className="text-sm text-muted-foreground">Sign in to load.</p>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="accountant-charges">
          <Card>
            <CardHeader>
              <CardTitle>Charge &amp; accommodation summary</CardTitle>
              <CardDescription>
                Totals by department (restaurant, bar, laundry, halls, gym, etc.) plus room-night accrual. Tag lines with
                optional <code className="text-xs">revenue_category</code> on folio charges (migration 040) or keywords
                in descriptions.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {userId ? (
                <AccountantChargeSummaryPanel userId={userId} />
              ) : (
                <p className="text-sm text-muted-foreground">Sign in to load.</p>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="occupancy">
          <Card>
            <CardHeader>
              <CardTitle>Occupancy</CardTitle>
              <CardDescription>
                Day-by-day occupancy with out-of-order (maintenance) rooms excluded from the denominator.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {userId ? (
                <OccupancyRangePanel userId={userId} organizationId={organizationId} />
              ) : (
                <p className="text-sm text-muted-foreground">Sign in to load.</p>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="guests">
          <Card>
            <CardHeader>
              <CardTitle>Guest Report</CardTitle>
              <CardDescription>
                All guests with outstanding balance information
              </CardDescription>
            </CardHeader>
            <CardContent>
              <GuestReport organizationId={organizationId} />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="ledger">
          <Card>
            <CardHeader>
              <CardTitle>City Ledger Report</CardTitle>
              <CardDescription>
                Corporate and organization account balances
              </CardDescription>
            </CardHeader>
            <CardContent>
              <CityLedgerReport organizationId={organizationId} />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="daily-expenditure">
          <Card>
            <CardHeader>
              <CardTitle>Daily expenditure</CardTitle>
              <CardDescription>
                Operating expenses by day and category (matches your accountant&apos;s spreadsheet). Record
                data under Expenses → Daily grid.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {userId ? (
                <DailyExpenditurePanel userId={userId} />
              ) : (
                <p className="text-sm text-muted-foreground">Sign in to load.</p>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="monthly-pl">
          <Card>
            <CardHeader>
              <CardTitle>Monthly profit &amp; loss</CardTitle>
              <CardDescription>
                Earned revenue vs operating expenses for the selected month, margin %, cash collection
                comparison, category breakdown, and budget alerts.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {userId ? <MonthlyPlPanel userId={userId} /> : <p className="text-sm text-muted-foreground">Sign in.</p>}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="guest-daily">
          <Card>
            <CardHeader>
              <CardTitle>Guest revenue summary (print)</CardTitle>
              <CardDescription>
                Classic daily revenue layout for one guest and one date: room revenue, added charges (restaurant/laundry
                split comes later), VAT from 7.5% inclusive split, and totals for printing.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <GuestDailyRevenueSummary organizationId={organizationId} printedByName={name} />
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}
