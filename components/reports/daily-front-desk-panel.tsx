'use client'

import { useCallback, useEffect, useState } from 'react'
import { format } from 'date-fns'
import { useAuth } from '@/lib/auth-context'
import { formatNaira } from '@/lib/utils/currency'
import {
  calendarDateMinusOneDay,
  hotelCalendarTodayYmd,
  resolveHotelTimeZone,
} from '@/lib/hotel-date'
import {
  SALES_COLLECTION_LABELS,
  type DailyFrontDeskPack,
  type SalesCollectionCategory,
} from '@/lib/reports/daily-front-desk-pack'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Calendar } from '@/components/ui/calendar'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { PageLoadingState } from '@/components/loading-screen'
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
  const { userId } = useAuth()
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
      const qs = new URLSearchParams({ caller_id: userId, date: day })
      const res = await fetch(`/api/reports/daily-front-desk?${qs}`, {
        credentials: 'include',
      })
      const json = await res.json()
      if (!res.ok) {
        toast.error(json.error || 'Failed to load daily book')
        setPack(null)
        return
      }
      setPack(json.pack)
    } catch {
      toast.error('Network error loading daily book')
      setPack(null)
    } finally {
      setLoading(false)
    }
  }, [userId, day])

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
            In-house guest list (room revenue) and sales collection for owners — same structure as the
            front-desk manual book.
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

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-1.5">
              <Users className="h-4 w-4" /> Room revenue generated
            </CardDescription>
            <CardTitle className="text-3xl">
              {formatNaira(pack?.roomRevenueGenerated || 0)}
            </CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            {pack?.guestCount || 0} guest{pack?.guestCount === 1 ? '' : 's'} in-house that night
            (sum of room rates)
          </CardContent>
        </Card>
        <Card className="bg-primary text-primary-foreground">
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-1.5 text-primary-foreground/80">
              <Wallet className="h-4 w-4" /> Sales collection total
            </CardDescription>
            <CardTitle className="text-3xl">{formatNaira(sc?.total || 0)}</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-primary-foreground/80">
            Cash / POS / transfer inflows that day (city ledger excluded)
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
              ['Additional (extend)', sc?.additionalPayment],
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
        <CardContent className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-12">S/N</TableHead>
                <TableHead>Guest</TableHead>
                <TableHead>Room</TableHead>
                <TableHead>Type</TableHead>
                <TableHead className="text-right">Rate</TableHead>
                <TableHead>Stay</TableHead>
                <TableHead>Payment</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(pack?.guests || []).length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
                    No in-house guests for this date
                  </TableCell>
                </TableRow>
              ) : (
                pack!.guests.map((g, i) => (
                  <TableRow key={g.booking_id}>
                    <TableCell>{i + 1}</TableCell>
                    <TableCell className="font-medium">{g.guest_name}</TableCell>
                    <TableCell>{g.room_number}</TableCell>
                    <TableCell>{g.room_type}</TableCell>
                    <TableCell className="text-right">{formatNaira(g.rate_per_night)}</TableCell>
                    <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                      {g.check_in} → {g.check_out}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className="capitalize">
                        {g.payment_status}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Collection lines</CardTitle>
          <CardDescription>
            Individual receipts for the day with category labels. City ledger lines are listed but not
            summed into Sales collection.
          </CardDescription>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Guest</TableHead>
                <TableHead className="text-right">Amount</TableHead>
                <TableHead>Method</TableHead>
                <TableHead>Category</TableHead>
                <TableHead>Ref</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(pack?.lines || []).length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                    No collections recorded for this date
                  </TableCell>
                </TableRow>
              ) : (
                pack!.lines.map((line) => (
                  <TableRow
                    key={line.id}
                    className={!line.counts_as_cash_collection ? 'opacity-70' : undefined}
                  >
                    <TableCell>
                      <div className="font-medium">{line.guest_name}</div>
                      {line.room ? (
                        <div className="text-xs text-muted-foreground">{line.room}</div>
                      ) : null}
                    </TableCell>
                    <TableCell className="text-right font-medium">
                      {formatNaira(line.amount)}
                    </TableCell>
                    <TableCell className="capitalize">
                      {line.payment_method.replace(/_/g, ' ')}
                    </TableCell>
                    <TableCell>
                      <Badge variant={categoryBadgeVariant(line.category)}>
                        {SALES_COLLECTION_LABELS[line.category]}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-xs font-mono">{line.reference}</TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  )
}
