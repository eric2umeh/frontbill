'use client'

import { useEffect, useState, useMemo } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { formatNaira } from '@/lib/utils/currency'
import { AlertCircle, Building2, Loader2, Search, X } from 'lucide-react'
import { toast } from 'sonner'
import { format, isWithinInterval, parseISO, startOfDay, endOfDay } from 'date-fns'

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
  guest_name?: string
}

export default function CityLedgerPage() {
  const [accounts, setAccounts] = useState<LedgerAccount[]>([])
  const [transactions, setTransactions] = useState<LedgerTransaction[]>([])
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
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

  const filteredTransactions = useMemo(() => {
    return transactions.filter((t) => {
      const matchesSearch = !searchQuery ||
        t.description?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        t.guest_name?.toLowerCase().includes(searchQuery.toLowerCase())

      let matchesDate = true
      if (dateFrom || dateTo) {
        const txDate = parseISO(t.created_at)
        if (dateFrom && dateTo) {
          matchesDate = isWithinInterval(txDate, {
            start: startOfDay(parseISO(dateFrom)),
            end: endOfDay(parseISO(dateTo)),
          })
        } else if (dateFrom) {
          matchesDate = txDate >= startOfDay(parseISO(dateFrom))
        } else if (dateTo) {
          matchesDate = txDate <= endOfDay(parseISO(dateTo))
        }
      }
      return matchesSearch && matchesDate
    })
  }, [transactions, searchQuery, dateFrom, dateTo])

  const totalOutstanding = accounts.reduce((sum, acc) => sum + Number(acc.balance), 0)

  const clearFilters = () => {
    setSearchQuery('')
    setDateFrom('')
    setDateTo('')
  }

  const hasActiveFilters = searchQuery || dateFrom || dateTo

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
            <div className="text-sm text-muted-foreground">Transactions Shown</div>
            <div className="text-2xl font-bold mt-2">{filteredTransactions.length}</div>
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
            <div className="flex items-center justify-between flex-wrap gap-2">
              <CardTitle>Transaction History</CardTitle>
              {hasActiveFilters && (
                <Button variant="ghost" size="sm" onClick={clearFilters} className="gap-1 text-xs">
                  <X className="h-3 w-3" /> Clear filters
                </Button>
              )}
            </div>
            {/* Filter controls */}
            <div className="space-y-2 pt-1">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
                <Input
                  placeholder="Search by guest or description..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-9 h-9 text-sm"
                />
              </div>
              <div className="flex gap-2">
                <div className="flex-1">
                  <label className="text-xs text-muted-foreground block mb-1">From</label>
                  <Input
                    type="date"
                    value={dateFrom}
                    onChange={(e) => setDateFrom(e.target.value)}
                    className="h-9 text-sm"
                  />
                </div>
                <div className="flex-1">
                  <label className="text-xs text-muted-foreground block mb-1">To</label>
                  <Input
                    type="date"
                    value={dateTo}
                    onChange={(e) => setDateTo(e.target.value)}
                    className="h-9 text-sm"
                  />
                </div>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {filteredTransactions.length === 0 ? (
                <p className="text-center text-sm text-muted-foreground py-8">
                  {hasActiveFilters ? 'No transactions match your filters' : 'No transactions yet'}
                </p>
              ) : (
                filteredTransactions.map((entry) => (
                  <div key={entry.id} className="flex items-start justify-between border-b pb-3 last:border-0">
                    <div className="space-y-1">
                      <p className="font-medium text-sm">{entry.description}</p>
                      <p className="text-xs text-muted-foreground">
                        {format(new Date(entry.created_at), 'dd MMM yyyy, HH:mm')}
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
