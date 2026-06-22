'use client'

import { useCallback, useEffect, useState } from 'react'
import { format, parseISO } from 'date-fns'
import type { OutletDepartmentKey } from '@/lib/outlets/departments'
import type { OutletDailyReportPayload } from '@/lib/outlets/build-daily-report'
import { formatNaira } from '@/lib/utils/currency'
import { nightAuditClosingDateYmd } from '@/lib/hotel-date'
import { outletApiHeaders } from '@/lib/outlets/outlet-api-headers'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { toast } from 'sonner'
import { Loader2, Moon, Printer, CheckCircle2 } from 'lucide-react'

type SavedReport = {
  id: string
  report_date: string
  order_count: number
  void_count: number
  gross_sales: number
  payment_breakdown: Record<string, number>
  top_items: { item_name: string; qty: number; revenue: number }[]
  summary: OutletDailyReportPayload['summary']
  created_at: string
}

type Props = {
  department: OutletDepartmentKey
  departmentLabel: string
}

const PAYMENT_LABELS: Record<string, string> = {
  cash: 'Cash',
  pos: 'POS',
  transfer: 'Transfer',
  card: 'POS',
  city_ledger: 'City ledger / room',
}

export function OutletDailyReportPanel({ department, departmentLabel }: Props) {
  const [reportDate, setReportDate] = useState(() => nightAuditClosingDateYmd())
  const [running, setRunning] = useState(false)
  const [loading, setLoading] = useState(false)
  const [saved, setSaved] = useState<SavedReport | null>(null)
  const [preview, setPreview] = useState<OutletDailyReportPayload | null>(null)

  const loadReport = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(
        `/api/outlets/daily-report?department=${encodeURIComponent(department)}&report_date=${encodeURIComponent(reportDate)}`,
        { headers: await outletApiHeaders(), credentials: 'include' },
      )
      const json = await res.json().catch(() => ({}))
      if (!res.ok) {
        setSaved(null)
        return
      }
      const r = json.report as SavedReport | null
      setSaved(r)
      if (r) {
        setPreview({
          department,
          department_label: departmentLabel,
          report_date: r.report_date,
          order_count: r.order_count,
          void_count: r.void_count,
          gross_sales: Number(r.gross_sales),
          payment_breakdown: r.payment_breakdown ?? {},
          top_items: r.top_items ?? [],
          summary: r.summary ?? { by_order_type: {}, orders: [] },
        })
      } else {
        setPreview(null)
      }
    } finally {
      setLoading(false)
    }
  }, [department, departmentLabel, reportDate])

  useEffect(() => {
    void loadReport()
  }, [loadReport])

  const runNightAudit = async () => {
    setRunning(true)
    toast.loading('Running outlet night audit…', { id: 'outlet-audit' })
    try {
      const res = await fetch('/api/outlets/daily-report', {
        method: 'POST',
        headers: await outletApiHeaders({ 'Content-Type': 'application/json' }),
        credentials: 'include',
        body: JSON.stringify({ department, report_date: reportDate }),
      })
      const json = await res.json().catch(() => ({}))
      if (res.status === 409) {
        toast.error(json.error || 'Report already exists for this date', { id: 'outlet-audit' })
        await loadReport()
        return
      }
      if (!res.ok) {
        toast.error(json.error || 'Night audit failed', { id: 'outlet-audit' })
        return
      }
      setPreview(json.payload as OutletDailyReportPayload)
      setSaved(json.report as SavedReport)
      toast.success(`Daily report saved for ${reportDate}`, { id: 'outlet-audit' })
    } catch {
      toast.error('Network error', { id: 'outlet-audit' })
    } finally {
      setRunning(false)
    }
  }

  const display = preview
  const isClosed = Boolean(saved)

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <CardTitle className="text-base flex items-center gap-2">
                <Moon className="h-4 w-4 text-amber-700" />
                Outlet night audit
              </CardTitle>
              <CardDescription>
                Close the business day for {departmentLabel}: totals settled orders, payment mix, and top items.
              </CardDescription>
            </div>
            <div className="flex flex-wrap items-end gap-2">
              <div className="space-y-1">
                <Label htmlFor="outlet-report-date" className="text-xs">
                  Business date
                </Label>
                <Input
                  id="outlet-report-date"
                  type="date"
                  className="h-9 w-[160px]"
                  value={reportDate}
                  onChange={(e) => setReportDate(e.target.value)}
                />
              </div>
              <Button
                type="button"
                className="bg-amber-700 hover:bg-amber-800 gap-1.5"
                onClick={() => void runNightAudit()}
                disabled={running || isClosed}
              >
                {running ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Moon className="h-4 w-4" />
                )}
                Run night audit
              </Button>
              {display && (
                <Button type="button" variant="outline" size="sm" onClick={() => window.print()}>
                  <Printer className="h-4 w-4 mr-1" />
                  Print
                </Button>
              )}
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          {loading && (
            <p className="text-sm text-muted-foreground flex items-center gap-2">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading…
            </p>
          )}
          {!loading && isClosed && (
            <div className="flex items-center gap-2 text-sm text-green-800 bg-green-50 border border-green-200 rounded-md px-3 py-2">
              <CheckCircle2 className="h-4 w-4 shrink-0" />
              Night audit completed for {reportDate}. Report is locked for this date.
            </div>
          )}
          {!loading && !isClosed && !display && (
            <p className="text-sm text-muted-foreground">
              No report for this date yet. Run night audit after the outlet closes to save the day&apos;s sales summary.
            </p>
          )}
        </CardContent>
      </Card>

      {display && (
        <Card id="outlet-daily-report-print" className="print:shadow-none print:border">
          <CardHeader className="pb-2">
            <CardTitle className="text-lg">
              {departmentLabel} — Daily report
            </CardTitle>
            <CardDescription>
              Business date {format(parseISO(`${display.report_date}T12:00:00`), 'EEEE, d MMMM yyyy')}
              {saved?.created_at && (
                <> · Closed {format(parseISO(saved.created_at), 'dd MMM yyyy · HH:mm')}</>
              )}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="rounded-lg border p-3">
                <p className="text-xs text-muted-foreground">Gross sales</p>
                <p className="text-2xl font-bold">{formatNaira(display.gross_sales)}</p>
              </div>
              <div className="rounded-lg border p-3">
                <p className="text-xs text-muted-foreground">Settled orders</p>
                <p className="text-2xl font-bold">{display.order_count}</p>
              </div>
              <div className="rounded-lg border p-3">
                <p className="text-xs text-muted-foreground">Voided</p>
                <p className="text-2xl font-bold">{display.void_count}</p>
              </div>
            </div>

            <div>
              <h4 className="text-sm font-semibold mb-2">Payment breakdown</h4>
              <div className="flex flex-wrap gap-2">
                {Object.entries(display.payment_breakdown).map(([k, v]) => (
                  <Badge key={k} variant="secondary" className="text-sm py-1 px-2">
                    {PAYMENT_LABELS[k] ?? k}: {formatNaira(v)}
                  </Badge>
                ))}
                {Object.keys(display.payment_breakdown).length === 0 && (
                  <span className="text-sm text-muted-foreground">No settled sales</span>
                )}
              </div>
            </div>

            {display.top_items.length > 0 && (
              <div>
                <h4 className="text-sm font-semibold mb-2">Top items</h4>
                <div className="border rounded-lg overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-muted/50">
                      <tr>
                        <th className="text-left p-2">Item</th>
                        <th className="text-right p-2">Qty</th>
                        <th className="text-right p-2">Revenue</th>
                      </tr>
                    </thead>
                    <tbody>
                      {display.top_items.map((row) => (
                        <tr key={row.item_name} className="border-t">
                          <td className="p-2">{row.item_name}</td>
                          <td className="p-2 text-right tabular-nums">{row.qty}</td>
                          <td className="p-2 text-right font-medium">{formatNaira(row.revenue)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {display.summary.orders.length > 0 && (
              <div>
                <h4 className="text-sm font-semibold mb-2">Order detail</h4>
                <div className="border rounded-lg overflow-x-auto max-h-64">
                  <table className="w-full text-sm">
                    <thead className="bg-muted/50 sticky top-0">
                      <tr>
                        <th className="text-left p-2">Receipt</th>
                        <th className="text-left p-2">Time</th>
                        <th className="text-left p-2">Guest</th>
                        <th className="text-right p-2">Total</th>
                        <th className="text-left p-2">Pay</th>
                      </tr>
                    </thead>
                    <tbody>
                      {display.summary.orders.map((o) => (
                        <tr key={o.order_number} className="border-t">
                          <td className="p-2 font-mono text-xs">{o.order_number}</td>
                          <td className="p-2 text-muted-foreground">
                            {format(parseISO(o.time), 'HH:mm')}
                          </td>
                          <td className="p-2">{o.guest}</td>
                          <td className="p-2 text-right">{formatNaira(o.total)}</td>
                          <td className="p-2 text-xs">
                            {PAYMENT_LABELS[o.payment_method] ?? o.payment_method}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  )
}
