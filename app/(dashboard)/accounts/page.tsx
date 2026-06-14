'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { isSelectableLedgerName } from '@/lib/utils/ledger-organization'
import { normalizeNameKey } from '@/lib/utils/name-format'
import { hasPermission } from '@/lib/permissions'
import { OrganizationsPanel } from '@/components/organizations/organizations-panel'

interface UnifiedAccount {
  id: string
  displayId: string
  name: string
  phone?: string
  email?: string
  accountType: 'guest' | 'individual' | 'organization'
  balance: number
  created_at: string
  /** True when any merged guest profile for this row is in-house today. */
  inHouseToday?: boolean
}

type GuestScope = 'in_house_today' | 'all'

function buildGuestAccounts(
  guestData: Array<{
    id: string
    name: string
    phone: string | null
    email: string | null
    created_at: string
  }>,
  balanceMap: Record<string, number>,
  inHouseGuestIds: Set<string>,
): UnifiedAccount[] {
  const groupedGuests = new Map<string, UnifiedAccount>()
  guestData.forEach((guest) => {
    const key = normalizeNameKey(guest.name)
    if (!key) return
    const existing = groupedGuests.get(key)
    const balance = balanceMap[guest.id] || 0
    const inHouse = inHouseGuestIds.has(guest.id)
    if (existing) {
      existing.balance += balance
      existing.phone = existing.phone || guest.phone || undefined
      existing.email = existing.email || guest.email || undefined
      if (inHouse) existing.inHouseToday = true
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
        inHouseToday: inHouse,
      })
    }
  })
  return Array.from(groupedGuests.values())
}

export default function AccountsPage() {
  const searchParams = useSearchParams()
  const tabParam = searchParams.get('tab')
  const [allGuestAccounts, setAllGuestAccounts] = useState<UnifiedAccount[]>([])
  const [ledgerAccounts, setLedgerAccounts] = useState<UnifiedAccount[]>([])
  const [inHouseCount, setInHouseCount] = useState(0)
  const [guestScope, setGuestScope] = useState<GuestScope>('in_house_today')
  const { initialLoading, startFetch, endFetch } = usePageData()
  const { organizationId, role } = useAuth()
  const router = useRouter()

  const canViewGuests = hasPermission(role, 'guests:view')
  const canViewOrganizations = hasPermission(role, 'organizations:view')
  const activeTab =
    tabParam === 'organizations' && canViewOrganizations
      ? 'organizations'
      : canViewGuests
        ? 'guests'
        : 'organizations'

  const fetchAccounts = useCallback(async () => {
    if (!organizationId) return
    try {
      startFetch()
      const supabase = createClient()
      if (!supabase) {
        setAllGuestAccounts([])
        setLedgerAccounts([])
        return
      }

      const today = format(new Date(), 'yyyy-MM-dd')

      const [{ data: allGuests, error: guestError }, { data: bookings, error: bookingError }] =
        await Promise.all([
          supabase
            .from('guests')
            .select('id, name, phone, email, created_at')
            .eq('organization_id', organizationId)
            .order('created_at', { ascending: false }),
          supabase
            .from('bookings')
            .select('guest_id')
            .eq('organization_id', organizationId)
            .in('status', ['checked_in', 'confirmed'])
            .lte('check_in', today)
            .gt('check_out', today),
        ])

      if (guestError) throw guestError
      if (bookingError) throw bookingError

      const inHouseGuestIds = new Set(
        (bookings ?? []).map((b) => b.guest_id).filter((id): id is string => Boolean(id)),
      )

      const guestData = allGuests ?? []
      const guestIds = guestData.map((g) => g.id)
      const balanceMap =
        guestIds.length > 0 ? await calculateGuestBalancesBatch(supabase, guestIds) : {}

      const unifiedGuests = buildGuestAccounts(guestData, balanceMap, inHouseGuestIds)
      const inHouseGuests = unifiedGuests.filter((g) => g.inHouseToday)
      setAllGuestAccounts(unifiedGuests)
      setInHouseCount(inHouseGuests.length)

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
          .filter(
            (account: {
              account_name: string
              account_type?: string
              contact_phone?: string
              contact_email?: string
            }) => {
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
            },
          )

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

        setLedgerAccounts(Array.from(groupedLedger.values()))
      } else {
        setLedgerAccounts([])
      }
    } catch (err: unknown) {
      console.error('Error fetching accounts:', err)
      setAllGuestAccounts([])
      setLedgerAccounts([])
      setInHouseCount(0)
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

  const inHouseGuestAccounts = useMemo(
    () => allGuestAccounts.filter((g) => g.inHouseToday),
    [allGuestAccounts],
  )

  const tableData = useMemo(() => {
    if (guestScope === 'all') {
      return [...allGuestAccounts, ...ledgerAccounts].sort(
        (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
      )
    }
    return allGuestAccounts
  }, [guestScope, allGuestAccounts, ledgerAccounts])

  const listWhenSearchEmpty = useMemo(() => {
    if (guestScope === 'in_house_today') {
      return inHouseGuestAccounts
    }
    return undefined
  }, [guestScope, inHouseGuestAccounts])

  const displayCount =
    guestScope === 'in_house_today' ? inHouseCount : tableData.length

  if (canViewGuests && activeTab === 'guests' && initialLoading) {
    return <PageLoadingState />
  }

  const scopeLabel =
    guestScope === 'in_house_today' ? 'in-house today' : 'all guests & ledger accounts'

  const setTab = (tab: 'guests' | 'organizations') => {
    router.replace(tab === 'organizations' ? '/accounts?tab=organizations' : '/accounts')
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Guest / Org</h1>
        <p className="text-muted-foreground">Guest profiles and organization accounts</p>
      </div>

      <Tabs value={activeTab} onValueChange={(v) => setTab(v as 'guests' | 'organizations')}>
        <TabsList>
          {canViewGuests && <TabsTrigger value="guests">Guests</TabsTrigger>}
          {canViewOrganizations && <TabsTrigger value="organizations">Organizations</TabsTrigger>}
        </TabsList>

        {canViewGuests && (
          <TabsContent value="guests" className="space-y-6 mt-4">
            <div className="flex flex-wrap items-end justify-between gap-4">
              <div>
                <p className="text-muted-foreground">
                  {displayCount} {scopeLabel}
                  {guestScope === 'in_house_today' ? (
                    <span className="text-muted-foreground/80">
                      {' '}
                      · search finds any guest in the database
                    </span>
                  ) : null}
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
              data={tableData}
              listWhenSearchEmpty={listWhenSearchEmpty}
              searchPlaceholder="Search all guests by name, phone, or email…"
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
                    ? 'Guests appear here when they have a confirmed or checked-in stay covering today. Use search to find any guest in the database.'
                    : undefined,
              }}
            />
          </TabsContent>
        )}

        {canViewOrganizations && (
          <TabsContent value="organizations" className="mt-4">
            <OrganizationsPanel />
          </TabsContent>
        )}
      </Tabs>
    </div>
  )
}
