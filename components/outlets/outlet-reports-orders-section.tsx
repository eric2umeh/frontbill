'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { format, parseISO, startOfDay, endOfDay, subDays } from 'date-fns'
import type { OutletDepartmentKey } from '@/lib/outlets/departments'
import type { OutletOrderRow } from '@/lib/outlets/types'
import { buildOutletSalesReport } from '@/lib/outlets/outlet-sales-report'
import { printOutletSalesReport } from '@/lib/receipts/outlet-sales-report-print'
import { OutletOrdersPanel } from '@/components/outlets/outlet-orders-panel'
import { outletApiHeaders } from '@/lib/outlets/outlet-api-headers'
import { formatNaira } from '@/lib/utils/currency'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent } from '@/components/ui/card'
import { toast } from 'sonner'
import { Loader2, Printer, RefreshCw } from 'lucide-react'
import { nightAuditClosingDateYmd } from '@/lib/hotel-date'

type Props = {
  department: OutletDepartmentKey
  departmentLabel: string
  organizationId: string
  canPrintReceipt?: boolean
  canSell?: boolean
  onPrintUnsettled?: (order: OutletOrderRow) => void
  onPrintSettled?: (order: OutletOrderRow) => void
  onSettled?: () => void
}

export function OutletReportsOrdersSection({
  department,
  departmentLabel,
  organizationId,
  canPrintReceipt,
  canSell,
  onPrintUnsettled,
  onPrintSettled,
  onSettled,
}: Props) {
  const todayYmd = nightAuditClosingDateYmd()
  const [dateFrom, setDateFrom] = useState(todayYmd)
  const [dateTo, setDateTo] = useState(todayYmd)
  const [orders, setOrders] = useState<OutletOrderRow[]>([])
  const [loading, setLoading] = useState(false)
  const [printing, setPrinting] = useState(false)
  const [hotelName, setHotelName] = useState('Hotel')

  useEffect(() => {
    if (!organizationId) return
    const supabase = createClient()
    if (!supabase) return
    void supabase
      .from('organizations')
      .select('name')
      .eq('id', organizationId)
      .maybeSingle()
      .then(({ data }) => {
        if (data?.name) setHotelName(String(data.name).trim())
      })
  }, [organizationId])

  const loadOrders = useCallback(async () => {
    if (!dateFrom || !dateTo) return
    if (dateFrom > dateTo) {
      toast.error('Start date must be on or before end date')
      return
    }
    setLoading(true)
    try {
      const fromIso = startOfDay(parseISO(dateFrom)).toISOString()
      const toIso = endOfDay(parseISO(dateTo)).toISOString()
      const qs = new URLSearchParams({
        department,
        from: fromIso,
        to: toIso,
      })
      const res = await fetch(`/api/outlets/orders?${qs}`, {
        headers: await outletApiHeaders(),
        credentials: 'include',
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) {
        toast.error(json.error || 'Could not load orders')
        setOrders([])
        return
      }
      setOrders((json.orders as OutletOrderRow[]) ?? [])
    } catch {
      toast.error('Network error')
      setOrders([])
    } finally {
      setLoading(false)
    }
  }, [department, dateFrom, dateTo])

  useEffect(() => {
    void loadOrders()
  }, [loadOrders])

  const rangeSummary = useMemo(() => {
    const settled = orders.filter((o) => o.status === 'settled')
    const total = settled.reduce((s, o) => s + (Number(o.subtotal) || 0), 0)
    return {
      total: Math.round(total * 100) / 100,
      settledCount: settled.length,
      openCount: orders.filter((o) => o.status === 'open').length,
      allCount: orders.length,
    }
  }, [orders])

  const printSalesReport = () => {
    if (dateFrom > dateTo) {
      toast.error('Fix the date range first')
      return
    }
    setPrinting(true)
    try {
      const report = buildOutletSalesReport(orders, dateFrom, dateTo)
      if (report.settledOrderCount === 0 && report.openOrders.length === 0) {
        toast.error('No orders in this date range')
        return
      }
      printOutletSalesReport({
        hotelName,
        departmentLabel,
        report,
      })
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not print report')
    } finally {
      setPrinting(false)
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end gap-3">
        <div className="space-y-1">
          <Label htmlFor="outlet-report-from" className="text-xs">
            From
          </Label>
          <Input
            id="outlet-report-from"
            type="date"
            className="h-9 w-[150px]"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="outlet-report-to" className="text-xs">
            To
          </Label>
          <Input
            id="outlet-report-to"
            type="date"
            className="h-9 w-[150px]"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
          />
        </div>
        <Button type="button" variant="outline" size="sm" className="h-9" onClick={() => void loadOrders()} disabled={loading}>
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4 mr-1" />}
          Apply
        </Button>
        <Button
          type="button"
          size="sm"
          className="h-9 gap-1.5"
          onClick={printSalesReport}
          disabled={printing || loading || orders.length === 0}
        >
          {printing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Printer className="h-4 w-4" />}
          Print sales report
        </Button>
        <div className="flex gap-2">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-9 text-xs"
            onClick={() => {
              const d = todayYmd
              setDateFrom(d)
              setDateTo(d)
            }}
          >
            Today
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-9 text-xs"
            onClick={() => {
              const d = format(subDays(parseISO(todayYmd), 6), 'yyyy-MM-dd')
              setDateFrom(d)
              setDateTo(todayYmd)
            }}
          >
            Last 7 days
          </Button>
        </div>
      </div>

      <Card>
        <CardContent className="px-3 py-2 flex flex-wrap gap-4 text-sm">
          <span>
            <span className="text-muted-foreground">In range:</span>{' '}
            <strong>{rangeSummary.allCount}</strong> orders
          </span>
          <span>
            <span className="text-muted-foreground">Settled:</span>{' '}
            <strong>{rangeSummary.settledCount}</strong> · {formatNaira(rangeSummary.total)}
          </span>
          <span>
            <span className="text-muted-foreground">Open bills:</span>{' '}
            <strong>{rangeSummary.openCount}</strong>
          </span>
        </CardContent>
      </Card>

      {loading ? (
        <p className="text-sm text-muted-foreground flex items-center gap-2 py-8 justify-center">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading orders…
        </p>
      ) : (
        <OutletOrdersPanel
          orders={orders}
          canPrintReceipt={canPrintReceipt}
          canSell={canSell}
          showTodaySummary={false}
          onPrintUnsettled={onPrintUnsettled}
          onPrintSettled={onPrintSettled}
          onSettled={() => {
            void loadOrders()
            onSettled?.()
          }}
        />
      )}
    </div>
  )
}
