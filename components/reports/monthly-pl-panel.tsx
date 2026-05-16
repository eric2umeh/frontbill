'use client'

import { useCallback, useEffect, useState } from 'react'
import { format, startOfMonth, endOfMonth } from 'date-fns'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Loader2, Printer, AlertTriangle } from 'lucide-react'
import { formatNaira } from '@/lib/utils/currency'
import { DatePick } from '@/components/reports/financial-and-refund-panels'

export function MonthlyPlPanel({ userId }: { userId: string }) {
  const [month, setMonth] = useState<Date>(() => new Date())
  const [loading, setLoading] = useState(false)
  const [data, setData] = useState<any>(null)

  const load = useCallback(async () => {
    if (!userId) return
    setLoading(true)
    try {
      const start = format(startOfMonth(month), 'yyyy-MM-dd')
      const end = format(endOfMonth(month), 'yyyy-MM-dd')
      const qs = new URLSearchParams({
        caller_id: userId,
        start_date: start,
        end_date: end,
        report: 'profit_and_loss',
      })
      const res = await fetch(`/api/reports/financial?${qs}`, { credentials: 'include' })
      const json = await res.json()
      if (!res.ok) {
        toast.error(json.error || 'Failed to load P&L')
        setData(null)
        return
      }
      setData(json)
    } catch {
      toast.error('Failed to load')
      setData(null)
    } finally {
      setLoading(false)
    }
  }, [userId, month])

  useEffect(() => {
    void load()
  }, [load])

  const rev = data?.revenue
  const exp = data?.expenses

  return (
    <div className="space-y-4 print-section">
      <div className="flex flex-wrap gap-2 print:hidden">
        <DatePick date={month} onSelect={(d) => d && setMonth(d)} label="Month" />
        <Button size="sm" variant="secondary" onClick={() => load()} disabled={loading}>
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Refresh'}
        </Button>
        <Button size="sm" variant="outline" onClick={() => window.print()}>
          <Printer className="mr-2 h-4 w-4" />
          Print
        </Button>
      </div>

      {loading && !data ? (
        <div className="flex justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin" />
        </div>
      ) : data ? (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Card>
              <CardContent className="p-4">
                <p className="text-xs text-muted-foreground">Revenue earned (ex VAT)</p>
                <p className="text-xl font-bold">{formatNaira(rev?.earnedSubtotal ?? 0)}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <p className="text-xs text-muted-foreground">Operating expenses</p>
                <p className="text-xl font-bold text-red-700">
                  {formatNaira(exp?.operatingTotal ?? 0)}
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <p className="text-xs text-muted-foreground">Net operating result</p>
                <p
                  className={`text-xl font-bold ${(data.netOperating ?? 0) >= 0 ? 'text-green-700' : 'text-red-700'}`}
                >
                  {formatNaira(data.netOperating ?? 0)}
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  Margin {data.marginPercent ?? 0}%
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <p className="text-xs text-muted-foreground">Net sales collection − expenses</p>
                <p className="text-xl font-bold">{formatNaira(data.cashSurplus ?? 0)}</p>
                <p className="text-xs text-muted-foreground mt-1">
                  Collection {formatNaira(data.salesCollectionNet ?? 0)}
                </p>
              </CardContent>
            </Card>
          </div>

          {(data.budgetAlerts || []).length > 0 && (
            <Card className="border-amber-300 bg-amber-50/80">
              <CardContent className="p-4 space-y-2">
                <p className="font-medium flex items-center gap-2 text-amber-900">
                  <AlertTriangle className="h-4 w-4" />
                  Budget alerts (≥90% of limit)
                </p>
                <ul className="text-sm space-y-1">
                  {(data.budgetAlerts || []).map((a: any) => (
                    <li key={a.category_id}>
                      {a.name}: {formatNaira(a.spent)} / {formatNaira(a.budget)} ({a.percent}%)
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          )}

          <div className="border rounded-lg overflow-auto max-h-[400px]">
            <table className="w-full text-sm">
              <thead className="bg-muted sticky top-0">
                <tr>
                  <th className="text-left p-2">Category</th>
                  <th className="text-right p-2">Spent</th>
                  <th className="text-right p-2">Budget</th>
                  <th className="text-right p-2">% of budget</th>
                </tr>
              </thead>
              <tbody>
                {(exp?.byCategory || []).map((row: any) => {
                  const pct =
                    row.budget && row.budget > 0
                      ? ((row.amount / row.budget) * 100).toFixed(0)
                      : '—'
                  return (
                    <tr key={row.id} className="border-t">
                      <td className="p-2">{row.name}</td>
                      <td className="text-right p-2">{formatNaira(row.amount)}</td>
                      <td className="text-right p-2">
                        {row.budget != null ? formatNaira(row.budget) : '—'}
                      </td>
                      <td className="text-right p-2">{pct}{pct !== '—' ? '%' : ''}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </>
      ) : null}
    </div>
  )
}
