'use client'

import { useCallback, useEffect, useState } from 'react'
import { format } from 'date-fns'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Loader2, Printer } from 'lucide-react'
import { formatNaira } from '@/lib/utils/currency'
import { DatePick } from '@/components/reports/financial-and-refund-panels'

export function DailyExpenditurePanel({ userId }: { userId: string }) {
  const [start, setStart] = useState<Date>(() => new Date())
  const [end, setEnd] = useState<Date>(() => new Date())
  const [loading, setLoading] = useState(false)
  const [data, setData] = useState<any>(null)

  const load = useCallback(async () => {
    if (!userId) return
    setLoading(true)
    try {
      const qs = new URLSearchParams({
        caller_id: userId,
        start_date: format(start, 'yyyy-MM-dd'),
        end_date: format(end, 'yyyy-MM-dd'),
        report: 'daily_expenditure',
      })
      const res = await fetch(`/api/reports/financial?${qs}`, { credentials: 'include' })
      const json = await res.json()
      if (!res.ok) {
        toast.error(json.error || 'Failed to load')
        setData(null)
        return
      }
      setData(json)
    } catch {
      toast.error('Failed to load expenditure')
      setData(null)
    } finally {
      setLoading(false)
    }
  }, [userId, start, end])

  useEffect(() => {
    void load()
  }, [load])

  const categories = data?.categories || []

  return (
    <div className="space-y-4 print-section">
      <div className="flex flex-wrap gap-2 print:hidden">
        <DatePick date={start} onSelect={(d) => d && setStart(d)} label="From" />
        <DatePick date={end} onSelect={(d) => d && setEnd(d)} label="To" />
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
      ) : (
        <div className="border rounded-lg overflow-auto max-h-[520px]">
          <table className="w-full text-xs">
            <thead className="bg-muted sticky top-0">
              <tr>
                <th className="text-left p-2">Date</th>
                <th className="text-left p-2">Description</th>
                {categories.map((c: any) => (
                  <th key={c.id} className="text-right p-2 whitespace-nowrap">
                    {c.name}
                  </th>
                ))}
                <th className="text-right p-2">Total</th>
              </tr>
            </thead>
            <tbody>
              {(data?.byDay || []).map((row: any) => (
                <tr key={row.date} className="border-t">
                  <td className="p-2">{row.date}</td>
                  <td className="p-2 text-muted-foreground">{row.description || '—'}</td>
                  {categories.map((c: any) => (
                    <td key={c.id} className="text-right p-2 tabular-nums">
                      {row.amounts?.[c.id] ? formatNaira(row.amounts[c.id]) : '—'}
                    </td>
                  ))}
                  <td className="text-right p-2 font-medium">{formatNaira(row.dayTotal)}</td>
                </tr>
              ))}
              <tr className="bg-muted/50 font-semibold border-t">
                <td colSpan={2} className="p-2">
                  Period total
                </td>
                {categories.map((c: any) => (
                  <td key={c.id} className="text-right p-2">
                    {formatNaira(data?.categoryTotals?.[c.id] ?? 0)}
                  </td>
                ))}
                <td className="text-right p-2">{formatNaira(data?.grandTotal ?? 0)}</td>
              </tr>
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
