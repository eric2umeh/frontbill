'use client'

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { EnhancedDataTable } from '@/components/shared/enhanced-data-table'
import { calculateGuestBalancesBatch } from '@/lib/balance'
import { formatNaira } from '@/lib/utils/currency'
import { usePageData } from '@/hooks/use-page-data'
import { useAuth } from '@/lib/auth-context'
import { Building2, User } from 'lucide-react'
import { PageLoadingState } from '@/components/loading-screen'
import { format } from 'date-fns'
import { Badge } from '@/components/ui/badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Label } from '@/components/ui/label'
import { isSelectableLedgerName } from '@/lib/utils/ledger-organization'
import { normalizeNameKey } from '@/lib/utils/name-format'

interface UnifiedAccount {
  id: string
  displayId: string // "guest-{uuid}" or "ledger-{uuid}"
  name: string
  phone?: string
  email?: string
  accountType: 'guest' | 'individual' | 'organization'
  balance: number
  created_at: string
}

type GuestScope = 'in_house_today' | 'all'

export default function AccountsPage() {
  const [accounts, setAccounts] = useState<UnifiedAccount[]>([])
  const [guestScope, setGuestScope] = useState<GuestScope>('in_house_today')
  const { initialLoading, startFetch, endFetch } = usePageData()
  const { organizationId } = useAuth()
  const router = useRouter()

  const fetchAccounts = useCallback(async () => {
    if (!organizationId) return
    try {
      startFetch()
      const supabase = createClient()
      if (!supabase) {
        setAccounts([])
        return
      }

      const today = format(new Date(), 'yyyy-MM-dd')
      let guestData: Array<{
        id: string
        name: string
        phone: string | null
        email: string | null
        created_at: string
      }> = []

      if (guestScope === 'in_house_today') {
        const { data: bookings, error: bookingError } = await supabase
          .from('bookings')
          .select('guest_id')
          .eq('organization_id', organizationId)
          .in('status', ['checked_in', 'confirmed'])
          .lte('check_in', today)
          .gt('check_out', today)

        if (bookingError) throw bookingError

        const guestIds = [
          ...new Set(
            (bookings ?? []).map((b) => b.guest_id).filter((id): id is string => Boolean(id)),
          ),
        ]

        if (guestIds.length === 0) {
          setAccounts([])
          return
        }

        const { data: guests, error: guestError } = await supabase
          .from('guests')
          .select('id, name, phone, email, created_at')
          .eq('organization_id', organizationId)
          .in('id', guestIds)
          .order('name')

        if (guestError) throw guestError
        guestData = guests ?? []
      } else {
        const { data: guests, error: guestError } = await supabase
          .from('guests')
          .select('id, name, phone, email, created_at')
          .eq('organization_id', organizationId)
          .order('created_at', { ascending: false })

        if (guestError) throw guestError
        guestData = guests ?? []
      }

      const guestIds = guestData.map((g) => g.id)
      const balanceMap =
        guestIds.length > 0 ? await calculateGuestBalancesBatch(supabase, guestIds) : {}

      const groupedGuests = new Map<string, UnifiedAccount>()
      guestData.forEach((guest) => {
        const key = normalizeNameKey(guest.name)
        if (!key) return
        const existing = groupedGuests.get(key)
        const balance = balanceMap[guest.id] || 0
        if (existing) {
          existing.balance += balance
          existing.phone = existing.phone || guest.phone || undefined
          existing.email = existing.email || guest.email || undefined
          if (new Date(guest.created_at).getTime() > new Date(existing.created_at).getTime()) {
            existing.id = guest.id
            existing.displayId = `guest-${guest.id}`
            existing.created_at = guest.created_at
          }
        } else {
          groupedGuests.set(key, {
            id: guest.id,
            displayId: `guest-${guest.id}`,
            name: guest.name,
            phone: guest.phone || undefined,
            email: guest.email || undefined,
            accountType: 'guest',
            balance,
            created_at: guest.created_at,
          })
        }
      })

      let unifiedGuests: UnifiedAccount[] = Array.from(groupedGuests.values())

      if (guestScope === 'all') {
        const [{ data: ledgerData, error: ledgerError }, { data: orgData, error: orgError }] =
          await Promise.all([
            supabase
              .from('city_ledger_accounts')
              .select('id, account_name, account_type, contact_phone, contact_email, balance, created_at')
              .eq('organization_id', organizationId)
              .order('created_at', { ascending: false }),
            supabase.from('organizations').select('id, name').neq('id', organizationId),
          ])

        if (ledgerError) throw ledgerError
        if (orgError) throw orgError

        const organizationNameKeys = new Set(
          (orgData || []).map((org: { name: string }) => normalizeNameKey(org.name)),
        )
        const guestKeys = new Set(
          guestData.flatMap((guest) =>
            [
              `name:${String(guest.name || '').trim().toLowerCase()}`,
              guest.phone ? `phone:${String(guest.phone).trim()}` : '',
              guest.email ? `email:${String(guest.email).trim().toLowerCase()}` : '',
            ].filter(Boolean),
          ),
        )
        const ledgerRows = (ledgerData || [])
          .filter((account: { account_name: string }) =>
            isSelectableLedgerName(account.account_name),
          )
          .filter((account: { account_name: string; account_type?: string; contact_phone?: string; contact_email?: string }) => {
            const type = account.account_type || 'individual'
            if (type === 'organization') return true
            if (organizationNameKeys.has(normalizeNameKey(account.account_name))) return false
            return ![
              `name:${String(account.account_name || '').trim().toLowerCase()}`,
              account.contact_phone ? `phone:${String(account.contact_phone).trim()}` : '',
              account.contact_email
                ? `email:${String(account.contact_email).trim().toLowerCase()}`
                : '',
            ].some((key) => key && guestKeys.has(key))
          })

        const groupedLedger = new Map<string, UnifiedAccount>()
        ledgerRows.forEach(
          (account: {
            id: string
            account_name: string
            account_type?: string
            contact_phone?: string | null
            contact_email?: string | null
            balance?: number
            created_at: string
          }) => {
            const type = (account.account_type as 'individual' | 'organization') || 'individual'
            const key = `${type}:${normalizeNameKey(account.account_name)}`
            const existing = groupedLedger.get(key)
            if (existing) {
              existing.balance += Number(account.balance || 0)
              existing.phone = existing.phone || account.contact_phone || undefined
              existing.email = existing.email || account.contact_email || undefined
              if (new Date(account.created_at).getTime() > new Date(existing.created_at).getTime()) {
                existing.id = account.id
                existing.displayId = `ledger-${account.id}`
                existing.created_at = account.created_at
              }
            } else {
              groupedLedger.set(key, {
                id: account.id,
                displayId: `ledger-${account.id}`,
                name: account.account_name,
                phone: account.contact_phone || undefined,
                email: account.contact_email || undefined,
                accountType: type,
                balance: Number(account.balance || 0),
                created_at: account.created_at,
              })
            }
          },
        )

        unifiedGuests = [...unifiedGuests, ...Array.from(groupedLedger.values())].sort(
          (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
        )
      } else {
        unifiedGuests = unifiedGuests.sort(
          (a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }),
        )
      }

      setAccounts(unifiedGuests)
    } catch (err: unknown) {
      console.error('Error fetching accounts:', err)
      setAccounts([])
    } finally {
      endFetch()
    }
  }, [organizationId, guestScope, startFetch, endFetch])

  useEffect(() => {
    void fetchAccounts()
  }, [fetchAccounts])

  const goToAccount = (account: UnifiedAccount) => {
    router.push(`/accounts/${account.displayId}`)
  }

  if (initialLoading) {
    return <PageLoadingState />
  }

  const scopeLabel =
    guestScope === 'in_house_today' ? 'in-house today' : 'all guests & ledger accounts'

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Guests</h1>
          <p className="text-muted-foreground">
            {accounts.length} {scopeLabel}
          </p>
        </div>
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">Show</Label>
          <Select
            value={guestScope}
            onValueChange={(v) => setGuestScope(v as GuestScope)}
          >
            <SelectTrigger className="w-[200px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="in_house_today">In-house today</SelectItem>
              <SelectItem value="all">All guests & accounts</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <EnhancedDataTable
        compactTable
        data={accounts}
        searchKeys={['name', 'phone', 'email']}
        filters={
          guestScope === 'all'
            ? [
                {
                  key: 'accountType',
                  label: 'Type',
                  options: [
                    { value: 'guest', label: 'Guest' },
                    { value: 'individual', label: 'Individual' },
                    { value: 'organization', label: 'Organization' },
                  ],
                },
              ]
            : []
        }
        columns={[
          {
            key: 'name',
            label: 'Name',
            render: (row: UnifiedAccount) => (
              <div className="flex items-center gap-2">
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10 shrink-0 max-md:h-7 max-md:w-7">
                  {row.accountType === 'guest' ? (
                    <User className="h-4 w-4 text-primary max-md:h-3.5 max-md:w-3.5" />
                  ) : (
                    <Building2 className="h-4 w-4 text-primary max-md:h-3.5 max-md:w-3.5" />
                  )}
                </div>
                <p className="font-medium max-md:text-[13px]">{row.name}</p>
              </div>
            ),
          },
          {
            key: 'balance',
            label: 'Balance',
            render: (row: UnifiedAccount) => (
              <span
                className={`font-semibold text-xs md:text-sm ${row.balance > 0 ? 'text-red-600' : 'text-green-600'}`}
              >
                {formatNaira(row.balance)}
              </span>
            ),
          },
          {
            key: 'accountType',
            label: 'Type',
            responsive: 'md+',
            render: (row: UnifiedAccount) => (
              <Badge variant="secondary" className="capitalize text-[10px] md:text-xs">
                {row.accountType}
              </Badge>
            ),
          },
          {
            key: 'phone',
            label: 'Phone',
            responsive: 'md+',
            render: (row: UnifiedAccount) => <span>{row.phone || '-'}</span>,
          },
          {
            key: 'email',
            label: 'Email',
            responsive: 'md+',
            render: (row: UnifiedAccount) => (
              <span className="truncate max-w-[160px] block">{row.email || '-'}</span>
            ),
          },
          {
            key: 'created_at',
            label: 'Created',
            responsive: 'lg+',
            render: (row: UnifiedAccount) => (
              <span>{row.created_at ? format(new Date(row.created_at), 'dd MMM yyyy') : '-'}</span>
            ),
          },
        ]}
        onRowClick={goToAccount}
        emptyState={{
          title:
            guestScope === 'in_house_today'
              ? 'No in-house guests today'
              : 'No guests found',
          description:
            guestScope === 'in_house_today'
              ? 'Guests appear here when they have a confirmed or checked-in stay covering today.'
              : undefined,
        }}
      />
    </div>
  )
}
