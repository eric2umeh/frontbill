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
} from 'lucide-react'
import { cn } from '@/lib/utils'

/* ------------------------------------------------------------------ */
/*  Date Picker                                                       */
/* ------------------------------------------------------------------ */

function DatePicker({
  date,
  onSelect,
}: {
  date: Date
  onSelect: (d: Date) => void
}) {
  const [open, setOpen] = useState(false)
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" className="w-[220px] justify-start text-left font-normal">
          <CalendarIcon className="mr-2 h-4 w-4" />
          {format(date, 'PPP')}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <Calendar
          mode="single"
          selected={date}
          onSelect={(d) => {
            if (d) {
              onSelect(d)
              setOpen(false)
            }
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

interface PaymentRow {
  id: string
  amount: number
  payment_method: string
  payment_date: string
  reference_number: string | null
  guest_name: string
  folio_id: string
}

function DailyRevenueReport({ organizationId }: { organizationId: string }) {
  const [date, setDate] = useState<Date>(new Date())
  const [loading, setLoading] = useState(false)
  const [rows, setRows] = useState<PaymentRow[]>([])
  const [fetched, setFetched] = useState(false)

  const fetchData = useCallback(async () => {
    try {
      setLoading(true)
      const supabase = createClient()
      if (!supabase) { setRows([]); return }

      const dayStart = startOfDay(date).toISOString()
      const dayEnd = endOfDay(date).toISOString()

      const { data: payments, error } = await supabase
        .from('payments')
        .select('id, amount, payment_method, payment_date, reference_number, booking_id, guest_id')
        .eq('organization_id', organizationId)
        .gte('payment_date', dayStart)
        .lte('payment_date', dayEnd)
        .order('payment_date', { ascending: true })

      if (error) throw error

      const guestIds = [...new Set((payments || []).map((p: any) => p.guest_id).filter(Boolean))]
      const bookingIds = [...new Set((payments || []).map((p: any) => p.booking_id).filter(Boolean))]

      let guestMap: Record<string, string> = {}
      let bookingMap: Record<string, string> = {}

      if (guestIds.length > 0) {
        const { data: guests } = await supabase
          .from('guests')
          .select('id, name')
          .in('id', guestIds)
        if (guests) {
          guestMap = Object.fromEntries(guests.map((g: any) => [g.id, g.name]))
        }
      }

      if (bookingIds.length > 0) {
        const { data: bookings } = await supabase
          .from('bookings')
          .select('id, folio_id')
          .in('id', bookingIds)
        if (bookings) {
          bookingMap = Object.fromEntries(bookings.map((b: any) => [b.id, b.folio_id]))
        }
      }

      const mapped: PaymentRow[] = (payments || []).map((p: any) => ({
        id: p.id,
        amount: Number(p.amount),
        payment_method: p.payment_method || 'unknown',
        payment_date: p.payment_date,
        reference_number: p.reference_number,
        guest_name: guestMap[p.guest_id] || '—',
        folio_id: bookingMap[p.booking_id] || '—',
      }))

      setRows(mapped)
      setFetched(true)
    } catch (err: any) {
      console.error('Error fetching revenue data:', err)
      toast.error('Failed to fetch revenue data')
      setRows([])
    } finally {
      setLoading(false)
    }
  }, [date, organizationId])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  const totalRevenue = rows.reduce((sum, r) => sum + r.amount, 0)
  const methodBreakdown = rows.reduce<Record<string, number>>((acc, r) => {
    const m = r.payment_method
    acc[m] = (acc[m] || 0) + r.amount
    return acc
  }, {})

  return (
    <div className="space-y-4 print-section">
      <div className="flex flex-wrap items-center gap-3 print:hidden">
        <DatePicker date={date} onSelect={setDate} />
        <PrintButton />
      </div>

      <div className="print:block hidden text-lg font-bold mb-2">
        Daily Revenue Report — {format(date, 'PPP')}
      </div>

      {loading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin" />
        </div>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard label="Total Revenue" value={formatNaira(totalRevenue)} />
            <StatCard label="Transactions" value={rows.length} />
            {Object.entries(methodBreakdown).map(([method, total]) => (
              <StatCard
                key={method}
                label={method.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())}
                value={formatNaira(total)}
              />
            ))}
          </div>

          {fetched && rows.length === 0 && (
            <p className="text-muted-foreground text-center py-8">
              No payments recorded for {format(date, 'PPP')}.
            </p>
          )}

          {rows.length > 0 && (
            <div className="border rounded-lg overflow-auto">
              <div className="min-w-[640px]">
                <div className="grid grid-cols-5 gap-2 px-4 py-2 bg-muted text-sm font-medium">
                  <div>Guest</div>
                  <div>Folio</div>
                  <div className="text-right">Amount</div>
                  <div>Method</div>
                  <div>Time</div>
                </div>
                {rows.map((r) => (
                  <div
                    key={r.id}
                    className="grid grid-cols-5 gap-2 px-4 py-2 border-t text-sm"
                  >
                    <div className="font-medium truncate">{r.guest_name}</div>
                    <div className="text-muted-foreground truncate">{r.folio_id}</div>
                    <div className="text-right font-medium">{formatNaira(r.amount)}</div>
                    <div className="capitalize">{r.payment_method.replace(/_/g, ' ')}</div>
                    <div className="text-muted-foreground">
                      {r.payment_date ? format(parseISO(r.payment_date), 'HH:mm') : '—'}
                    </div>
                  </div>
                ))}
                <div className="grid grid-cols-5 gap-2 px-4 py-2 border-t bg-muted font-medium text-sm">
                  <div className="col-span-2">Total</div>
                  <div className="text-right">{formatNaira(totalRevenue)}</div>
                  <div className="col-span-2">{rows.length} transaction(s)</div>
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
/*  Occupancy Report                                                  */
/* ------------------------------------------------------------------ */

interface RoomTypeStats {
  type: string
  total: number
  occupied: number
}

function OccupancyReport({ organizationId }: { organizationId: string }) {
  const [date, setDate] = useState<Date>(new Date())
  const [loading, setLoading] = useState(false)
  const [totalRooms, setTotalRooms] = useState(0)
  const [occupiedRooms, setOccupiedRooms] = useState(0)
  const [breakdown, setBreakdown] = useState<RoomTypeStats[]>([])

  const fetchData = useCallback(async () => {
    try {
      setLoading(true)
      const supabase = createClient()
      if (!supabase) return

      const dateStr = format(date, 'yyyy-MM-dd')

      const [{ data: rooms, error: rErr }, { data: bookings, error: bErr }] = await Promise.all([
        supabase
          .from('rooms')
          .select('id, room_type')
          .eq('organization_id', organizationId),
        supabase
          .from('bookings')
          .select('room_id')
          .eq('organization_id', organizationId)
          .in('status', ['active', 'checked_in'])
          .lte('check_in', dateStr)
          .gte('check_out', dateStr),
      ])

      if (rErr) throw rErr
      if (bErr) throw bErr

      const allRooms = rooms || []
      const occupiedRoomIds = new Set((bookings || []).map((b: any) => b.room_id))

      setTotalRooms(allRooms.length)
      setOccupiedRooms(occupiedRoomIds.size)

      const byType: Record<string, { total: number; occupied: number }> = {}
      for (const room of allRooms) {
        const t = (room as any).room_type || 'Unknown'
        if (!byType[t]) byType[t] = { total: 0, occupied: 0 }
        byType[t].total++
        if (occupiedRoomIds.has((room as any).id)) byType[t].occupied++
      }

      setBreakdown(
        Object.entries(byType).map(([type, v]) => ({ type, ...v }))
      )
    } catch (err: any) {
      console.error('Error fetching occupancy data:', err)
      toast.error('Failed to fetch occupancy data')
    } finally {
      setLoading(false)
    }
  }, [date, organizationId])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  const available = totalRooms - occupiedRooms
  const rate = totalRooms > 0 ? ((occupiedRooms / totalRooms) * 100).toFixed(1) : '0.0'

  return (
    <div className="space-y-4 print-section">
      <div className="flex flex-wrap items-center gap-3 print:hidden">
        <DatePicker date={date} onSelect={setDate} />
        <PrintButton />
      </div>

      <div className="print:block hidden text-lg font-bold mb-2">
        Occupancy Report — {format(date, 'PPP')}
      </div>

      {loading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin" />
        </div>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard label="Total Rooms" value={totalRooms} />
            <StatCard label="Occupied" value={occupiedRooms} />
            <StatCard label="Available" value={available} />
            <StatCard label="Occupancy Rate" value={`${rate}%`} />
          </div>

          {breakdown.length > 0 && (
            <div className="border rounded-lg overflow-auto">
              <div className="min-w-[400px]">
                <div className="grid grid-cols-4 gap-2 px-4 py-2 bg-muted text-sm font-medium">
                  <div>Room Type</div>
                  <div className="text-right">Total</div>
                  <div className="text-right">Occupied</div>
                  <div className="text-right">Available</div>
                </div>
                {breakdown.map((b) => (
                  <div
                    key={b.type}
                    className="grid grid-cols-4 gap-2 px-4 py-2 border-t text-sm"
                  >
                    <div className="font-medium capitalize">{b.type.replace(/_/g, ' ')}</div>
                    <div className="text-right">{b.total}</div>
                    <div className="text-right">{b.occupied}</div>
                    <div className="text-right">{b.total - b.occupied}</div>
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

  const totalGuests = guests.length
  const withBalance = guests.filter((g) => g.balance > 0).length

  return (
    <div className="space-y-4 print-section">
      <div className="flex justify-end print:hidden">
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
              value={formatNaira(guests.reduce((s, g) => s + g.balance, 0))}
            />
          </div>

          {fetched && guests.length === 0 && (
            <p className="text-muted-foreground text-center py-8">No guests found.</p>
          )}

          {guests.length > 0 && (
            <div className="border rounded-lg overflow-auto">
              <div className="min-w-[640px]">
                <div className="grid grid-cols-5 gap-2 px-4 py-2 bg-muted text-sm font-medium">
                  <div>Guest Name</div>
                  <div>Phone</div>
                  <div>Email</div>
                  <div className="text-right">Balance</div>
                  <div>Last Visit</div>
                </div>
                {guests.map((g) => (
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

  const fetchData = useCallback(async () => {
    try {
      setLoading(true)
      const supabase = createClient()
      if (!supabase) { setAccounts([]); return }

      const { data, error } = await supabase
        .from('city_ledger_accounts')
        .select('id, account_name, account_type, balance, contact_email, contact_phone')
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

  const totalOutstanding = accounts.reduce((s, a) => s + a.balance, 0)

  return (
    <div className="space-y-4 print-section">
      <div className="flex justify-end print:hidden">
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
            <StatCard label="Total Accounts" value={accounts.length} />
            <StatCard label="Total Outstanding" value={formatNaira(totalOutstanding)} />
          </div>

          {fetched && accounts.length === 0 && (
            <p className="text-muted-foreground text-center py-8">
              No city ledger accounts found.
            </p>
          )}

          {accounts.length > 0 && (
            <div className="border rounded-lg overflow-auto">
              <div className="min-w-[640px]">
                <div className="grid grid-cols-4 gap-2 px-4 py-2 bg-muted text-sm font-medium">
                  <div>Account Name</div>
                  <div>Type</div>
                  <div className="text-right">Balance</div>
                  <div>Contact</div>
                </div>
                {accounts.map((a) => (
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
  const { organizationId } = useAuth()

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
            Daily Revenue
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
        </TabsList>

        <TabsContent value="revenue">
          <Card>
            <CardHeader>
              <CardTitle>Daily Revenue Report</CardTitle>
              <CardDescription>
                Revenue breakdown by payment method for a selected date
              </CardDescription>
            </CardHeader>
            <CardContent>
              <DailyRevenueReport organizationId={organizationId} />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="occupancy">
          <Card>
            <CardHeader>
              <CardTitle>Occupancy Report</CardTitle>
              <CardDescription>
                Room occupancy breakdown by type for a selected date
              </CardDescription>
            </CardHeader>
            <CardContent>
              <OccupancyReport organizationId={organizationId} />
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
      </Tabs>
    </div>
  )
}
