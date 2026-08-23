'use client'

import { useCallback, useEffect, useState } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Loader2, Gift, Search } from 'lucide-react'
import { toast } from 'sonner'
import { formatNaira } from '@/lib/utils/currency'
import { createClient } from '@/lib/supabase/client'
import { useAuth } from '@/lib/auth-context'
import { hasPermission } from '@/lib/permissions'
import { format } from 'date-fns'
import Link from 'next/link'
import { PageLoadingState } from '@/components/loading-screen'

type BalanceRow = {
  guest_id: string
  earned_total: number
  redeemed_total: number
  balance: number
  guests?: { name?: string; phone?: string } | null
}

type CashbackTxn = {
  id: string
  txn_type: string
  amount: number
  balance_after: number
  description?: string
  created_at: string
  guests?: { name?: string } | null
}

export default function CashbackPage() {
  const { role, userId } = useAuth()
  const canManage = hasPermission(role, 'cashback:manage')
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [config, setConfig] = useState({ enabled: true, percent: 2 })
  const [balances, setBalances] = useState<BalanceRow[]>([])
  const [recentTransactions, setRecentTransactions] = useState<CashbackTxn[]>([])

  const load = useCallback(async (q?: string) => {
    setLoading(true)
    try {
      const supabase = createClient()
      const headers: Record<string, string> = {}
      if (supabase) {
        const { data: { session } } = await supabase.auth.getSession()
        if (session?.access_token) headers.Authorization = `Bearer ${session.access_token}`
      }
      const url = q?.trim()
        ? `/api/cashback?q=${encodeURIComponent(q.trim())}`
        : '/api/cashback'
      const res = await fetch(url, { headers, credentials: 'include' })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Failed to load')
      setConfig(json.config ?? { enabled: true, percent: 2 })
      setBalances(json.balances ?? [])
      setRecentTransactions(json.recentTransactions ?? [])
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Failed to load cashback')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const handleAdjust = async (guestId: string, guestName: string) => {
    if (!canManage || !userId) return
    const raw = window.prompt(`Adjust cashback for ${guestName}\nEnter + or - amount (NGN):`)
    if (raw == null) return
    const delta = Number(raw)
    if (!Number.isFinite(delta) || delta === 0) {
      toast.error('Enter a non-zero number')
      return
    }
    try {
      const supabase = createClient()
      const headers: Record<string, string> = { 'Content-Type': 'application/json' }
      if (supabase) {
        const { data: { session } } = await supabase.auth.getSession()
        if (session?.access_token) headers.Authorization = `Bearer ${session.access_token}`
      }
      const res = await fetch(`/api/guests/${guestId}/cashback`, {
        method: 'POST',
        headers,
        credentials: 'include',
        body: JSON.stringify({
          action: 'adjust',
          delta,
          description: 'Manual adjustment from Cashback module',
        }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Adjust failed')
      toast.success(`Balance updated — ${formatNaira(json.balanceAfter)} available`)
      load(search)
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Adjust failed')
    }
  }

  if (loading && balances.length === 0) {
    return <PageLoadingState label="Loading cashback…" />
  }

  const totalOutstanding = balances.reduce((s, b) => s + Number(b.balance || 0), 0)
  const totalEarned = balances.reduce((s, b) => s + Number(b.earned_total || 0), 0)

  return (
    <div className="space-y-6 p-4 md:p-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
          <Gift className="h-7 w-7" />
          Cashback Program
        </h1>
        <p className="text-muted-foreground mt-1">
          Guests earn {config.percent}% on eligible cash, POS, and transfer payments across all outlets.
          Redeem as a payment method at checkout.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Program status</CardDescription>
            <CardTitle className="text-lg">
              {config.enabled ? (
                <Badge className="bg-green-600">Active</Badge>
              ) : (
                <Badge variant="secondary">Disabled</Badge>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            Earn rate: <strong className="text-foreground">{config.percent}%</strong>
            {canManage && (
              <p className="mt-2">
                <Link href="/settings" className="text-primary underline-offset-4 hover:underline">
                  Change in Settings
                </Link>
              </p>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Total earned (all guests)</CardDescription>
            <CardTitle className="text-lg">{formatNaira(totalEarned)}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Available to redeem</CardDescription>
            <CardTitle className="text-lg">{formatNaira(totalOutstanding)}</CardTitle>
          </CardHeader>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Guest balances</CardTitle>
          <CardDescription>Search by name or phone</CardDescription>
          <div className="flex gap-2 pt-2">
            <div className="relative flex-1 max-w-sm">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                className="pl-8"
                placeholder="Search guests…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && load(search)}
              />
            </div>
            <Button variant="secondary" onClick={() => load(search)} disabled={loading}>
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Search'}
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-10 text-center">#</TableHead>
                <TableHead>Guest</TableHead>
                <TableHead className="text-right">Earned</TableHead>
                <TableHead className="text-right">Redeemed</TableHead>
                <TableHead className="text-right">Available</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {balances.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                    No cashback balances yet — earnings appear when guests pay with cash, POS, or transfer.
                  </TableCell>
                </TableRow>
              ) : (
                balances.map((row, index) => {
                  const g = row.guests
                  return (
                    <TableRow key={row.guest_id}>
                      <TableCell className="w-10 text-center text-muted-foreground tabular-nums">
                        {index + 1}
                      </TableCell>
                      <TableCell>
                        <Link
                          href={`/guest-database/${row.guest_id}`}
                          className="font-medium hover:underline"
                        >
                          {g?.name || 'Guest'}
                        </Link>
                        {g?.phone && (
                          <p className="text-xs text-muted-foreground">{g.phone}</p>
                        )}
                      </TableCell>
                      <TableCell className="text-right">{formatNaira(row.earned_total)}</TableCell>
                      <TableCell className="text-right">{formatNaira(row.redeemed_total)}</TableCell>
                      <TableCell className="text-right font-medium">
                        {formatNaira(row.balance)}
                      </TableCell>
                      <TableCell className="text-right">
                        {canManage && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleAdjust(row.guest_id, g?.name || 'Guest')}
                          >
                            Adjust
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  )
                })
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Recent activity</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-10 text-center">#</TableHead>
                <TableHead>Date</TableHead>
                <TableHead>Guest</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Description</TableHead>
                <TableHead className="text-right">Amount</TableHead>
                <TableHead className="text-right">Balance after</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {recentTransactions.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center text-muted-foreground py-6">
                    No transactions yet
                  </TableCell>
                </TableRow>
              ) : (
                recentTransactions.map((tx, index) => (
                  <TableRow key={tx.id}>
                    <TableCell className="w-10 text-center text-muted-foreground tabular-nums">
                      {index + 1}
                    </TableCell>
                    <TableCell className="text-sm whitespace-nowrap">
                      {format(new Date(tx.created_at), 'dd MMM yyyy HH:mm')}
                    </TableCell>
                    <TableCell>{tx.guests?.name || '—'}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className="capitalize">
                        {tx.txn_type}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-sm max-w-[200px] truncate">
                      {tx.description || '—'}
                    </TableCell>
                    <TableCell className="text-right">{formatNaira(tx.amount)}</TableCell>
                    <TableCell className="text-right">{formatNaira(tx.balance_after)}</TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  )
}
