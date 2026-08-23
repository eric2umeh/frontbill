'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'next/navigation'
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
import { TABLE_INLINE_ROW, TABLE_META_TEXT, TABLE_CELL_TRUNCATE, TABLE_STACKED_CELL } from '@/lib/utils/table-row-inline'
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
  const searchParams = useSearchParams()
  const { userId, organizationId, role } = useAuth()
  const initialDate =
    searchParams.get('date')?.slice(0, 10) ||
    calendarDateMinusOneDay(hotelCalendarTodayYmd(new Date(), resolveHotelTimeZone()))
  const [day, setDay] = useState(initialDate)
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

  useEffect(() => {
    const fromUrl = searchParams.get('date')?.slice(0, 10)
    if (fromUrl && fromUrl !== day) setDay(fromUrl)
  }, [searchParams, day])

  useEffect(() => {
    const hash = typeof window !== 'undefined' ? window.location.hash : ''
    if (!hash || !pack) return
    const el = document.querySelector(hash)
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }
  }, [pack, day])

  const owingGuests = useMemo(
    () =>
      (pack?.guests || []).filter((g) => {
        const ps = String(g.payment_status || '').toLowerCase()
        return ps === 'pending' || ps === 'partial' || ps === 'unpaid'
      }),
    [pack?.guests],
  )

  const collectionSections = useMemo(() => {
    const lines = pack?.lines || []
    return {
      advance: lines.filter((l) => l.category === 'advance_payment'),
      payments: lines.filter(
        (l) =>
          l.counts_as_cash_collection &&
          ['pos', 'cash', 'transfer', 'additional_payment', 'extra_charges', 'other'].includes(
            l.category,
          ),
      ),
      debt: lines.filter((l) => l.category === 'debt_recovery'),
      cityLedger: lines.filter((l) => l.category === 'city_ledger'),
    }
  }, [pack?.lines])

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

      <div id="daily-book-summary" className="scroll-mt-24 grid grid-cols-1 sm:grid-cols-3 gap-4">
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
        <Card id="daily-book-revenue" className="scroll-mt-24">
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-1.5">
              <Wallet className="h-4 w-4" /> Room revenue
            </CardDescription>
            <CardTitle className="text-3xl">
              {formatNaira(pack?.roomRevenueGenerated || 0)}
            </CardTitle>
          </CardHeader>
        </Card>
        <Card className="bg-primary text-primary-foreground">
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-1.5 text-primary-foreground/80">
              <Wallet className="h-4 w-4" /> Net profit
            </CardDescription>
            <CardTitle className="text-3xl">{formatNaira(sc?.total || 0)}</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-primary-foreground/80">
            POS / cash / transfer (city ledger excluded)
          </CardContent>
        </Card>
      </div>

      <Card id="daily-book-net-breakdown" className="scroll-mt-24">
        <CardHeader>
          <CardTitle className="text-base">Net profit breakdown (POS &amp; methods)</CardTitle>
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

      {owingGuests.length > 0 && (
        <Card className="border-amber-200/80">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Guests owing (in-house)</CardTitle>
            <CardDescription>Outstanding folio balance on this hotel night</CardDescription>
          </CardHeader>
          <CardContent className="p-0 sm:p-6 pt-0">
            <EnhancedDataTable
              compactTable
              showRowNumbers
              itemsPerPage={10}
              data={owingGuests}
              searchKeys={['guest_name', 'room_number', 'folio_id']}
              emptyState={{ title: 'No owing guests' }}
              rowKey={(g) => g.booking_id}
              columns={[
                {
                  key: 'guest_name',
                  label: 'Guest',
                  render: (g) => <span className="font-medium">{g.guest_name}</span>,
                },
                {
                  key: 'room_number',
                  label: 'Room',
                  render: (g) => g.room_number,
                },
                {
                  key: 'rate_per_night',
                  label: 'Rate/night',
                  render: (g) => formatNaira(g.rate_per_night),
                },
                {
                  key: 'payment_status',
                  label: 'Status',
                  render: (g) => (
                    <Badge variant="outline" className="capitalize text-amber-700 border-amber-300">
                      {g.payment_status}
                    </Badge>
                  ),
                },
              ]}
            />
          </CardContent>
        </Card>
      )}

      <Card id="daily-book-collections" className="scroll-mt-24">
        <CardHeader>
          <CardTitle className="text-base">Net profit — receipt lines</CardTitle>
          <CardDescription>
            Future reservation payments, guest payments received, and debt recovery for this business date.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6 p-4 sm:p-6">
          {[
            {
              title: 'Future reservations paid today',
              rows: collectionSections.advance,
            },
            {
              title: 'Payments received today (POS / cash / transfer)',
              rows: collectionSections.payments,
            },
            {
              title: 'Debt recovery',
              rows: collectionSections.debt,
            },
          ].map(({ title, rows }) =>
            rows.length > 0 ? (
              <div key={title} className="space-y-2">
                <p className="text-sm font-semibold">{title}</p>
                <EnhancedDataTable
                  compactTable
                  showRowNumbers
                  itemsPerPage={10}
                  data={rows}
                  searchKeys={['guest_name', 'reference', 'payment_account_label']}
                  emptyState={{ title: 'None' }}
                  rowKey={(line) => line.id}
                  columns={collectionLineColumns}
                />
              </div>
            ) : null,
          )}
          {(pack?.lines || []).length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-6">No collections recorded for this date.</p>
          )}
        </CardContent>
      </Card>

      <Card id="daily-book-guests" className="scroll-mt-24">
        <CardHeader>
          <CardTitle className="text-base">In-house guests (revenue)</CardTitle>
          <CardDescription>
            Every guest occupying a room this hotel night — room rates sum to Rev on Bookings.
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0 sm:p-6 pt-0">
          <EnhancedDataTable
            compactTable
            showRowNumbers
            itemsPerPage={15}
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
                  <div className={`${TABLE_INLINE_ROW} max-w-[12rem]`}>
                    <span className={`font-medium max-md:text-[13px] ${TABLE_CELL_TRUNCATE}`}>{g.guest_name}</span>
                    <span className={`${TABLE_META_TEXT} max-md:hidden shrink-0`}>
                      {g.room_number} · {g.room_type}
                    </span>
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
    </div>
  )
}

const collectionLineColumns = [
  {
    key: 'guest_name',
    label: 'Guest',
    render: (line: DailyFrontDeskPack['lines'][number]) => (
      <span className="font-medium">{line.guest_name}</span>
    ),
  },
  {
    key: 'amount',
    label: 'Amount',
    render: (line: DailyFrontDeskPack['lines'][number]) => (
      <span className="font-semibold">{formatNaira(line.amount)}</span>
    ),
  },
  {
    key: 'payment_method',
    label: 'Method',
    render: (line: DailyFrontDeskPack['lines'][number]) => (
      <div className={TABLE_STACKED_CELL}>
        <span className="capitalize text-[11px]">{line.payment_method.replace(/_/g, ' ')}</span>
        {line.payment_account_label ? (
          <span className={`${TABLE_META_TEXT} ${TABLE_CELL_TRUNCATE}`}>{line.payment_account_label}</span>
        ) : null}
      </div>
    ),
  },
  {
    key: 'category',
    label: 'Category',
    responsive: 'md+' as const,
    render: (line: DailyFrontDeskPack['lines'][number]) => (
      <Badge variant={categoryBadgeVariant(line.category)}>
        {SALES_COLLECTION_LABELS[line.category]}
      </Badge>
    ),
  },
]
