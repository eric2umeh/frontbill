'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { format } from 'date-fns'
import { Gift, Loader2, Moon, Sparkles } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { cashbackApiHeaders } from '@/lib/cashback/cashback-client'
import type { CashbackEarnByRateRow } from '@/lib/cashback/cashback-earn-breakdown'
import { formatNaira } from '@/lib/utils/currency'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'

export type GuestCashbackStayRow = {
  id: string
  folio_id: string
  check_in: string
  check_out: string
  number_of_nights: number
  total_amount: number
  deposit: number
  rooms: { room_number: string; room_type: string } | null
}

type GuestCashbackDetail = {
  earnedTotal: number
  redeemedTotal: number
  balance: number
  earnByRate: CashbackEarnByRateRow[]
}

type CashbackTxn = {
  id: string
  txn_type: string
  amount: number
  balance_after: number
  description?: string | null
  payment_method?: string | null
  source_type?: string | null
  source_id?: string | null
  created_at: string
  earn_rate_percent?: number | null
}

type Props = {
  guestId: string
  guestName: string
  stays: GuestCashbackStayRow[]
  enabled?: boolean
}

export function GuestCashbackPanel({
  guestId,
  guestName,
  stays,
  enabled = true,
}: Props) {
  const [loading, setLoading] = useState(true)
  const [detail, setDetail] = useState<GuestCashbackDetail | null>(null)
  const [transactions, setTransactions] = useState<CashbackTxn[]>([])

  useEffect(() => {
    if (!enabled || !guestId) {
      setDetail(null)
      setTransactions([])
      setLoading(false)
      return
    }
    let cancelled = false
    ;(async () => {
      setLoading(true)
      try {
        const supabase = createClient()
        const headers = await cashbackApiHeaders(supabase)
        const res = await fetch(`/api/guests/${guestId}/cashback`, {
          headers,
          credentials: 'include',
        })
        const json = await res.json().catch(() => ({}))
        if (cancelled) return
        const b = json.balance ?? {}
        setDetail({
          earnedTotal: Number(b.earnedTotal ?? 0),
          redeemedTotal: Number(b.redeemedTotal ?? 0),
          balance: Number(b.balance ?? 0),
          earnByRate: Array.isArray(json.earnByRate) ? json.earnByRate : [],
        })
        setTransactions(
          Array.isArray(json.transactions) ? (json.transactions as CashbackTxn[]) : [],
        )
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [guestId, enabled])

  const earnByBookingId = useMemo(() => {
    const map = new Map<string, number>()
    for (const t of transactions) {
      if (String(t.txn_type || '').toLowerCase() !== 'earn') continue
      const sid = String(t.source_id || '').trim()
      if (!sid) continue
      map.set(sid, (map.get(sid) || 0) + (Number(t.amount) || 0))
    }
    return map
  }, [transactions])

  const redeemedByBookingId = useMemo(() => {
    const map = new Map<string, number>()
    for (const t of transactions) {
      if (String(t.txn_type || '').toLowerCase() !== 'redeem') continue
      const sid = String(t.source_id || '').trim()
      if (!sid) continue
      map.set(sid, (map.get(sid) || 0) + (Number(t.amount) || 0))
    }
    return map
  }, [transactions])

  const stayRows = useMemo(() => {
    return stays.map((s) => {
      const nights = Number(s.number_of_nights) || 0
      const amountPaid = Number(s.deposit) || 0
      const stayTotal = Number(s.total_amount) || 0
      const cashbackEarned = earnByBookingId.get(s.id) || 0
      const cashbackUsed = redeemedByBookingId.get(s.id) || 0
      return {
        ...s,
        nights,
        amountPaid,
        stayTotal,
        cashbackEarned,
        cashbackUsed,
      }
    })
  }, [stays, earnByBookingId, redeemedByBookingId])

  const totalNights = stayRows.reduce((s, r) => s + r.nights, 0)
  const totalPaid = stayRows.reduce((s, r) => s + r.amountPaid, 0)
  const balance = detail?.balance ?? 0
  const earnedTotal = detail?.earnedTotal ?? 0
  const redeemedTotal = detail?.redeemedTotal ?? 0

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground py-10 justify-center">
        <Loader2 className="h-4 w-4 animate-spin" />
        Loading cashback earnings…
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {balance > 0 && (
        <div className="rounded-lg border border-violet-200 bg-violet-500/5 px-4 py-3 flex gap-3 items-start">
          <Sparkles className="h-5 w-5 text-violet-700 shrink-0 mt-0.5" />
          <div className="space-y-1 text-sm">
            <p className="font-semibold text-violet-900">
              Recommend cashback to {guestName.split(' ')[0] || 'this guest'}
            </p>
            <p className="text-muted-foreground leading-relaxed">
              Available balance is {formatNaira(balance)}. On the next individual booking or
              reservation (cash / POS / transfer), suggest applying this as a discount so the guest
              sees value from the cashback program.
            </p>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Card className="border-violet-200 bg-violet-500/5">
          <CardContent className="p-5 space-y-1">
            <p className="text-sm text-muted-foreground flex items-center gap-2">
              <Gift className="h-4 w-4" /> Available balance
            </p>
            <p className="text-3xl font-bold text-violet-700 tabular-nums">
              {formatNaira(balance)}
            </p>
            <p className="text-xs text-muted-foreground">Ready to apply as a stay discount</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5 space-y-1">
            <p className="text-sm text-muted-foreground">Lifetime earned</p>
            <p className="text-3xl font-bold tabular-nums text-green-700">
              {formatNaira(earnedTotal)}
            </p>
            <p className="text-xs text-muted-foreground">
              Redeemed {formatNaira(redeemedTotal)}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5 space-y-1">
            <p className="text-sm text-muted-foreground flex items-center gap-2">
              <Moon className="h-4 w-4" /> Nights stayed
            </p>
            <p className="text-3xl font-bold tabular-nums">{totalNights}</p>
            <p className="text-xs text-muted-foreground">
              Paid across stays {formatNaira(totalPaid)}
            </p>
          </CardContent>
        </Card>
      </div>

      {(detail?.earnByRate?.length ?? 0) > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Earned by program rate</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {detail!.earnByRate.map((row) => (
              <div key={row.id} className="flex justify-between text-sm">
                <span className="text-muted-foreground">{row.label}</span>
                <span className="font-medium tabular-nums">{formatNaira(row.earned)}</span>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Stays that built cashback</CardTitle>
          <p className="text-xs text-muted-foreground font-normal">
            Nights and amount paid per room. Cashback earned is linked when the payment was posted
            with cash, POS, or transfer.
          </p>
        </CardHeader>
        <CardContent>
          {stayRows.length === 0 ? (
            <p className="text-sm text-muted-foreground py-6 text-center">
              No stays yet for this guest.
            </p>
          ) : (
            <div className="rounded-md border overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Stay / room</TableHead>
                    <TableHead className="text-right">Nights</TableHead>
                    <TableHead className="text-right">Stay total</TableHead>
                    <TableHead className="text-right">Amount paid</TableHead>
                    <TableHead className="text-right">Cashback earned</TableHead>
                    <TableHead className="text-right">Cashback used</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {stayRows.map((row) => (
                    <TableRow key={row.id}>
                      <TableCell>
                        <div className="space-y-0.5">
                          <Link
                            href={`/bookings/${row.id}`}
                            className="font-mono text-xs font-semibold text-primary hover:underline"
                          >
                            {row.folio_id}
                          </Link>
                          <p className="text-sm font-medium">
                            {row.rooms
                              ? `Room ${row.rooms.room_number} — ${row.rooms.room_type}`
                              : 'Room —'}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {row.check_in
                              ? format(new Date(row.check_in), 'dd MMM yyyy')
                              : '—'}
                            {' → '}
                            {row.check_out
                              ? format(new Date(row.check_out), 'dd MMM yyyy')
                              : '—'}
                          </p>
                        </div>
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{row.nights}</TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatNaira(row.stayTotal)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums font-medium">
                        {formatNaira(row.amountPaid)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums text-green-700">
                        {row.cashbackEarned > 0 ? formatNaira(row.cashbackEarned) : '—'}
                      </TableCell>
                      <TableCell className="text-right tabular-nums text-violet-700">
                        {row.cashbackUsed > 0 ? formatNaira(row.cashbackUsed) : '—'}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Cashback activity</CardTitle>
        </CardHeader>
        <CardContent>
          {transactions.length === 0 ? (
            <p className="text-sm text-muted-foreground py-6 text-center">
              No cashback transactions yet. Earnings appear when the guest pays with cash, POS, or
              transfer on an individual stay.
            </p>
          ) : (
            <div className="space-y-2">
              {transactions.map((tx) => {
                const type = String(tx.txn_type || '').toLowerCase()
                const badge =
                  type === 'earn'
                    ? 'border-green-200 bg-green-50 text-green-800'
                    : type === 'redeem'
                      ? 'border-violet-200 bg-violet-50 text-violet-800'
                      : 'border-amber-200 bg-amber-50 text-amber-800'
                return (
                  <div
                    key={tx.id}
                    className="flex items-start justify-between gap-3 rounded-lg border p-3 text-sm"
                  >
                    <div className="min-w-0 space-y-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <Badge variant="outline" className={`text-xs capitalize ${badge}`}>
                          {type || 'txn'}
                        </Badge>
                        {tx.earn_rate_percent != null && Number(tx.earn_rate_percent) > 0 && (
                          <span className="text-xs text-muted-foreground">
                            @ {Number(tx.earn_rate_percent)}%
                          </span>
                        )}
                      </div>
                      <p className="font-medium truncate">
                        {tx.description || 'Cashback transaction'}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {tx.created_at
                          ? format(new Date(tx.created_at), 'dd MMM yyyy, hh:mm a')
                          : '—'}
                        {tx.payment_method
                          ? ` · ${String(tx.payment_method).replace(/_/g, ' ')}`
                          : ''}
                      </p>
                    </div>
                    <div className="text-right shrink-0">
                      <p
                        className={`font-semibold tabular-nums ${
                          type === 'redeem' ? 'text-violet-700' : 'text-green-700'
                        }`}
                      >
                        {type === 'redeem' ? '−' : '+'}
                        {formatNaira(Number(tx.amount) || 0)}
                      </p>
                      <p className="text-xs text-muted-foreground tabular-nums">
                        Bal. {formatNaira(Number(tx.balance_after) || 0)}
                      </p>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
