'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { formatNaira } from '@/lib/utils/currency'
import { AlertCircle, Building2, Loader2 } from 'lucide-react'
import { toast } from 'sonner'

interface LedgerAccount {
  id: string
  name: string
  balance: number
  status: string
}

interface LedgerTransaction {
  id: string
  description: string
  amount: number
  type: string
  created_at: string
}

export default function CityLedgerPage() {
  const [accounts, setAccounts] = useState<LedgerAccount[]>([])
  const [transactions, setTransactions] = useState<LedgerTransaction[]>([])
  const [loading, setLoading] = useState(true)
  const router = useRouter()

  useEffect(() => {
    fetchLedgerData()
  }, [])

  const fetchLedgerData = async () => {
    try {
      setLoading(true)
      const supabase = createClient()
      
      if (!supabase) {
        setAccounts([])
        setTransactions([])
        setLoading(false)
        return
      }

      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        router.push('/auth/login')
        return
      }

      const { data: profile } = await supabase
        .from('profiles')
        .select('organization_id')
        .eq('id', user.id)
        .single()

      if (!profile) {
        toast.error('Organization not found')
        setAccounts([])
        setTransactions([])
        return
      }

      const { data: ledgerAccounts, error: accountsError } = await supabase
        .from('city_ledger_accounts')
        .select('*')
        .eq('organization_id', profile.organization_id)
        .order('created_at', { ascending: false })

      if (accountsError) throw accountsError

      const { data: ledgerTransactions, error: transError } = await supabase
        .from('transactions')
        .select('*')
        .eq('organization_id', profile.organization_id)
        .eq('category', 'city_ledger')
        .order('created_at', { ascending: false })

      if (transError) throw transError

      setAccounts(ledgerAccounts || [])
      setTransactions(ledgerTransactions || [])
    } catch (error) {
      console.error('Error fetching ledger data:', error)
      toast.error('Failed to load ledger data')
      setAccounts([])
      setTransactions([])
    } finally {
      setLoading(false)
    }
  }

  const totalOutstanding = accounts.reduce((sum, acc) => sum + Number(acc.balance), 0)

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">City Ledger</h1>
        <p className="text-muted-foreground">
          Track organizational debts and credit accounts
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <AlertCircle className="h-4 w-4" />
              Total Outstanding
            </div>
            <div className="text-2xl font-bold text-red-600 mt-2">{formatNaira(totalOutstanding)}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-sm text-muted-foreground">Active Accounts</div>
            <div className="text-2xl font-bold mt-2">{accounts?.length || 0}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-sm text-muted-foreground">Recent Transactions</div>
            <div className="text-2xl font-bold mt-2">{transactions?.length || 0}</div>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Building2 className="h-5 w-5" />
              Account Balances
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {accounts.length === 0 ? (
                <p className="text-center text-sm text-muted-foreground py-8">
                  No accounts yet
                </p>
              ) : (
                accounts.map((acc) => (
                  <div key={acc.id} className="flex items-center justify-between border-b pb-3 last:border-0">
                    <div>
                      <p className="font-medium">{acc.name}</p>
                      <Badge variant="secondary" className="mt-1">
                        {acc.status || 'active'}
                      </Badge>
                    </div>
                    <div className="text-right">
                      <p className={`font-semibold ${acc.balance > 0 ? 'text-red-600' : 'text-green-600'}`}>
                        {formatNaira(acc.balance)}
                      </p>
                      <p className="text-xs text-muted-foreground">Balance</p>
                    </div>
                  </div>
                ))
              )}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Recent Transactions</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {transactions.length === 0 ? (
                <p className="text-center text-sm text-muted-foreground py-8">
                  No transactions yet
                </p>
              ) : (
                transactions.map((entry) => (
                  <div key={entry.id} className="flex items-start justify-between border-b pb-3 last:border-0">
                    <div className="space-y-1">
                      <p className="font-medium text-sm">{entry.description}</p>
                      <p className="text-xs text-muted-foreground">
                        {new Date(entry.created_at).toLocaleDateString('en-GB')}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className={`font-semibold text-sm ${
                        entry.type === 'income' ? 'text-green-600' : 'text-red-600'
                      }`}>
                        {entry.type === 'income' ? '+' : '-'}{formatNaira(entry.amount)}
                      </p>
                      <Badge variant="secondary" className="mt-1 capitalize text-xs">
                        {entry.type}
                      </Badge>
                    </div>
                  </div>
                ))
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
