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
import { todayYmdHotel, isOccupyingHotelNight } from '@/lib/utils/booking-in-house-dates'
import { countsOnDailyBookForNight } from '@/lib/rooms/room-occupancy'
import { enrichBookingsList } from '@/lib/booking/enrich-bookings-list'
import { calculateGuestBalancesBatch } from '@/lib/balance'

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

      const bookingSelectFull =
        'id, check_in, check_out, status, balance, total_amount, deposit, payment_status, payment_method, ledger_account_name, guest_id, guests:guest_id(name), rooms:room_id(room_number)'
      const bookingSelectBasic =
        'id, check_in, check_out, status, balance, total_amount, deposit, payment_status, guest_id, guests:guest_id(name), rooms:room_id(room_number)'

      let bookRes = await supabase
        .from('bookings')
        .select(bookingSelectFull)
        .eq('organization_id', organizationId)
        .in('status', ['confirmed', 'checked_in', 'reserved', 'checked_out'])
        .limit(2000)

      if (bookRes.error || !bookRes.data) {
        console.warn('[debt-report] bookings full select', bookRes.error?.message)
        bookRes = await supabase
          .from('bookings')
          .select(bookingSelectBasic)
          .eq('organization_id', organizationId)
          .in('status', ['confirmed', 'checked_in', 'reserved', 'checked_out'])
          .limit(2000)
      }

      const bookingRows = (bookRes.data || []) as Array<{
        id: string
        balance?: number
        total_amount?: number
        deposit?: number
        payment_status?: string
        [key: string]: unknown
      }>

      if (bookRes.error) {
        console.warn('[debt-report] bookings', bookRes.error.message)
        setGuestDebts([])
      } else {
        // Same folio outstanding as booking detail / Guest Database
        await enrichBookingsList(supabase, organizationId, bookingRows as any)

        setGuestDebts(
          bookingRows
            .map((b) => {
              const method = String(
                (b as { payment_method?: string }).payment_method || '',
              )
                .toLowerCase()
                .replace(/-/g, '_')
              const isOrg = method === 'city_ledger'
              const guestsRaw = (
                b as {
                  guests?:
                    | { name?: string }
                    | { name?: string }[]
                    | null
                }
              ).guests
              const guests = Array.isArray(guestsRaw) ? guestsRaw[0] : guestsRaw
              const roomsRaw = (
                b as {
                  rooms?:
                    | { room_number?: string }
                    | { room_number?: string }[]
                    | null
                }
              ).rooms
              const rooms = Array.isArray(roomsRaw) ? roomsRaw[0] : roomsRaw
              const ledgerName = String(
                (b as { ledger_account_name?: string | null }).ledger_account_name ||
                  '',
              ).trim()
              const status = String((b as { status?: string }).status || '')
              const checkIn = String((b as { check_in: string }).check_in).slice(
                0,
                10,
              )
              const checkOut = String(
                (b as { check_out: string }).check_out,
              ).slice(0, 10)
              const inHouse =
                countsOnDailyBookForNight(status) &&
                isOccupyingHotelNight(checkIn, checkOut, today)
              const owing = Math.max(0, Number(b.balance) || 0)

              return {
                id: b.id,
                guest_name:
                  (isOrg && ledgerName) || guests?.name || ledgerName || 'Guest',
                room_number: rooms?.room_number || '—',
                check_in: checkIn,
                check_out: checkOut,
                balance: owing,
                payment_status: String(
                  (b as { payment_status?: string }).payment_status || '—',
                ),
                payment_method: method || 'cash',
                kind: (isOrg ? 'organization' : 'guest') as
                  | 'guest'
                  | 'organization',
                is_in_house: Boolean(inHouse),
              }
            })
            .filter((g) => g.balance > 0.005),
        )
      }

      const [{ data: ledgerData, error: ledgerErr }, { data: guestData }] =
        await Promise.all([
          supabase
            .from('city_ledger_accounts')
            .select(
              'id, account_name, account_type, balance, contact_email, contact_phone',
            )
            .eq('organization_id', organizationId)
            .order('balance', { ascending: false })
            .limit(2000),
          supabase
            .from('guests')
            .select('id, name')
            .eq('organization_id', organizationId)
            .limit(5000),
        ])

      if (ledgerErr) throw ledgerErr

      const guestBalanceMap =
        (guestData || []).length > 0
          ? await calculateGuestBalancesBatch(
              supabase,
              (guestData || []).map((g) => ({ id: g.id, name: g.name })),
              organizationId,
            )
          : {}

      const guestDueByName = new Map<string, number>()
      for (const g of guestData || []) {
        const key = String(g.name || '')
          .trim()
          .toLowerCase()
        if (!key) continue
        const signed = Number(guestBalanceMap[g.id] ?? 0)
        if (signed > 0.005) {
          guestDueByName.set(
            key,
            Math.max(guestDueByName.get(key) || 0, signed),
          )
        }
      }

      setAccounts(
        (ledgerData || [])
          .map((a) => {
            const type = String(a.account_type || 'organization').toLowerCase()
            const nameKey = String(a.account_name || '')
              .trim()
              .toLowerCase()
            const raw = Math.max(0, Number(a.balance || 0))
            let balance = raw
            if (type === 'individual' || type === 'guest') {
              // Match Guest Database / booking due when a guest profile exists
              const guestDue = nameKey ? guestDueByName.get(nameKey) || 0 : 0
              balance = Math.max(raw, guestDue)
            }
            return {
              id: a.id,
              account_name: a.account_name,
              account_type: a.account_type || 'organization',
              balance,
              contact_email: a.contact_email,
              contact_phone: a.contact_phone,
            }
          })
          .filter((a) => a.balance > 0.005),
      )
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
    return accounts.filter((a) => {
      const type = String(a.account_type || '').toLowerCase()
      // Guest/individual owing is already on folio rows + Guest Database — avoid double-count
      // unless party is organization-only view of the ledger list
      if (partyFilter === 'organization') {
        return (
          a.balance > 0 &&
          (type === 'organization' || type === 'corporate')
        )
      }
      if (type === 'individual' || type === 'guest') {
        // Show only when no matching folio debt row (ledger-only debit)
        const nameKey = a.account_name.trim().toLowerCase()
        const hasFolioDebt = guestDebts.some(
          (g) =>
            g.kind === 'guest' &&
            g.guest_name.trim().toLowerCase() === nameKey &&
            g.balance > 0.005,
        )
        return a.balance > 0 && !hasFolioDebt
      }
      return a.balance > 0
    })
  }, [accounts, partyFilter, scopeFilter, guestDebts])

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
              <SelectItem value="all">All parties</SelectItem>
              <SelectItem value="guest">Guests</SelectItem>
              <SelectItem value="organization">Organizations</SelectItem>
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
              <SelectItem value="all">All</SelectItem>
              <SelectItem value="in_house">In-house only</SelectItem>
              <SelectItem value="city_ledger">City ledger only</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">From</Label>
          <Input
            type="date"
            className="h-9 w-[140px]"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
          />
        </div>
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">To</Label>
          <Input
            type="date"
            className="h-9 w-[140px]"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
          />
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <Card>
          <CardContent className="p-4">
            <p className="text-sm text-muted-foreground">Guest / org folios</p>
            <p className="text-2xl font-bold text-red-600">
              {formatNaira(guestOutstanding)}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-sm text-muted-foreground">City ledger</p>
            <p className="text-2xl font-bold text-red-600">
              {formatNaira(ledgerOutstanding)}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-sm text-muted-foreground">Total outstanding</p>
            <p className="text-2xl font-bold text-red-600">
              {formatNaira(totalOutstanding)}
            </p>
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
                <span className="font-semibold text-red-600">
                  {formatNaira(g.balance)}
                </span>
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
              render: (a) => (
                <span className="font-medium">{a.account_name}</span>
              ),
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
          ]}
        />
      ) : null}
    </div>
  )
}
