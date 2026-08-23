'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { formatNaira } from '@/lib/utils/currency'
import { toast } from 'sonner'
import { Loader2 } from 'lucide-react'
import { EnhancedDataTable } from '@/components/shared/enhanced-data-table'
import { Card, CardContent } from '@/components/ui/card'
import { cn } from '@/lib/utils'

interface LedgerRow {
  id: string
  account_name: string
  account_type: string
  balance: number
  contact_email: string | null
  contact_phone: string | null
}

export function DebtReportPanel({ organizationId }: { organizationId: string }) {
  const [loading, setLoading] = useState(false)
  const [accounts, setAccounts] = useState<LedgerRow[]>([])

  const fetchData = useCallback(async () => {
    if (!organizationId) {
      setAccounts([])
      return
    }
    try {
      setLoading(true)
      const supabase = createClient()
      if (!supabase) {
        setAccounts([])
        return
      }

      const { data, error } = await supabase
        .from('city_ledger_accounts')
        .select('id, account_name, account_type, balance, contact_email, contact_phone')
        .eq('organization_id', organizationId)
        .gt('balance', 0)
        .order('balance', { ascending: false })

      if (error) throw error

      setAccounts(
        (data || []).map((a) => ({
          id: a.id,
          account_name: a.account_name,
          account_type: a.account_type || 'organization',
          balance: Number(a.balance || 0),
          contact_email: a.contact_email,
          contact_phone: a.contact_phone,
        })),
      )
    } catch (err: unknown) {
      console.error('Error fetching debt accounts:', err)
      toast.error('Failed to fetch debt accounts')
      setAccounts([])
    } finally {
      setLoading(false)
    }
  }, [organizationId])

  useEffect(() => {
    void fetchData()
  }, [fetchData])

  const owing = useMemo(
    () => accounts.filter((a) => a.balance > 0),
    [accounts],
  )

  const totalOutstanding = owing.reduce((s, a) => s + a.balance, 0)

  if (loading && owing.length === 0) {
    return (
      <div className="flex justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin" />
      </div>
    )
  }

  return (
    <div className="space-y-4 print-section">
      <div className="grid gap-3 sm:grid-cols-2">
        <Card>
          <CardContent className="p-4">
            <p className="text-sm text-muted-foreground">Accounts owing</p>
            <p className="text-2xl font-bold">{owing.length}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-sm text-muted-foreground">Total outstanding</p>
            <p className="text-2xl font-bold text-red-600">{formatNaira(totalOutstanding)}</p>
          </CardContent>
        </Card>
      </div>

      <EnhancedDataTable
        compactTable
        showRowNumbers
        itemsPerPage={15}
        data={owing}
        searchKeys={['account_name', 'account_type', 'contact_email', 'contact_phone']}
        searchPlaceholder="Search debtor…"
        emptyState={{ title: 'No outstanding city ledger balances' }}
        rowKey={(a) => a.id}
        columns={[
          {
            key: 'account_name',
            label: 'Name',
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
              <span className={cn('font-semibold', a.balance > 0 ? 'text-red-600' : 'text-green-600')}>
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
    </div>
  )
}
