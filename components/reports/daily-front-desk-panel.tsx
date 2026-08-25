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
  type DailyCollectionLine,
  type DailyFrontDeskPack,
  type DailyGuestRow,
  type SalesCollectionCategory,
} from '@/lib/reports/daily-front-desk-pack'
import { formatBookingPaymentMethodLabel } from '@/lib/booking/parse-booking-notes'
import {
  DailyBookRowDetailModal,
  type DailyBookDetailTarget,
} from '@/components/reports/daily-book-row-detail-modal'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Calendar } from '@/components/ui/calendar'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { PageLoadingState } from '@/components/loading-screen'
import { EnhancedDataTable } from '@/components/shared/enhanced-data-table'
import { TABLE_CELL_TRUNCATE, TABLE_META_TEXT, TABLE_STACKED_CELL } from '@/lib/utils/table-row-inline'
import { toast } from 'sonner'
import { CalendarIcon, RefreshCw, Users, Wallet, CircleDollarSign, HandCoins } from 'lucide-react'
import { calendarPickerYmd } from '@/lib/utils/booking-in-house-dates'
import { cn } from '@/lib/utils'

function categoryBadgeVariant(
  cat: SalesCollectionCategory,
): 'default' | 'secondary' | 'outline' | 'destructive' {
  if (cat === 'city_ledger') return 'outline'
  if (cat === 'extra_charges' || cat === 'debt_recovery') return 'secondary'
  return 'default'
}

function paymentStatusTone(status: string): string {
  const ps = status.toLowerCase()
  if (ps === 'paid') return 'bg-emerald-50 text-emerald-700 border-emerald-200'
  if (ps === 'partial') return 'bg-amber-50 text-amber-800 border-amber-200'
  if (ps === 'pending' || ps === 'unpaid') return 'bg-orange-50 text-orange-800 border-orange-200'
  return ''
}

function PaymentStackedCell({ guest }: { guest: DailyGuestRow }) {
  const ps = String(guest.payment_status || '').toLowerCase()
  const isPaid = ps === 'paid'
  const amountLabel = isPaid
    ? formatNaira(guest.total_amount || guest.rate_per_night)
    : guest.balance > 0
      ? `Bal ${formatNaira(guest.balance)}`
      : formatNaira(guest.rate_per_night)

  return (
    <div className={TABLE_STACKED_CELL}>
      <Badge
        variant="outline"
        className={cn('capitalize w-fit text-[11px]', paymentStatusTone(ps))}
      >
        {guest.payment_status || '—'}
      </Badge>
      <span className="text-xs font-medium tabular-nums">{amountLabel}</span>
    </div>
  )
}

function MethodStackedCell({ guest }: { guest: DailyGuestRow }) {
  const methodLabel = formatBookingPaymentMethodLabel(guest.payment_method)
  const detail =
    guest.payment_method === 'city_ledger'
      ? guest.ledger_account_name || guest.guest_name
      : guest.payment_account_label || guest.ledger_account_name || ''

  return (
    <div className={TABLE_STACKED_CELL}>
      <Badge variant="outline" className="w-fit text-[11px] font-normal text-muted-foreground">
        {methodLabel}
      </Badge>
      {detail ? (
        <span className={`${TABLE_META_TEXT} ${TABLE_CELL_TRUNCATE}`}>{detail}</span>
      ) : null}
    </div>
  )
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
  const [detail, setDetail] = useState<DailyBookDetailTarget | null>(null)

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
            const { hotelCalendarDayUtcBounds } = await import('@/lib/hotel-date')
            const b = hotelCalendarDayUtcBounds(day, tz)
            return { ...b, empty: false, mode: 'calendar_fallback' as const, orgBusinessDate: null }
          })()

      const BOOKING_SELECT_FULL =
        'id, check_in, check_out, status, rate_per_night, total_amount, deposit, balance, folio_id, payment_status, payment_method, ledger_account_name, notes, guest_id, guests:guest_id(name), rooms:room_id(room_number, room_type)'
      const BOOKING_SELECT_BASIC =
        'id, check_in, check_out, status, rate_per_night, folio_id, payment_status, guest_id, guests:guest_id(name), rooms:room_id(room_number, room_type)'

      const buildBookingsQuery = (select: string) => {
        let q = supabase
          .from('bookings')
          .select(select)
          .in('status', ['confirmed', 'checked_in', 'reserved', 'checked_out'])
          .lte('check_in', day)
          .gt('check_out', day)
          .limit(500)
        if (role !== 'superadmin' && orgId) {
          q = q.eq('organization_id', orgId)
        }
        return q
      }

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
        if (txQ) txQ = txQ.eq('organization_id', orgId)
        if (payQ) payQ = payQ.eq('organization_id', orgId)
      }

      const [bookResFull, txRes, payRes] = await Promise.all([
        buildBookingsQuery(BOOKING_SELECT_FULL),
        txQ || Promise.resolve({ data: [] as unknown[], error: null }),
        payQ || Promise.resolve({ data: [] as unknown[], error: null }),
      ])

      let bookRes = bookResFull
      if (bookRes.error || !bookRes.data) {
        console.error('[daily-book] bookings full select', bookRes.error?.message)
        bookRes = await buildBookingsQuery(BOOKING_SELECT_BASIC)
      }

      if (txRes.error) {
        console.error('[daily-book] transactions', txRes.error.message)
        toast.error(txRes.error.message || 'Could not load transactions for daily book')
      }
      if (payRes.error) {
        console.error('[daily-book] payments', payRes.error.message)
      }
      if (bookRes.error) {
        console.error('[daily-book] bookings', bookRes.error.message)
        toast.error(bookRes.error.message || 'Could not load in-house guests for daily book')
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

      // Recover guests/revenue via service-role API when client booking query failed or returned none
      // while collections still loaded (previous fallback only ran when net sales was also empty).
      const needGuestBackup =
        next.guestCount === 0 &&
        (Boolean(bookRes.error) || !(bookRes.data && bookRes.data.length))
      const needSalesBackup = next.salesCollection.total === 0 && next.lines.length === 0
      if (needGuestBackup || needSalesBackup) {
        const qs = new URLSearchParams({ caller_id: userId, date: day })
        const res = await fetch(`/api/reports/daily-front-desk?${qs}`, {
          credentials: 'include',
        })
        const json = await res.json()
        if (
          res.ok &&
          json.pack &&
          (json.pack.guestCount > 0 ||
            json.pack.lines?.length ||
            json.pack.salesCollection?.total)
        ) {
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

  const netSalesLines = useMemo(
    () => (pack?.lines || []).filter((l) => l.counts_as_cash_collection),
    [pack?.lines],
  )

  if (loading && !pack) return <PageLoadingState label="Loading daily book…" />

  const sc = pack?.salesCollection

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold tracking-tight">Daily book</h2>
          <p className="text-sm text-muted-foreground">
            Revenue is room rates for the hotel night. Net sales is money collected that business
            night (until Night Audit). Debt is walk-in guest balances still owing.
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

      <div id="daily-book-summary" className="scroll-mt-24 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-1.5">
              <Users className="h-4 w-4" /> In-house
            </CardDescription>
            <CardTitle className="text-3xl tabular-nums">{pack?.guestCount || 0}</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            Guests occupying rooms that night
          </CardContent>
        </Card>
        <Card id="daily-book-revenue" className="scroll-mt-24">
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-1.5">
              <Wallet className="h-4 w-4" /> Revenue
            </CardDescription>
            <CardTitle className="text-3xl">
              {formatNaira(pack?.roomRevenueGenerated || 0)}
            </CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            Room rates accrued for this night
          </CardContent>
        </Card>
        <Card className="bg-primary text-primary-foreground">
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-1.5 text-primary-foreground/80">
              <CircleDollarSign className="h-4 w-4" /> Net sales
            </CardDescription>
            <CardTitle className="text-3xl">{formatNaira(sc?.total || 0)}</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-primary-foreground/80">
            POS / cash / transfer collected
          </CardContent>
        </Card>
        <Card className="border-amber-200/80">
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-1.5">
              <HandCoins className="h-4 w-4" /> Debt (walk-in)
            </CardDescription>
            <CardTitle className="text-3xl text-amber-800">
              {formatNaira(pack?.walkInDebt || 0)}
            </CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            Outstanding balances (excludes city ledger)
          </CardContent>
        </Card>
      </div>

      <Card id="daily-book-revenue-table" className="scroll-mt-24">
        <CardHeader>
          <CardTitle className="text-base">Revenue</CardTitle>
          <CardDescription>
            In-house room rates for this hotel night — sum matches the Revenue card. Click a row for
            details.
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0 sm:p-6 pt-0">
          <EnhancedDataTable
            compactTable
            showRowNumbers
            itemsPerPage={10}
            data={pack?.guests || []}
            searchKeys={['guest_name', 'room_number', 'folio_id']}
            searchPlaceholder="Search guests, room, folio…"
            emptyState={{ title: 'No in-house guests for this date' }}
            rowKey={(g) => g.booking_id}
            onRowClick={(g) => setDetail({ kind: 'guest', guest: g })}
            columns={[
              {
                key: 'guest_name',
                label: 'Guest',
                render: (g) => <span className="font-medium">{g.guest_name}</span>,
              },
              {
                key: 'room_number',
                label: 'Room',
                render: (g) => (
                  <span>
                    {g.room_number}
                    <span className="text-muted-foreground text-xs ml-1 hidden sm:inline">
                      · {g.room_type}
                    </span>
                  </span>
                ),
              },
              {
                key: 'rate_per_night',
                label: 'Rate / night',
                render: (g) => (
                  <span className="font-semibold tabular-nums">{formatNaira(g.rate_per_night)}</span>
                ),
              },
              {
                key: 'stay',
                label: 'Stay',
                responsive: 'md+',
                render: (g) => (
                  <span className="text-xs text-muted-foreground">
                    {g.check_in} → {g.check_out}
                  </span>
                ),
              },
            ]}
          />
        </CardContent>
      </Card>

      <Card id="daily-book-collections" className="scroll-mt-24">
        <CardHeader>
          <CardTitle className="text-base">Net sales</CardTitle>
          <CardDescription>
            Money collected this business night (advances, guest payments, debt recovery). Click a
            row for details.
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0 sm:p-6 pt-0">
          <EnhancedDataTable
            compactTable
            showRowNumbers
            itemsPerPage={10}
            data={netSalesLines}
            searchKeys={['guest_name', 'reference', 'payment_account_label', 'description']}
            searchPlaceholder="Search guest, reference, account…"
            emptyState={{ title: 'No collections recorded for this date' }}
            rowKey={(line) => line.id}
            onRowClick={(line) => setDetail({ kind: 'line', line })}
            columns={collectionLineColumns}
          />
        </CardContent>
      </Card>

      <Card id="daily-book-guests" className="scroll-mt-24">
        <CardHeader>
          <CardTitle className="text-base">In-house guests</CardTitle>
          <CardDescription>
            Occupying guests with payment status and method. Walk-in balances feed the Debt card.
            Click a row for folio details.
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0 sm:p-6 pt-0">
          <EnhancedDataTable
            compactTable
            showRowNumbers
            itemsPerPage={10}
            data={pack?.guests || []}
            searchKeys={['guest_name', 'room_number', 'folio_id', 'payment_method']}
            searchPlaceholder="Search guests, room, folio…"
            emptyState={{ title: 'No in-house guests for this date' }}
            rowKey={(g) => `ih-${g.booking_id}`}
            onRowClick={(g) => setDetail({ kind: 'guest', guest: g })}
            columns={[
              {
                key: 'guest_name',
                label: 'Guest',
                render: (g) => (
                  <div className={TABLE_STACKED_CELL}>
                    <span className="font-medium">{g.guest_name}</span>
                    <span className={TABLE_META_TEXT}>
                      Rm {g.room_number} · {g.room_type}
                    </span>
                  </div>
                ),
              },
              {
                key: 'payment',
                label: 'Payment',
                render: (g) => <PaymentStackedCell guest={g} />,
              },
              {
                key: 'method',
                label: 'Method',
                render: (g) => <MethodStackedCell guest={g} />,
              },
              {
                key: 'rate_per_night',
                label: 'Rate',
                responsive: 'md+',
                render: (g) => formatNaira(g.rate_per_night),
              },
            ]}
          />
        </CardContent>
      </Card>

      <DailyBookRowDetailModal
        open={Boolean(detail)}
        onOpenChange={(o) => {
          if (!o) setDetail(null)
        }}
        target={detail}
        organizationId={organizationId}
      />
    </div>
  )
}

const collectionLineColumns = [
  {
    key: 'guest_name',
    label: 'Guest',
    render: (line: DailyCollectionLine) => (
      <span className="font-medium">{line.guest_name}</span>
    ),
  },
  {
    key: 'amount',
    label: 'Amount',
    render: (line: DailyCollectionLine) => (
      <span className="font-semibold">{formatNaira(line.amount)}</span>
    ),
  },
  {
    key: 'payment_method',
    label: 'Method',
    render: (line: DailyCollectionLine) => (
      <div className={TABLE_STACKED_CELL}>
        <Badge variant="outline" className="w-fit text-[11px] font-normal capitalize">
          {formatBookingPaymentMethodLabel(line.payment_method)}
        </Badge>
        {line.payment_account_label ? (
          <span className={`${TABLE_META_TEXT} ${TABLE_CELL_TRUNCATE}`}>
            {line.payment_account_label}
          </span>
        ) : null}
      </div>
    ),
  },
  {
    key: 'category',
    label: 'Category',
    responsive: 'md+' as const,
    render: (line: DailyCollectionLine) => (
      <Badge variant={categoryBadgeVariant(line.category)}>
        {SALES_COLLECTION_LABELS[line.category]}
      </Badge>
    ),
  },
]
