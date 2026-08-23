'use client'

import { useCallback, useEffect, useState } from 'react'
import { format } from 'date-fns'
import { useAuth } from '@/lib/auth-context'
import { createClient } from '@/lib/supabase/client'
import { formatNaira } from '@/lib/utils/currency'
import {
  calendarDateMinusOneDay,
  hotelCalendarTodayYmd,
  resolveHotelTimeZone,
} from '@/lib/hotel-date'
import { fetchHotelBusinessNightUtcBounds } from '@/lib/payments/business-night-bounds'
import {
  buildDailyFrontDeskPack,
  SALES_COLLECTION_LABELS,
  type DailyFrontDeskPack,
  type SalesCollectionCategory,
} from '@/lib/reports/daily-front-desk-pack'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Calendar } from '@/components/ui/calendar'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { PageLoadingState } from '@/components/loading-screen'
import { EnhancedDataTable } from '@/components/shared/enhanced-data-table'
import { MobileTableSubdetail } from '@/lib/utils/table-mobile'
import { toast } from 'sonner'
import { CalendarIcon, RefreshCw, Users, Wallet } from 'lucide-react'
import { calendarPickerYmd } from '@/lib/utils/booking-in-house-dates'

function categoryBadgeVariant(
  cat: SalesCollectionCategory,
): 'default' | 'secondary' | 'outline' | 'destructive' {
  if (cat === 'city_ledger') return 'outline'
  if (cat === 'extra_charges' || cat === 'debt_recovery') return 'secondary'
  return 'default'
}

export function DailyFrontDeskPanel() {
  const { userId, organizationId, role } = useAuth()
  const [day, setDay] = useState(() =>
    calendarDateMinusOneDay(hotelCalendarTodayYmd(new Date(), resolveHotelTimeZone())),
  )
  const [calOpen, setCalOpen] = useState(false)
  const [loading, setLoading] = useState(true)
  const [pack, setPack] = useState<DailyFrontDeskPack | null>(null)

  const load = useCallback(async () => {
    if (!userId) return
    setLoading(true)
    try {
      const supabase = createClient()
      if (!supabase) {
        toast.error('Could not connect')
        setPack(null)
        return
      }

      const orgId = (organizationId || '').trim()
      if (!orgId && role !== 'superadmin') {
        toast.error('Your profile has no organization')
        setPack(null)
        return
      }

      const tz = resolveHotelTimeZone()
      const bounds = orgId
        ? await fetchHotelBusinessNightUtcBounds({
            supabase,
            organizationId: orgId,
            ymd: day,
            timeZone: tz,
          })
        : await (async () => {
            // Superadmin without org: calendar day only
            const { hotelCalendarDayUtcBounds } = await import('@/lib/hotel-date')
            const b = hotelCalendarDayUtcBounds(day, tz)
            return { ...b, empty: false, mode: 'calendar_fallback' as const, orgBusinessDate: null }
          })()

      let bookQ = supabase
        .from('bookings')
        .select(
          'id, check_in, check_out, status, rate_per_night, folio_id, payment_status, guest_id, guests:guest_id(name), rooms:room_id(room_number, room_type)',
        )
        .in('status', ['confirmed', 'checked_in', 'reserved', 'checked_out'])
        .lte('check_in', day)
        .gt('check_out', day)
        .limit(500)

      let txQ = bounds.empty
        ? null
        : supabase
            .from('transactions')
            .select('*')
            .gte('created_at', bounds.startIso)
            .lte('created_at', bounds.endInclusiveIso)
            .limit(5000)

      let payQ = bounds.empty
        ? null
        : supabase
            .from('payments')
            .select('*')
            .gte('payment_date', bounds.startIso)
            .lte('payment_date', bounds.endInclusiveIso)
            .limit(5000)

      if (role !== 'superadmin' && orgId) {
        bookQ = bookQ.eq('organization_id', orgId)
        if (txQ) txQ = txQ.eq('organization_id', orgId)
        if (payQ) payQ = payQ.eq('organization_id', orgId)
      }

      const [bookRes, txRes, payRes] = await Promise.all([
        bookQ,
        txQ || Promise.resolve({ data: [] as unknown[], error: null }),
        payQ || Promise.resolve({ data: [] as unknown[], error: null }),
      ])

      if (txRes.error) {
        console.error('[daily-book] transactions', txRes.error.message)
        toast.error(txRes.error.message || 'Could not load transactions for daily book')
      }
      if (payRes.error) {
        console.error('[daily-book] payments', payRes.error.message)
      }
      if (bookRes.error) {
        console.error('[daily-book] bookings', bookRes.error.message)
      }

      const payments = payRes.data || []
      const guestIds = Array.from(
        new Set(payments.map((p: { guest_id?: string | null }) => p.guest_id).filter(Boolean)),
      ) as string[]
      const guestNameById: Record<string, string> = {}
      if (guestIds.length > 0) {
        const { data: guests } = await supabase.from('guests').select('id, name').in('id', guestIds)
        for (const g of guests || []) {
          guestNameById[(g as { id: string }).id] = (g as { name: string }).name
        }
      }

      const next = buildDailyFrontDeskPack({
        dateYmd: day,
        bookings: (bookRes.data || []) as any,
        transactions: (txRes.data || []) as any,
        payments: payments as any,
        guestNameById,
      })
      setPack(next)

      // If still empty, try API (service role) as backup
      if (next.salesCollection.total === 0 && next.lines.length === 0) {
        const qs = new URLSearchParams({ caller_id: userId, date: day })
        const res = await fetch(`/api/reports/daily-front-desk?${qs}`, {
          credentials: 'include',
        })
        const json = await res.json()
        if (res.ok && json.pack && (json.pack.lines?.length || json.pack.salesCollection?.total)) {
          setPack(json.pack)
        }
      }
    } catch (e) {
      console.error(e)
      toast.error('Network error loading daily book')
      setPack(null)
    } finally {
      setLoading(false)
    }
  }, [userId, organizationId, role, day])

  useEffect(() => {
    void load()
  }, [load])

  if (loading && !pack) return <PageLoadingState label="Loading daily book…" />

  const sc = pack?.salesCollection

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold tracking-tight">Daily book</h2>
          <p className="text-sm text-muted-foreground">
            In-house guest list (room revenue) and sales collection for owners. Sales include money
            taken after midnight until Night Audit is run for that business night.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Popover open={calOpen} onOpenChange={setCalOpen}>
            <PopoverTrigger asChild>
              <Button variant="outline" className="gap-2">
                <CalendarIcon className="h-4 w-4" />
                {format(new Date(`${day}T12:00:00`), 'dd MMM yyyy')}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="end">
              <Calendar
                mode="single"
                selected={new Date(`${day}T12:00:00`)}
                onSelect={(d) => {
                  if (!d) return
                  setDay(calendarPickerYmd(d))
                  setCalOpen(false)
                }}
              />
            </PopoverContent>
          </Popover>
          <Button variant="outline" size="icon" onClick={() => void load()} disabled={loading}>
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-1.5">
              <Users className="h-4 w-4" /> In-house guests
            </CardDescription>
            <CardTitle className="text-3xl tabular-nums">{pack?.guestCount || 0}</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            Guest{pack?.guestCount === 1 ? '' : 's'} occupying rooms that night
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-1.5">
              <Wallet className="h-4 w-4" /> Room revenue generated
            </CardDescription>
            <CardTitle className="text-3xl">
              {formatNaira(pack?.roomRevenueGenerated || 0)}
            </CardTitle>
          </CardHeader>
        </Card>
        <Card className="bg-primary text-primary-foreground">
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-1.5 text-primary-foreground/80">
              <Wallet className="h-4 w-4" /> Cash collected
            </CardDescription>
            <CardTitle className="text-3xl">{formatNaira(sc?.total || 0)}</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-primary-foreground/80">
            POS / cash / transfer (city ledger excluded)
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Sales collection breakdown</CardTitle>
          <CardDescription>
            Matches the manual book categories: POS, cash, advance (reservations), additional (extend
            stay), extra charges, debt recovery.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
            {[
              ['POS', sc?.pos],
              ['Cash', sc?.cash],
              ['Bank transfer', sc?.transfer],
              ['Advance payment', sc?.advancePayment],
              ['Additional (Extend stay etc)', sc?.additionalPayment],
              ['Extra charges', sc?.extraCharges],
              ['Debt recovery', sc?.debtRecovery],
              ['Other', sc?.other],
              ['City ledger (not in total)', sc?.cityLedgerPosted],
            ].map(([label, value]) => (
              <div key={String(label)} className="rounded-md border p-3">
                <p className="text-xs text-muted-foreground">{label}</p>
                <p className="text-lg font-semibold mt-0.5">{formatNaira(Number(value) || 0)}</p>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">In-house guests</CardTitle>
          <CardDescription>
            Every occupied room for this hotel night (arrivals and stayovers). Same list as Bookings →
            Stay date.
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0 sm:p-6 pt-0">
          <EnhancedDataTable
            compactTable
            showRowNumbers
            data={pack?.guests || []}
            searchKeys={['guest_name', 'room_number', 'folio_id']}
            searchPlaceholder="Search guests, room, folio…"
            emptyState={{ title: 'No in-house guests for this date' }}
            rowKey={(g) => g.booking_id}
            columns={[
              {
                key: 'guest_name',
                label: 'Guest',
                render: (g) => (
                  <div>
                    <div className="font-medium max-md:text-[13px]">{g.guest_name}</div>
                    <div className="text-[10px] text-muted-foreground max-md:hidden">
                      {g.room_number} · {g.room_type}
                    </div>
                    <MobileTableSubdetail>
                      <div>
                        Rm {g.room_number} · {g.room_type}
                      </div>
                      <div>
                        {g.check_in} → {g.check_out}
                      </div>
                      <div className="capitalize">{g.payment_status}</div>
                    </MobileTableSubdetail>
                  </div>
                ),
              },
              {
                key: 'rate_per_night',
                label: 'Rate',
                render: (g) => (
                  <span className="font-semibold text-xs md:text-sm whitespace-nowrap">
                    {formatNaira(g.rate_per_night)}
                  </span>
                ),
              },
              {
                key: 'room_number',
                label: 'Room',
                responsive: 'md+',
                render: (g) => g.room_number,
              },
              {
                key: 'room_type',
                label: 'Type',
                responsive: 'md+',
                render: (g) => g.room_type,
              },
              {
                key: 'check_in',
                label: 'Stay',
                responsive: 'md+',
                render: (g) => (
                  <span className="text-xs text-muted-foreground whitespace-nowrap">
                    {g.check_in} → {g.check_out}
                  </span>
                ),
              },
              {
                key: 'payment_status',
                label: 'Payment',
                responsive: 'md+',
                render: (g) => (
                  <Badge variant="outline" className="capitalize">
                    {g.payment_status}
                  </Badge>
                ),
              },
            ]}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Collection lines</CardTitle>
          <CardDescription>
            Individual receipts for the day with category labels and bank/POS account. City ledger
            lines are listed but not summed into Sales collection.
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0 sm:p-6 pt-0">
          <EnhancedDataTable
            compactTable
            showRowNumbers
            data={pack?.lines || []}
            searchKeys={['guest_name', 'reference', 'payment_account_label', 'description']}
            searchPlaceholder="Search collections…"
            emptyState={{ title: 'No collections recorded for this date' }}
            rowKey={(line) => line.id}
            columns={[
              {
                key: 'guest_name',
                label: 'Guest',
                render: (line) => (
                  <div className={!line.counts_as_cash_collection ? 'opacity-70' : undefined}>
                    <div className="font-medium max-md:text-[13px]">{line.guest_name}</div>
                    {line.room ? (
                      <div className="text-[10px] text-muted-foreground max-md:hidden">{line.room}</div>
                    ) : null}
                    <MobileTableSubdetail>
                      {line.room ? <div>{line.room}</div> : null}
                      <div className="capitalize">
                        {line.payment_method.replace(/_/g, ' ')} ·{' '}
                        {SALES_COLLECTION_LABELS[line.category]}
                      </div>
                      {line.payment_account_label ? <div>{line.payment_account_label}</div> : null}
                    </MobileTableSubdetail>
                  </div>
                ),
              },
              {
                key: 'amount',
                label: 'Amount',
                render: (line) => (
                  <span className="font-semibold text-xs md:text-sm whitespace-nowrap">
                    {formatNaira(line.amount)}
                  </span>
                ),
              },
              {
                key: 'payment_method',
                label: 'Method',
                responsive: 'md+',
                render: (line) => (
                  <div className="space-y-1">
                    <span className="capitalize text-sm">
                      {line.payment_method.replace(/_/g, ' ')}
                    </span>
                    {line.payment_account_label ? (
                      <div
                        className="text-[10px] text-muted-foreground truncate max-w-[140px]"
                        title={line.payment_account_label}
                      >
                        {line.payment_account_label}
                      </div>
                    ) : null}
                  </div>
                ),
              },
              {
                key: 'category',
                label: 'Category',
                responsive: 'md+',
                render: (line) => (
                  <Badge variant={categoryBadgeVariant(line.category)}>
                    {SALES_COLLECTION_LABELS[line.category]}
                  </Badge>
                ),
              },
              {
                key: 'payment_account_label',
                label: 'Account',
                responsive: 'lg+',
                render: (line) => (
                  <span
                    className="text-xs text-muted-foreground max-w-[160px] inline-block truncate"
                    title={line.payment_account_label || ''}
                  >
                    {line.payment_account_label || '—'}
                  </span>
                ),
              },
              {
                key: 'reference',
                label: 'Ref',
                responsive: 'lg+',
                render: (line) => (
                  <span className="font-mono text-[10px] text-muted-foreground">{line.reference}</span>
                ),
              },
            ]}
          />
        </CardContent>
      </Card>
    </div>
  )
}
