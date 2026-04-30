'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { EnhancedDataTable } from '@/components/shared/enhanced-data-table'
import { calculateGuestBalancesBatch } from '@/lib/balance'
import { formatNaira } from '@/lib/utils/currency'
import { usePageData } from '@/hooks/use-page-data'
import { useAuth } from '@/lib/auth-context'
import { Loader2, Building2, User } from 'lucide-react'
import { format } from 'date-fns'
import { Badge } from '@/components/ui/badge'
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

export default function AccountsPage() {
  const [accounts, setAccounts] = useState<UnifiedAccount[]>([])
  const { initialLoading, startFetch, endFetch } = usePageData()
  const { organizationId } = useAuth()
  const router = useRouter()

  useEffect(() => {
    fetchAccounts()
  }, [])

  const fetchAccounts = async () => {
    try {
      startFetch()
      const supabase = createClient()
      if (!supabase) { setAccounts([]); endFetch(); return }

      const [{ data: guestData, error: guestError }, { data: ledgerData, error: ledgerError }, { data: orgData, error: orgError }] = await Promise.all([
        supabase
          .from('guests')
          .select('id, name, phone, email, created_at')
          .eq('organization_id', organizationId)
          .order('created_at', { ascending: false }),
        supabase
          .from('city_ledger_accounts')
          .select('id, account_name, account_type, contact_phone, contact_email, balance, created_at')
          .eq('organization_id', organizationId)
          .order('created_at', { ascending: false }),
        supabase
          .from('organizations')
          .select('id, name')
          .neq('id', organizationId),
      ])

      if (guestError) throw guestError
      if (ledgerError) throw ledgerError
      if (orgError) throw orgError

      // Calculate guest balances
      const guestIds = (guestData || []).map((g: any) => g.id)
      const balanceMap = guestIds.length > 0 
        ? await calculateGuestBalancesBatch(supabase, guestIds)
        : {}

      const organizationNameKeys = new Set((orgData || []).map((org: any) => normalizeNameKey(org.name)))
      const groupedGuests = new Map<string, UnifiedAccount>()
      ;(guestData || [])
        .filter((guest: any) => !organizationNameKeys.has(normalizeNameKey(guest.name)))
        .forEach((guest: any) => {
          const key = normalizeNameKey(guest.name)
          if (!key) return
          const existing = groupedGuests.get(key)
          const balance = balanceMap[guest.id] || 0
          if (existing) {
            existing.balance += balance
            existing.phone = existing.phone || guest.phone
            existing.email = existing.email || guest.email
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
              phone: guest.phone,
              email: guest.email,
              accountType: 'guest',
              balance,
              created_at: guest.created_at,
            })
          }
        })
      const unifiedGuests: UnifiedAccount[] = Array.from(groupedGuests.values())

      // Normalize ledger accounts to unified format
      const guestKeys = new Set((guestData || []).flatMap((guest: any) => [
        `name:${String(guest.name || '').trim().toLowerCase()}`,
        guest.phone ? `phone:${String(guest.phone).trim()}` : '',
        guest.email ? `email:${String(guest.email).trim().toLowerCase()}` : '',
      ].filter(Boolean)))
      const ledgerRows = (ledgerData || [])
        .filter((account: any) => isSelectableLedgerName(account.account_name))
        .filter((account: any) => {
          const type = account.account_type || 'individual'
          if (type === 'organization') return true
          if (organizationNameKeys.has(normalizeNameKey(account.account_name))) return false
          return ![
            `name:${String(account.account_name || '').trim().toLowerCase()}`,
            account.contact_phone ? `phone:${String(account.contact_phone).trim()}` : '',
            account.contact_email ? `email:${String(account.contact_email).trim().toLowerCase()}` : '',
          ].some((key) => key && guestKeys.has(key))
        })

      const groupedLedger = new Map<string, UnifiedAccount>()
      ledgerRows.forEach((account: any) => {
        const type = (account.account_type as 'individual' | 'organization') || 'individual'
        const key = `${type}:${normalizeNameKey(account.account_name)}`
        const existing = groupedLedger.get(key)
        if (existing) {
          existing.balance += Number(account.balance || 0)
          existing.phone = existing.phone || account.contact_phone
          existing.email = existing.email || account.contact_email
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
            phone: account.contact_phone,
            email: account.contact_email,
            accountType: type,
            balance: Number(account.balance || 0),
            created_at: account.created_at,
          })
        }
      })
      const unifiedLedger: UnifiedAccount[] = Array.from(groupedLedger.values())

      // Merge and sort by created_at descending
      const allAccounts = [...unifiedGuests, ...unifiedLedger]
        .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())

      setAccounts(allAccounts)
    } catch (err: any) {
      console.error('Error fetching accounts:', err)
      setAccounts([])
    } finally {
      endFetch()
    }
  }

  const goToAccount = (account: UnifiedAccount) => {
    router.push(`/accounts/${account.displayId}`)
  }

  if (initialLoading) {
    return (
      <div className="flex items-center justify-center h-96">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Guests</h1>
          <p className="text-muted-foreground">{accounts.length} total guests</p>
        </div>
      </div>

      <EnhancedDataTable
        data={accounts}
        searchKeys={['name', 'phone', 'email']}
        filters={[
          {
            key: 'accountType',
            label: 'Type',
            options: [
              { value: 'guest', label: 'Guest' },
              { value: 'individual', label: 'Individual' },
              { value: 'organization', label: 'Organization' },
            ],
          },
        ]}
        columns={[
          {
            key: 'name',
            label: 'Name',
            render: (row: UnifiedAccount) => (
              <div className="flex items-center gap-2">
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10 shrink-0">
                  {row.accountType === 'guest' ? (
                    <User className="h-4 w-4 text-primary" />
                  ) : (
                    <Building2 className="h-4 w-4 text-primary" />
                  )}
                </div>
                <p className="font-medium">{row.name}</p>
              </div>
            ),
          },
          {
            key: 'accountType',
            label: 'Type',
            render: (row: UnifiedAccount) => (
              <Badge variant="secondary" className="capitalize">{row.accountType}</Badge>
            ),
          },
          {
            key: 'phone',
            label: 'Phone',
            render: (row: UnifiedAccount) => <span>{row.phone || '-'}</span>,
          },
          {
            key: 'email',
            label: 'Email',
            render: (row: UnifiedAccount) => <span className="truncate max-w-[160px] block">{row.email || '-'}</span>,
          },
          {
            key: 'balance',
            label: 'Balance',
            render: (row: UnifiedAccount) => (
              <span className={`font-semibold ${row.balance > 0 ? 'text-red-600' : 'text-green-600'}`}>
                {formatNaira(row.balance)}
              </span>
            ),
          },
          {
            key: 'created_at',
            label: 'Created',
            render: (row: UnifiedAccount) => (
              <span>{row.created_at ? format(new Date(row.created_at), 'dd MMM yyyy') : '-'}</span>
            ),
          },
        ]}
        onRowClick={goToAccount}
      />
    </div>
  )
}
