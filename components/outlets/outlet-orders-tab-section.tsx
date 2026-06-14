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
import {
  fetchOutletOrdersInRange,
  fetchOutletOrdersSearch,
} from '@/lib/outlets/fetch-outlet-orders'
import { formatNaira } from '@/lib/utils/currency'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent } from '@/components/ui/card'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { toast } from 'sonner'
import { Loader2, Printer, Search } from 'lucide-react'
import { useAuth } from '@/lib/auth-context'
import { hotelCalendarTodayYmd } from '@/lib/hotel-date'
import { canonicalRoleKey } from '@/lib/permissions'

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
  canManageOrders?: boolean
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
  canManageOrders,
  onPrintUnsettled,
  onPrintSettled,
  onSettled,
}: Props) {
  const { role } = useAuth()
  const roleKey = canonicalRoleKey(role)
  const canClearAllOrders =
    roleKey === 'admin' || roleKey === 'superadmin'
  const todayYmd = hotelCalendarTodayYmd()
  const [dateFrom, setDateFrom] = useState(todayYmd)
  const [dateTo, setDateTo] = useState(todayYmd)
  const [rangeOrders, setRangeOrders] = useState<OutletOrderRow[]>([])
  const [searchCatalogOrders, setSearchCatalogOrders] = useState<OutletOrderRow[]>([])
  const [loading, setLoading] = useState(false)
  const [searchLoading, setSearchLoading] = useState(false)
  const [printing, setPrinting] = useState(false)
  const [reportPrintKind, setReportPrintKind] = useState<'summary' | 'full'>('summary')
  const [hotelName, setHotelName] = useState('Hotel')
  const [orderSearch, setOrderSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [paymentFilter, setPaymentFilter] = useState<string>('all')
  const [orderTypeFilter, setOrderTypeFilter] = useState<string>('all')

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
          setRangeOrders([])
          return
        }
        setRangeOrders(rows)
      } catch {
        toast.error('Network error')
        setRangeOrders([])
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

  useEffect(() => {
    const q = orderSearch.trim()
    if (!active || !q) {
      setSearchCatalogOrders([])
      setSearchLoading(false)
      return
    }
    setSearchLoading(true)
    const timer = setTimeout(() => {
      void fetchOutletOrdersSearch(department, q).then(({ orders: rows, error }) => {
        if (error) {
          toast.error(error)
          setSearchCatalogOrders([])
        } else {
          setSearchCatalogOrders(rows)
        }
        setSearchLoading(false)
      })
    }, 280)
    return () => clearTimeout(timer)
  }, [active, department, orderSearch])

  const applyOrderFilters = useCallback(
    (list: OutletOrderRow[]) =>
      list.filter((o) => {
        if (statusFilter !== 'all' && o.status !== statusFilter) return false
        if (paymentFilter !== 'all') {
          const pay = o.is_complimentary ? 'complimentary' : String(o.payment_method || '')
          if (pay !== paymentFilter) return false
        }
        if (orderTypeFilter !== 'all' && o.order_type !== orderTypeFilter) return false
        return true
      }),
    [statusFilter, paymentFilter, orderTypeFilter],
  )

  const searching = Boolean(orderSearch.trim())
  const baseOrders = searching ? searchCatalogOrders : rangeOrders

  const filteredOrders = useMemo(
    () => applyOrderFilters(baseOrders),
    [baseOrders, applyOrderFilters],
  )

  const rangeFilteredForPrint = useMemo(
    () => applyOrderFilters(rangeOrders),
    [rangeOrders, applyOrderFilters],
  )

  const rangeSummary = useMemo(() => {
    const settled = filteredOrders.filter((o) => o.status === 'settled')
    const total = settled.reduce((s, o) => s + (Number(o.subtotal) || 0), 0)
    return {
      total: Math.round(total * 100) / 100,
      settledCount: settled.length,
      openCount: filteredOrders.filter((o) => o.status === 'open').length,
      allCount: filteredOrders.length,
      loadedCount: rangeOrders.length,
      searching,
    }
  }, [filteredOrders, rangeOrders.length, searching])

  const printSalesReport = () => {
    if (dateFrom > dateTo) {
      toast.error('Fix the date range first')
      return
    }
    setPrinting(true)
    try {
      if (reportPrintKind === 'summary') {
        const summary = buildOutletSalesSummaryReport(
          rangeFilteredForPrint,
          dateFrom,
          dateTo,
          department,
        )
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
        const report = buildOutletSalesReport(rangeFilteredForPrint, dateFrom, dateTo)
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

  const reloadOrders = useCallback(() => {
    void loadOrdersForRange(dateFrom, dateTo)
    const q = orderSearch.trim()
    if (q) {
      void fetchOutletOrdersSearch(department, q).then(({ orders: rows, error }) => {
        if (!error) setSearchCatalogOrders(rows)
      })
    }
  }, [dateFrom, dateTo, department, loadOrdersForRange, orderSearch])

  if (!active) {
    return (
      <p className="text-sm text-muted-foreground py-6 text-center">
        Open this tab to load orders.
      </p>
    )
  }

  return (
    <div className="space-y-2">
      <div className="overflow-x-auto -mx-1 px-1">
        <div className="flex flex-nowrap items-center gap-1 min-w-max pb-0.5">
          <div className="relative shrink-0 w-[168px]">
            <Search className="absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground pointer-events-none" />
            <Input
              id="outlet-orders-search"
              className="h-8 pl-7 text-xs"
              title="Search all dates — guest, room, receipt #"
              placeholder="Search…"
              value={orderSearch}
              onChange={(e) => setOrderSearch(e.target.value)}
            />
          </div>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="h-8 w-[92px] text-xs shrink-0" title="Status">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All status</SelectItem>
              <SelectItem value="open">Unsettled</SelectItem>
              <SelectItem value="settled">Settled</SelectItem>
              <SelectItem value="void">Void</SelectItem>
            </SelectContent>
          </Select>
          <Select value={paymentFilter} onValueChange={setPaymentFilter}>
            <SelectTrigger className="h-8 w-[92px] text-xs shrink-0" title="Payment">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All pay</SelectItem>
              <SelectItem value="cash">Cash</SelectItem>
              <SelectItem value="pos">POS</SelectItem>
              <SelectItem value="transfer">Transfer</SelectItem>
              <SelectItem value="card">Card</SelectItem>
              <SelectItem value="city_ledger">City ledger</SelectItem>
              <SelectItem value="room_charge">Room charge</SelectItem>
              <SelectItem value="complimentary">Complimentary</SelectItem>
            </SelectContent>
          </Select>
          <Select value={orderTypeFilter} onValueChange={setOrderTypeFilter}>
            <SelectTrigger className="h-8 w-[96px] text-xs shrink-0" title="Order type">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All types</SelectItem>
              <SelectItem value="dine_in">Dine in</SelectItem>
              <SelectItem value="takeaway">Takeaway</SelectItem>
              <SelectItem value="room_service">Room service</SelectItem>
              <SelectItem value="walk_in">Walk in</SelectItem>
            </SelectContent>
          </Select>
          <Input
            id="outlet-orders-from"
            type="date"
            className="h-8 w-[118px] text-xs shrink-0"
            title="From date"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
          />
          <span className="text-muted-foreground text-xs shrink-0">–</span>
          <Input
            id="outlet-orders-to"
            type="date"
            className="h-8 w-[118px] text-xs shrink-0"
            title="To date"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
          />
          {(loading || searchLoading) && (
            <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground shrink-0" />
          )}
          <Select
            value={reportPrintKind}
            onValueChange={(v) => setReportPrintKind(v as 'summary' | 'full')}
          >
            <SelectTrigger className="h-8 w-[108px] text-xs shrink-0" title="Report type">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="summary">Summary</SelectItem>
              <SelectItem value="full">Full report</SelectItem>
            </SelectContent>
          </Select>
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="h-8 px-2 text-xs gap-1 shrink-0"
            title="Print sales report for date range"
            onClick={printSalesReport}
            disabled={printing || loading || rangeFilteredForPrint.length === 0}
          >
            {printing ? <Loader2 className="h-3 w-3 animate-spin" /> : <Printer className="h-3 w-3" />}
            Print
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-8 px-2 text-xs shrink-0"
            onClick={applyToday}
          >
            Today
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-8 px-2 text-xs shrink-0"
            onClick={applyLast7Days}
          >
            7 days
          </Button>
        </div>
      </div>
      {(searching || searchLoading) && (
        <p className="text-[10px] text-muted-foreground -mt-1">
          {searchLoading ? 'Searching all orders…' : 'Search spans all dates · print uses range above'}
        </p>
      )}

      <Card>
        <CardContent className="px-3 py-2 flex flex-wrap gap-4 text-sm">
          <span>
            <span className="text-muted-foreground">Showing:</span>{' '}
            <strong>{rangeSummary.allCount}</strong>
            {rangeSummary.searching ? (
              <span className="text-muted-foreground"> · all dates</span>
            ) : rangeSummary.allCount !== rangeSummary.loadedCount ? (
              <span className="text-muted-foreground"> of {rangeSummary.loadedCount}</span>
            ) : null}{' '}
            orders
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

      {loading && !searching ? (
        <p className="text-sm text-muted-foreground flex items-center gap-2 py-8 justify-center">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading orders…
        </p>
      ) : searchLoading && searching ? (
        <p className="text-sm text-muted-foreground flex items-center gap-2 py-8 justify-center">
          <Loader2 className="h-4 w-4 animate-spin" />
          Searching all orders…
        </p>
      ) : (
        <OutletOrdersPanel
          orders={filteredOrders}
          organizationId={organizationId}
          department={department}
          departmentLabel={departmentLabel}
          canPrintReceipt={canPrintReceipt}
          canSell={canSell}
          canManageOrders={canManageOrders}
          canClearAllOrders={canClearAllOrders}
          showTodaySummary={false}
          onPrintUnsettled={onPrintUnsettled}
          onPrintSettled={onPrintSettled}
          onSettled={() => {
            reloadOrders()
            onSettled?.()
          }}
          onOrdersChanged={() => {
            reloadOrders()
            onSettled?.()
          }}
        />
      )}
    </div>
  )
}
