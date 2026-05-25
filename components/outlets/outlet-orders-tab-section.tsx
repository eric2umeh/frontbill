'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { format, parseISO, subDays } from 'date-fns'
import type { OutletDepartmentKey } from '@/lib/outlets/departments'
import type { OutletOrderRow } from '@/lib/outlets/types'
import { buildOutletSalesReport } from '@/lib/outlets/outlet-sales-report'
import { buildOutletSalesSummaryReport } from '@/lib/outlets/outlet-sales-summary-report'
import { printOutletSalesReport } from '@/lib/receipts/outlet-sales-report-print'
import { printOutletSalesSummaryReport } from '@/lib/receipts/outlet-sales-summary-print'
import { OutletOrdersPanel } from '@/components/outlets/outlet-orders-panel'
import { fetchOutletOrdersInRange } from '@/lib/outlets/fetch-outlet-orders'
import { formatNaira } from '@/lib/utils/currency'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent } from '@/components/ui/card'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { toast } from 'sonner'
import { Loader2, Printer } from 'lucide-react'
import { hotelCalendarTodayYmd } from '@/lib/hotel-date'

type Props = {
  department: OutletDepartmentKey
  departmentLabel: string
  organizationId: string
  /** Load orders only when this tab is visible (avoids API cost on other tabs). */
  active: boolean
  /** Bump to reload after a new sale or settlement from POS. */
  refreshToken?: number
  staffName?: string
  canPrintReceipt?: boolean
  canSell?: boolean
  onPrintUnsettled?: (order: OutletOrderRow) => void
  onPrintSettled?: (order: OutletOrderRow) => void
  onSettled?: () => void
}

export function OutletOrdersTabSection({
  department,
  departmentLabel,
  organizationId,
  active,
  refreshToken = 0,
  staffName = 'Staff',
  canPrintReceipt,
  canSell,
  onPrintUnsettled,
  onPrintSettled,
  onSettled,
}: Props) {
  const todayYmd = hotelCalendarTodayYmd()
  const [dateFrom, setDateFrom] = useState(todayYmd)
  const [dateTo, setDateTo] = useState(todayYmd)
  const [orders, setOrders] = useState<OutletOrderRow[]>([])
  const [loading, setLoading] = useState(false)
  const [printing, setPrinting] = useState(false)
  const [reportPrintKind, setReportPrintKind] = useState<'summary' | 'full'>('summary')
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

  const loadOrdersForRange = useCallback(
    async (from: string, to: string) => {
      if (!from || !to) return
      if (from > to) {
        toast.error('Start date must be on or before end date')
        return
      }
      setLoading(true)
      try {
        const { orders: rows, error } = await fetchOutletOrdersInRange(department, from, to)
        if (error) {
          toast.error(error)
          setOrders([])
          return
        }
        setOrders(rows)
      } catch {
        toast.error('Network error')
        setOrders([])
      } finally {
        setLoading(false)
      }
    },
    [department],
  )

  useEffect(() => {
    if (!active || !dateFrom || !dateTo) return
    const timer = setTimeout(() => {
      void loadOrdersForRange(dateFrom, dateTo)
    }, 300)
    return () => clearTimeout(timer)
  }, [active, dateFrom, dateTo, refreshToken, loadOrdersForRange])

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
      if (reportPrintKind === 'summary') {
        const summary = buildOutletSalesSummaryReport(orders, dateFrom, dateTo, department)
        if (summary.settledOrderCount === 0 && summary.openBillCount === 0) {
          toast.error('No orders in this date range')
          return
        }
        printOutletSalesSummaryReport({
          hotelName,
          printedBy: staffName.trim() || 'Staff',
          report: summary,
        })
      } else {
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
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not print report')
    } finally {
      setPrinting(false)
    }
  }

  const applyToday = () => {
    setDateFrom(todayYmd)
    setDateTo(todayYmd)
  }

  const applyLast7Days = () => {
    const from = format(subDays(parseISO(todayYmd), 6), 'yyyy-MM-dd')
    setDateFrom(from)
    setDateTo(todayYmd)
  }

  if (!active) {
    return (
      <p className="text-sm text-muted-foreground py-6 text-center">
        Open this tab to load orders.
      </p>
    )
  }

  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground">
        Shows today&apos;s orders by default. Changing the date range reloads the list automatically.
        Print summary shows payment-method totals (like night audit). Print full lists every settled
        receipt with payment method, guest, and line items.
      </p>

      <div className="flex flex-wrap items-end gap-3">
        <div className="space-y-1">
          <Label htmlFor="outlet-orders-from" className="text-xs">
            From
          </Label>
          <Input
            id="outlet-orders-from"
            type="date"
            className="h-9 w-[150px]"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="outlet-orders-to" className="text-xs">
            To
          </Label>
          <Input
            id="outlet-orders-to"
            type="date"
            className="h-9 w-[150px]"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
          />
        </div>
        {loading && (
          <div className="flex h-9 items-center gap-1.5 text-xs text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading…
          </div>
        )}
        <Select value={reportPrintKind} onValueChange={(v) => setReportPrintKind(v as 'summary' | 'full')}>
          <SelectTrigger className="h-9 w-[200px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="summary">Print summary sales report</SelectItem>
            <SelectItem value="full">Print full sales report</SelectItem>
          </SelectContent>
        </Select>
        <Button
          type="button"
          size="sm"
          className="h-9 gap-1.5"
          onClick={printSalesReport}
          disabled={printing || loading || orders.length === 0}
        >
          {printing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Printer className="h-4 w-4" />}
          Print
        </Button>
        <div className="flex gap-2">
          <Button type="button" variant="ghost" size="sm" className="h-9 text-xs" onClick={applyToday}>
            Today
          </Button>
          <Button type="button" variant="ghost" size="sm" className="h-9 text-xs" onClick={applyLast7Days}>
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
          organizationId={organizationId}
          departmentLabel={departmentLabel}
          canPrintReceipt={canPrintReceipt}
          canSell={canSell}
          showTodaySummary={false}
          onPrintUnsettled={onPrintUnsettled}
          onPrintSettled={onPrintSettled}
          onSettled={() => {
            void loadOrdersForRange(dateFrom, dateTo)
            onSettled?.()
          }}
        />
      )}
    </div>
  )
}
