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

      // Fetch guests
      const { data: guestData, error: guestError } = await supabase
        .from('guests')
        .select('id, name, phone, email, created_at')
        .eq('organization_id', organizationId)
        .order('created_at', { ascending: false })

      if (guestError) throw guestError

      // Fetch city ledger accounts
      const { data: ledgerData, error: ledgerError } = await supabase
        .from('city_ledger_accounts')
        .select('id, account_name, account_type, contact_phone, contact_email, balance, created_at')
        .eq('organization_id', organizationId)
        .order('created_at', { ascending: false })

      if (ledgerError) throw ledgerError

      // Calculate guest balances
      const guestIds = (guestData || []).map(g => g.id)
      const balanceMap = guestIds.length > 0 
        ? await calculateGuestBalancesBatch(supabase, guestIds)
        : {}

      // Normalize guests to unified account format
      const unifiedGuests: UnifiedAccount[] = (guestData || []).map(guest => ({
        id: guest.id,
        displayId: `guest-${guest.id}`,
        name: guest.name,
        phone: guest.phone,
        email: guest.email,
        accountType: 'guest',
        balance: balanceMap[guest.id] || 0,
        created_at: guest.created_at,
      }))

      // Normalize ledger accounts to unified format
      const unifiedLedger: UnifiedAccount[] = (ledgerData || []).map(account => ({
        id: account.id,
        displayId: `ledger-${account.id}`,
        name: account.account_name,
        phone: account.contact_phone,
        email: account.contact_email,
        accountType: (account.account_type as 'individual' | 'organization') || 'individual',
        balance: account.balance || 0,
        created_at: account.created_at,
      }))

      // Merge and sort by created_at descending
      const allAccounts = [...unifiedGuests, ...unifiedLedger]
        .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())

      setAccounts(allAccounts)
    } catch (err: any) {
      console.error('[v0] Error fetching accounts:', err)
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
          <h1 className="text-3xl font-bold tracking-tight">Accounts</h1>
          <p className="text-muted-foreground">{accounts.length} total accounts</p>
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
