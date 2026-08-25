'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { formatNaira } from '@/lib/utils/currency'
import { toast } from 'sonner'
import { Loader2 } from 'lucide-react'
import { EnhancedDataTable } from '@/components/shared/enhanced-data-table'
import { Card, CardContent } from '@/components/ui/card'
import { cn } from '@/lib/utils'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { formatBookingPaymentMethodLabel } from '@/lib/booking/parse-booking-notes'
import { todayYmdHotel } from '@/lib/utils/booking-in-house-dates'
import { countsOnDailyBookForNight } from '@/lib/rooms/room-occupancy'
import { isOccupyingHotelNight } from '@/lib/utils/booking-in-house-dates'

interface LedgerRow {
  id: string
  account_name: string
  account_type: string
  balance: number
  contact_email: string | null
  contact_phone: string | null
}

interface GuestDebtRow {
  id: string
  guest_name: string
  room_number: string
  check_in: string
  check_out: string
  balance: number
  payment_status: string
  payment_method: string
  kind: 'guest' | 'organization'
  is_in_house: boolean
}

type PartyFilter = 'all' | 'guest' | 'organization'
type ScopeFilter = 'all' | 'in_house' | 'city_ledger'

export function DebtReportPanel({ organizationId }: { organizationId: string }) {
  const [loading, setLoading] = useState(false)
  const [accounts, setAccounts] = useState<LedgerRow[]>([])
  const [guestDebts, setGuestDebts] = useState<GuestDebtRow[]>([])
  const [partyFilter, setPartyFilter] = useState<PartyFilter>('all')
  const [scopeFilter, setScopeFilter] = useState<ScopeFilter>('all')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')

  const fetchData = useCallback(async () => {
    if (!organizationId) {
      setAccounts([])
      setGuestDebts([])
      return
    }
    try {
      setLoading(true)
      const supabase = createClient()
      if (!supabase) {
        setAccounts([])
        setGuestDebts([])
        return
      }

      const today = todayYmdHotel()

      const ledgerRes = await supabase
        .from('city_ledger_accounts')
        .select('id, account_name, account_type, balance, contact_email, contact_phone')
        .eq('organization_id', organizationId)
        .gt('balance', 0)
        .order('balance', { ascending: false })

      if (ledgerRes.error) throw ledgerRes.error

      setAccounts(
        (ledgerRes.data || []).map((a) => ({
          id: a.id,
          account_name: a.account_name,
          account_type: a.account_type || 'organization',
          balance: Number(a.balance || 0),
          contact_email: a.contact_email,
          contact_phone: a.contact_phone,
        })),
      )

      const bookingSelectFull =
        'id, check_in, check_out, status, balance, payment_status, payment_method, ledger_account_name, guests:guest_id(name), rooms:room_id(room_number)'
      const bookingSelectBasic =
        'id, check_in, check_out, status, balance, payment_status, guests:guest_id(name), rooms:room_id(room_number)'

      let bookRes = await supabase
        .from('bookings')
        .select(bookingSelectFull)
        .eq('organization_id', organizationId)
        .in('status', ['confirmed', 'checked_in', 'reserved', 'checked_out'])
        .gt('balance', 0)
        .limit(2000)

      if (bookRes.error || !bookRes.data) {
        console.warn('[debt-report] bookings full select', bookRes.error?.message)
        bookRes = await supabase
          .from('bookings')
          .select(bookingSelectBasic)
          .eq('organization_id', organizationId)
          .in('status', ['confirmed', 'checked_in', 'reserved', 'checked_out'])
          .gt('balance', 0)
          .limit(2000)
      }

      if (bookRes.error) {
        console.warn('[debt-report] bookings', bookRes.error.message)
        setGuestDebts([])
      } else {
        setGuestDebts(
          (bookRes.data || []).map((b) => {
            const method = String(
              (b as { payment_method?: string }).payment_method || '',
            )
              .toLowerCase()
              .replace(/-/g, '_')
            const isOrg = method === 'city_ledger'
            const guestsRaw = (b as { guests?: { name?: string } | { name?: string }[] | null })
              .guests
            const guests = Array.isArray(guestsRaw) ? guestsRaw[0] : guestsRaw
            const roomsRaw = (b as { rooms?: { room_number?: string } | { room_number?: string }[] | null })
              .rooms
            const rooms = Array.isArray(roomsRaw) ? roomsRaw[0] : roomsRaw
            const ledgerName = String(
              (b as { ledger_account_name?: string | null }).ledger_account_name || '',
            ).trim()
            const status = String((b as { status?: string }).status || '')
            const checkIn = String((b as { check_in: string }).check_in).slice(0, 10)
            const checkOut = String((b as { check_out: string }).check_out).slice(0, 10)
            const inHouse =
              countsOnDailyBookForNight(status) &&
              isOccupyingHotelNight(checkIn, checkOut, today)

            return {
              id: (b as { id: string }).id,
              guest_name:
                (isOrg && ledgerName) || guests?.name || ledgerName || 'Guest',
              room_number: rooms?.room_number || '—',
              check_in: checkIn,
              check_out: checkOut,
              balance: Math.max(0, Number((b as { balance?: number }).balance) || 0),
              payment_status: String(
                (b as { payment_status?: string }).payment_status || '—',
              ),
              payment_method: method || 'cash',
              kind: (isOrg ? 'organization' : 'guest') as 'guest' | 'organization',
              is_in_house: Boolean(inHouse),
            }
          }),
        )
      }
    } catch (err: unknown) {
      console.error('Error fetching debt accounts:', err)
      toast.error('Failed to fetch debt accounts')
      setAccounts([])
      setGuestDebts([])
    } finally {
      setLoading(false)
    }
  }, [organizationId])

  useEffect(() => {
    void fetchData()
  }, [fetchData])

  const filteredGuests = useMemo(() => {
    return guestDebts.filter((g) => {
      if (partyFilter === 'guest' && g.kind !== 'guest') return false
      if (partyFilter === 'organization' && g.kind !== 'organization') return false
      if (scopeFilter === 'in_house' && !g.is_in_house) return false
      if (scopeFilter === 'city_ledger' && g.kind !== 'organization') return false
      if (dateFrom && g.check_in < dateFrom) return false
      if (dateTo && g.check_in > dateTo) return false
      return g.balance > 0
    })
  }, [guestDebts, partyFilter, scopeFilter, dateFrom, dateTo])

  const filteredLedger = useMemo(() => {
    if (scopeFilter === 'in_house') return []
    if (partyFilter === 'guest') return []
    return accounts.filter((a) => a.balance > 0)
  }, [accounts, partyFilter, scopeFilter])

  const guestOutstanding = filteredGuests.reduce((s, g) => s + g.balance, 0)
  const ledgerOutstanding = filteredLedger.reduce((s, a) => s + a.balance, 0)
  const totalOutstanding = guestOutstanding + ledgerOutstanding

  if (loading && guestDebts.length === 0 && accounts.length === 0) {
    return (
      <div className="flex justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin" />
      </div>
    )
  }

  return (
    <div className="space-y-4 print-section">
      <div className="flex flex-wrap items-end gap-3 print:hidden">
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">Party</Label>
          <Select
            value={partyFilter}
            onValueChange={(v) => setPartyFilter(v as PartyFilter)}
          >
            <SelectTrigger className="w-[150px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Guest + org</SelectItem>
              <SelectItem value="guest">Guest only</SelectItem>
              <SelectItem value="organization">Org only</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">Scope</Label>
          <Select
            value={scopeFilter}
            onValueChange={(v) => setScopeFilter(v as ScopeFilter)}
          >
            <SelectTrigger className="w-[160px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All debt</SelectItem>
              <SelectItem value="in_house">In-house only</SelectItem>
              <SelectItem value="city_ledger">City ledger only</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">Check-in from</Label>
          <Input
            type="date"
            className="w-[150px]"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
          />
        </div>
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">Check-in to</Label>
          <Input
            type="date"
            className="w-[150px]"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
          />
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <Card>
          <CardContent className="p-4">
            <p className="text-sm text-muted-foreground">Folios / accounts</p>
            <p className="text-2xl font-bold">
              {filteredGuests.length + filteredLedger.length}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-sm text-muted-foreground">Guest / org folios</p>
            <p className="text-2xl font-bold text-amber-700">
              {formatNaira(guestOutstanding)}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-sm text-muted-foreground">Total outstanding</p>
            <p className="text-2xl font-bold text-red-600">{formatNaira(totalOutstanding)}</p>
          </CardContent>
        </Card>
      </div>

      {scopeFilter !== 'city_ledger' ? (
        <EnhancedDataTable
          compactTable
          showRowNumbers
          itemsPerPage={15}
          data={filteredGuests}
          searchKeys={['guest_name', 'room_number', 'payment_status']}
          searchPlaceholder="Search guest debt…"
          emptyState={{ title: 'No guest or org folio balances' }}
          rowKey={(g) => g.id}
          columns={[
            {
              key: 'guest_name',
              label: 'Name',
              render: (g) => (
                <div>
                  <span className="font-medium">{g.guest_name}</span>
                  <p className="text-[11px] text-muted-foreground capitalize">
                    {g.kind}
                    {g.is_in_house ? ' · in-house' : ''}
                  </p>
                </div>
              ),
            },
            {
              key: 'room_number',
              label: 'Room',
              render: (g) => g.room_number,
            },
            {
              key: 'check_in',
              label: 'Check-in',
              responsive: 'md+',
              render: (g) => g.check_in,
            },
            {
              key: 'payment_method',
              label: 'Method',
              responsive: 'md+',
              render: (g) => formatBookingPaymentMethodLabel(g.payment_method),
            },
            {
              key: 'balance',
              label: 'Owing',
              render: (g) => (
                <span className="font-semibold text-red-600">{formatNaira(g.balance)}</span>
              ),
            },
          ]}
        />
      ) : null}

      {scopeFilter !== 'in_house' && partyFilter !== 'guest' ? (
        <EnhancedDataTable
          compactTable
          showRowNumbers
          itemsPerPage={15}
          data={filteredLedger}
          searchKeys={['account_name', 'account_type', 'contact_email', 'contact_phone']}
          searchPlaceholder="Search city ledger…"
          emptyState={{ title: 'No outstanding city ledger balances' }}
          rowKey={(a) => a.id}
          columns={[
            {
              key: 'account_name',
              label: 'Ledger account',
              render: (a) => <span className="font-medium">{a.account_name}</span>,
            },
            {
              key: 'account_type',
              label: 'Type',
              responsive: 'md+',
              render: (a) => (
                <span className="capitalize text-muted-foreground">
                  {a.account_type.replace(/_/g, ' ')}
                </span>
              ),
            },
            {
              key: 'balance',
              label: 'Owing',
              render: (a) => (
                <span
                  className={cn(
                    'font-semibold',
                    a.balance > 0 ? 'text-red-600' : 'text-green-600',
                  )}
                >
                  {formatNaira(a.balance)}
                </span>
              ),
            },
            {
              key: 'contact',
              label: 'Contact',
              responsive: 'md+',
              render: (a) => (
                <span className="text-muted-foreground truncate">
                  {a.contact_email || a.contact_phone || '—'}
                </span>
              ),
            },
          ]}
        />
      ) : null}
    </div>
  )
}
