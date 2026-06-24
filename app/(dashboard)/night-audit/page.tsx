'use client'

import { useState, useEffect } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import { formatNaira } from '@/lib/utils/currency'
import { usePageData } from '@/hooks/use-page-data'
import { useAuth } from '@/lib/auth-context'
import { hasPermission } from '@/lib/permissions'
import { 
  CheckCircle2, AlertTriangle, TrendingUp, Users,
  Bed, DollarSign, Clock, Play, Loader2, Sparkles, ClipboardList, Search,
  CalendarClock, DoorOpen, Percent, CalendarRange,
} from 'lucide-react'
import { toast } from 'sonner'
import { BackdateRequestsTab } from '@/components/night-audit/backdate-requests-tab'
import { RoomChangeRequestsTab } from '@/components/night-audit/room-change-requests-tab'
import { RescheduleStayRequestsTab } from '@/components/night-audit/reschedule-stay-requests-tab'
import { ExtendStayDiscountTab } from '@/components/night-audit/extend-stay-discount-tab'
import { useNightAuditPendingCounts } from '@/hooks/use-night-audit-pending-counts'
import { LoadingSpinner } from '@/components/loading-screen'
import { PaginatedListShell } from '@/components/shared/paginated-list-shell'
import {
  formatHotelDateDisplayGB,
  nightAuditClosingDateYmd,
  nightAuditNextBusinessDateYmd,
} from '@/lib/hotel-date'

interface AuditTrailLog {
  id: string
  source: string
  category: string
  action: string
  status: string
  actor_name: string
  reference: string
  description: string
  amount?: number | null
  created_at: string
  href?: string
}

export default function NightAuditPage() {
  const router = useRouter()
  const pathname = usePathname()
  const [auditTab, setAuditTab] = useState('expected-arrivals')
  const [auditRunning, setAuditRunning] = useState(false)
  const [auditComplete, setAuditComplete] = useState(false)
  const [closingDateYmd, setClosingDateYmd] = useState(() => nightAuditClosingDateYmd())
  const [rolledToYmd, setRolledToYmd] = useState<string | null>(null)
  const { initialLoading, startFetch, endFetch } = usePageData()
  const { organizationId, userId, role } = useAuth()
  const canRunNightAudit = hasPermission(role, 'night_audit:run')
  const [auditData, setAuditData] = useState<any>(null)
  const [aiSummary, setAiSummary] = useState<any>(null)
  const [aiLoading, setAiLoading] = useState(false)
  const [auditLogs, setAuditLogs] = useState<AuditTrailLog[]>([])
  const [logsLoading, setLogsLoading] = useState(false)
  const todayStr = new Date().toISOString().split('T')[0]
  const [logFilters, setLogFilters] = useState({
    startDate: todayStr,
    endDate: todayStr,
    type: 'all',
    status: 'all',
    search: '',
  })
  const canViewAuditTrails = hasPermission(role, 'audit_trails:view')
  const canApproveBackdates = hasPermission(role, 'backdate:approve')
  const canApproveRoomChanges = hasPermission(role, 'room_change:approve')
  const canApproveRescheduleStay = hasPermission(role, 'reschedule_stay:approve')
  const canApproveExtendDiscount = canApproveRoomChanges
  const pendingApprovals = useNightAuditPendingCounts()

  useEffect(() => {
    if (typeof window === 'undefined') return
    const q = new URLSearchParams(window.location.search).get('tab')
    if (q === 'backdate-requests' && canApproveBackdates && userId) setAuditTab('backdate-requests')
    if (q === 'room-change-requests' && canApproveRoomChanges && userId) setAuditTab('room-change-requests')
    if (q === 'extend-discount' && canApproveExtendDiscount && userId) setAuditTab('extend-discount')
    if (q === 'reschedule-stay-requests' && canApproveRescheduleStay && userId) setAuditTab('reschedule-stay-requests')
  }, [canApproveBackdates, canApproveRoomChanges, canApproveExtendDiscount, canApproveRescheduleStay, userId])

  const onAuditTabChange = (value: string) => {
    setAuditTab(value)
    if (typeof window === 'undefined') return
    const u = new URLSearchParams(window.location.search)
    if (value === 'backdate-requests') u.set('tab', 'backdate-requests')
    else if (value === 'room-change-requests') u.set('tab', 'room-change-requests')
    else if (value === 'extend-discount') u.set('tab', 'extend-discount')
    else if (value === 'reschedule-stay-requests') u.set('tab', 'reschedule-stay-requests')
    else u.delete('tab')
    const qs = u.toString()
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false })
  }

  const nextBusinessDateYmd = nightAuditNextBusinessDateYmd(closingDateYmd)

  useEffect(() => {
    setAuditComplete(false)
    setRolledToYmd(null)
    void fetchAuditData(closingDateYmd, nextBusinessDateYmd)
  }, [closingDateYmd, organizationId])

  useEffect(() => {
    if (canViewAuditTrails && userId) fetchAuditLogs()
  }, [canViewAuditTrails, userId])

  const fetchAuditData = async (closingDate: string, arrivalsDate: string) => {
    try {
      startFetch()
      const supabase = createClient()
      const emptyData = {
        occupancyRate: 0, totalRooms: 0, occupiedRooms: 0, totalRevenue: 0,
        revenues: { cash: 0, pos: 0, transfer: 0, cityLedger: 0 },
        pendingCheckouts: [], expectedArrivals: [], anomalies: []
      }
      if (!supabase) { setAuditData(emptyData); endFetch(); return }

      const [{ data: bookings }, { data: payments }, { data: allRooms }, { data: arrivals }] = await Promise.all([
        supabase
          .from('bookings')
          .select('*, rooms(id, room_number), guests:guest_id(name)')
          .eq('organization_id', organizationId)
          .eq('status', 'checked_in'),
        supabase
          .from('payments')
          .select('*')
          .eq('organization_id', organizationId)
          .gte('payment_date', `${closingDate}T00:00:00.000Z`)
          .lte('payment_date', `${closingDate}T23:59:59.999Z`),
        supabase
          .from('rooms')
          .select('id, room_number, status')
          .eq('organization_id', organizationId)
          .neq('status', 'maintenance'),
        supabase
          .from('bookings')
          .select('id, folio_id, guests:guest_id(name), rooms:room_id(room_number), check_in')
          .eq('organization_id', organizationId)
          .eq('status', 'reserved')
          .eq('check_in', arrivalsDate),
      ])

      const totalRooms = allRooms?.length || 0
      const occupiedRooms = bookings?.length || 0

      setAuditData({
        occupancyRate: totalRooms > 0 ? Math.round((occupiedRooms / totalRooms) * 100) : 0,
        totalRooms,
        occupiedRooms,
        totalRevenue: payments?.reduce((sum: number, p: any) => sum + p.amount, 0) || 0,
        revenues: {
          cash: payments?.filter((p: any) => p.payment_method === 'cash').reduce((sum: number, p: any) => sum + p.amount, 0) || 0,
          pos: payments?.filter((p: any) => p.payment_method === 'pos').reduce((sum: number, p: any) => sum + p.amount, 0) || 0,
          transfer: payments?.filter((p: any) => ['transfer', 'bank_transfer'].includes(p.payment_method)).reduce((sum: number, p: any) => sum + p.amount, 0) || 0,
          cityLedger: payments?.filter((p: any) => p.payment_method === 'city_ledger').reduce((sum: number, p: any) => sum + p.amount, 0) || 0,
        },
        pendingCheckouts: bookings?.filter((b: any) => String(b.check_out).slice(0, 10) === closingDate) || [],
        expectedArrivals: arrivals || [],
        anomalies: []
      })
    } catch (error: any) {
      console.error('Error fetching audit data:', error)
      setAuditData({ occupancyRate: 0, totalRooms: 0, occupiedRooms: 0, totalRevenue: 0, revenues: { cash: 0, pos: 0, transfer: 0, cityLedger: 0 }, pendingCheckouts: [], expectedArrivals: [], anomalies: [] })
    } finally {
      endFetch()
    }
  }

  const handleRunAudit = async () => {
    if (!canRunNightAudit || !userId) {
      toast.error('You do not have permission to run night audit')
      return
    }

    setAuditRunning(true)
    setAiSummary(null)
    toast.loading('Running night audit...', { id: 'audit' })

    try {
      const res = await fetch('/api/night-audit/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ caller_id: userId, audit_date: closingDateYmd }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Night audit failed')

      setAuditData(json.summary)
      setRolledToYmd(json.next_business_date)
      setAuditComplete(true)
      toast.success(
        `Night audit completed for ${formatHotelDateDisplayGB(json.closing_date)} – ${json.summary?.anomalies?.length || 0} anomal${(json.summary?.anomalies?.length || 0) === 1 ? 'y' : 'ies'}`,
        { id: 'audit' },
      )
    } catch (error: unknown) {
      console.error('Night audit error:', error)
      toast.error('Night audit failed: ' + (error instanceof Error ? error.message : 'Unknown error'), {
        id: 'audit',
      })
    } finally {
      setAuditRunning(false)
    }
  }

  const handleAiSummary = async () => {
    if (!auditData) return
    setAiLoading(true)
    try {
      const res = await fetch('/api/ai/night-audit-summary', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          date: closingDateYmd,
          dailyData: {
            checkouts: auditData.pendingCheckouts?.length || 0,
            checkIns: auditData.occupiedRooms || 0,
            occupancy: auditData.occupancyRate || 0,
            revenue: auditData.totalRevenue || 0,
            pendingCheckouts: auditData.pendingCheckouts?.length || 0,
            expectedArrivals: auditData.expectedArrivals?.length || 0,
            notes: auditData.anomalies?.length > 0
              ? `${auditData.anomalies.length} anomalies detected: ${auditData.anomalies.map((a: any) => a.type).join(', ')}`
              : 'No anomalies detected',
          },
        }),
      })
      const data = await res.json()
      if (data.error) throw new Error(data.error)
      setAiSummary(data.summary)
      toast.success('AI summary generated!')
    } catch (error: any) {
      toast.error('Failed to generate AI summary: ' + error.message)
    } finally {
      setAiLoading(false)
    }
  }

  const fetchAuditLogs = async () => {
    if (!canViewAuditTrails) return
    setLogsLoading(true)
    try {
      const params = new URLSearchParams({
        caller_id: userId,
        start_date: logFilters.startDate,
        end_date: logFilters.endDate,
        type: logFilters.type,
        status: logFilters.status,
        search: logFilters.search,
        limit: '100',
      })
      const res = await fetch(`/api/audit-trails?${params.toString()}`, { credentials: 'include' })
      const json = await res.json()
      if (!res.ok) { toast.error(json.error || 'Failed to load audit trails'); return }
      setAuditLogs(json.logs || [])
    } catch {
      toast.error('Failed to load audit trails')
    } finally {
      setLogsLoading(false)
    }
  }

  if (initialLoading) {
    return (
      <div className="flex items-center justify-center h-96">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    )
  }

  const auditDateLabel = formatHotelDateDisplayGB(closingDateYmd)
  const nextBusinessLabel = formatHotelDateDisplayGB(rolledToYmd || nextBusinessDateYmd)
  const occupancyPercent = auditData?.totalRooms ? Math.round((auditData.occupiedRooms / auditData.totalRooms) * 100) : 0

  const revenueRows = [
    { label: 'Cash', color: 'bg-green-500', value: auditData?.revenues?.cash || 0 },
    { label: 'POS', color: 'bg-blue-500', value: auditData?.revenues?.pos || 0 },
    { label: 'Transfer', color: 'bg-purple-500', value: auditData?.revenues?.transfer || 0 },
    { label: 'City Ledger', color: 'bg-amber-500', value: auditData?.revenues?.cityLedger || 0 },
  ]

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Night Audit</h1>
          <p className="text-muted-foreground">
            Close the previous business day (typical morning run) and roll the hotel date forward
          </p>
        </div>
        <div className="flex items-center gap-2">
          {auditComplete && (
            <Button
              variant="outline"
              onClick={handleAiSummary}
              disabled={aiLoading}
              className="gap-2"
            >
              {aiLoading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Sparkles className="h-4 w-4" />
              )}
              AI Summary
            </Button>
          )}
          <Button 
            size="lg" 
            onClick={() => void handleRunAudit()}
            disabled={auditRunning || auditComplete || !canRunNightAudit}
            className="gap-2"
          >
            {auditRunning ? (
              <>
                <Clock className="h-4 w-4 animate-spin" />
                Running Audit...
              </>
            ) : auditComplete ? (
              <>
                <CheckCircle2 className="h-4 w-4" />
                Audit Complete
              </>
            ) : (
              <>
                <Play className="h-4 w-4" />
                Run Night Audit
              </>
            )}
          </Button>
        </div>
      </div>

      <Card>
        <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-end">
          <div className="space-y-1.5 flex-1">
            <Label htmlFor="closing_date">Business date to close</Label>
            <Input
              id="closing_date"
              type="date"
              value={closingDateYmd}
              onChange={(e) => setClosingDateYmd(e.target.value)}
              disabled={auditComplete}
            />
            <p className="text-xs text-muted-foreground">
              Morning audit (before 6pm hotel time) defaults to yesterday — e.g. run on 16 May closes 15 May.
              Revenue and departures use this date; arrivals use {formatHotelDateDisplayGB(nextBusinessDateYmd)}.
            </p>
          </div>
          {!auditComplete && (
            <Button type="button" variant="outline" onClick={() => setClosingDateYmd(nightAuditClosingDateYmd())}>
              Reset to suggested date
            </Button>
          )}
        </CardContent>
      </Card>

      {auditComplete && (
        <Card className="border-green-200 bg-green-50">
          <CardContent className="flex items-center gap-3 p-4">
            <CheckCircle2 className="h-5 w-5 text-green-600" />
            <div>
              <p className="font-semibold text-green-900">Night audit completed for {auditDateLabel}</p>
              <p className="text-sm text-green-700">Hotel business date is now {nextBusinessLabel}</p>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Occupancy Rate
            </CardTitle>
            <Bed className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{occupancyPercent}%</div>
            <p className="text-xs text-muted-foreground mt-1">
              {auditData?.occupiedRooms || 0} of {auditData?.totalRooms || 0} rooms occupied
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Total Revenue
            </CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatNaira(auditData?.totalRevenue || 0)}</div>
            <p className="text-xs text-green-600 mt-1 flex items-center gap-1">
              <TrendingUp className="h-3 w-3" />
              Revenue on {auditDateLabel}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Pending Checkouts
            </CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{auditData?.pendingCheckouts?.length || 0}</div>
            <p className="text-xs text-muted-foreground mt-1">
              Expected departures
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Expected Arrivals
            </CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{auditData?.expectedArrivals?.length || 0}</div>
            <p className="text-xs text-muted-foreground mt-1">
              Confirmed reservations
            </p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Revenue Breakdown</CardTitle>
          <CardDescription>Payment method distribution for {auditDateLabel}</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {revenueRows.map((row) => (
              <div key={row.label} className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className={`h-2 w-2 rounded-full ${row.color}`} />
                  <span className="text-sm font-medium">{row.label}</span>
                </div>
                <div className="flex items-center gap-4">
                  <div className="text-sm text-muted-foreground">
                    {auditData?.totalRevenue ? ((row.value / auditData.totalRevenue) * 100).toFixed(1) : 0}%
                  </div>
                  <div className="font-semibold">{formatNaira(row.value)}</div>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <Tabs value={auditTab} onValueChange={onAuditTabChange} className="space-y-4">
        <TabsList className="flex flex-wrap h-auto">
          <TabsTrigger value="expected-arrivals">Expected Arrivals</TabsTrigger>
          <TabsTrigger value="pending-checkouts">Pending Checkouts</TabsTrigger>
          {canViewAuditTrails && <TabsTrigger value="audit-trails">Audit Trails</TabsTrigger>}
          {canApproveBackdates && !!userId && (
            <TabsTrigger value="backdate-requests" className="gap-1.5">
              <CalendarClock className="h-3.5 w-3.5" />
              Backdate Requests
              {pendingApprovals.backdate > 0 && (
                <Badge variant="destructive" className="h-5 min-w-5 rounded-full px-1.5 text-[11px] tabular-nums">
                  {pendingApprovals.backdate > 99 ? '99+' : pendingApprovals.backdate}
                </Badge>
              )}
            </TabsTrigger>
          )}
          {canApproveRoomChanges && !!userId && (
            <TabsTrigger value="room-change-requests" className="gap-1.5">
              <DoorOpen className="h-3.5 w-3.5" />
              Room Changes
              {pendingApprovals.room_change > 0 && (
                <Badge variant="destructive" className="h-5 min-w-5 rounded-full px-1.5 text-[11px] tabular-nums">
                  {pendingApprovals.room_change > 99 ? '99+' : pendingApprovals.room_change}
                </Badge>
              )}
            </TabsTrigger>
          )}
          {canApproveExtendDiscount && !!userId && (
            <TabsTrigger value="extend-discount" className="gap-1.5">
              <Percent className="h-3.5 w-3.5" />
              Extend discounts
              {pendingApprovals.extend_discount > 0 && (
                <Badge variant="destructive" className="h-5 min-w-5 rounded-full px-1.5 text-[11px] tabular-nums">
                  {pendingApprovals.extend_discount > 99 ? '99+' : pendingApprovals.extend_discount}
                </Badge>
              )}
            </TabsTrigger>
          )}
          {canApproveRescheduleStay && !!userId && (
            <TabsTrigger value="reschedule-stay-requests" className="gap-1.5">
              <CalendarRange className="h-3.5 w-3.5" />
              Move dates
              {pendingApprovals.reschedule_stay > 0 && (
                <Badge variant="destructive" className="h-5 min-w-5 rounded-full px-1.5 text-[11px] tabular-nums">
                  {pendingApprovals.reschedule_stay > 99 ? '99+' : pendingApprovals.reschedule_stay}
                </Badge>
              )}
            </TabsTrigger>
          )}
        </TabsList>

        <TabsContent value="expected-arrivals">
          <Card>
            <CardHeader>
              <CardTitle>Expected Arrivals</CardTitle>
              <CardDescription>Reservations arriving today</CardDescription>
            </CardHeader>
            <CardContent>
              <PaginatedListShell
                items={auditData?.expectedArrivals || []}
                pageSize={10}
                searchPlaceholder="Search folio, guest, room…"
                searchMatch={(b: any, query) => {
                  const q = query.trim().toLowerCase()
                  return [
                    b.folio_id,
                    b.id,
                    b.guests?.name,
                    b.rooms?.room_number,
                    b.check_in,
                  ]
                    .filter(Boolean)
                    .some((value) => String(value).toLowerCase().includes(q))
                }}
                emptyMessage="No expected arrivals for today."
              >
                {(pageRows) => (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Folio ID</TableHead>
                        <TableHead>Guest Name</TableHead>
                        <TableHead>Room</TableHead>
                        <TableHead>Check-in Date</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {pageRows.map((b: any) => (
                        <TableRow
                          key={b.id}
                          className="cursor-pointer"
                          onClick={() => router.push(`/bookings/${b.id}`)}
                        >
                          <TableCell className="font-mono text-xs">
                            {b.folio_id || b.id.slice(0, 8)}
                          </TableCell>
                          <TableCell>{b.guests?.name || '—'}</TableCell>
                          <TableCell>{b.rooms?.room_number || '—'}</TableCell>
                          <TableCell>{b.check_in}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </PaginatedListShell>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="pending-checkouts">
        <Card>
          <CardHeader>
            <CardTitle>Pending Checkouts</CardTitle>
            <CardDescription>Guests expected to depart today</CardDescription>
          </CardHeader>
          <CardContent>
              <PaginatedListShell
                items={auditData?.pendingCheckouts || []}
                pageSize={10}
                searchPlaceholder="Search folio, guest, room…"
                filters={[
                  {
                    key: 'balance',
                    label: 'Balance',
                    options: [
                      { value: 'due', label: 'Balance due' },
                      { value: 'settled', label: 'Settled' },
                    ],
                  },
                ]}
                searchMatch={(b: any, query) => {
                  const q = query.trim().toLowerCase()
                  return [
                    b.folio_id,
                    b.booking_number,
                    b.id,
                    b.guests?.name,
                    b.rooms?.room_number,
                    b.check_out,
                  ]
                    .filter(Boolean)
                    .some((value) => String(value).toLowerCase().includes(q))
                }}
                filterMatch={(b: any, key, value) => {
                  if (key === 'balance') {
                    const balance = Number(b.balance || 0)
                    return value === 'due' ? balance > 0 : balance <= 0
                  }
                  return undefined
                }}
                emptyMessage="No pending checkouts for today."
              >
                {(pageRows) => (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Folio ID</TableHead>
                        <TableHead>Guest Name</TableHead>
                        <TableHead>Room</TableHead>
                        <TableHead>Check-out Date</TableHead>
                        <TableHead className="text-right">Balance</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {pageRows.map((b: any) => (
                        <TableRow
                          key={b.id}
                          className="cursor-pointer"
                          onClick={() => router.push(`/bookings/${b.id}`)}
                        >
                          <TableCell className="font-mono text-xs">
                            {b.folio_id || b.booking_number || b.id.slice(0, 8)}
                          </TableCell>
                          <TableCell>{b.guests?.name || '—'}</TableCell>
                          <TableCell>{b.rooms?.room_number || '—'}</TableCell>
                          <TableCell>{b.check_out}</TableCell>
                          <TableCell className="text-right">{formatNaira(b.balance || 0)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </PaginatedListShell>
          </CardContent>
        </Card>
        </TabsContent>

        {canViewAuditTrails ? (
          <TabsContent value="audit-trails">
        <Card>
          <CardHeader>
                <div className="flex items-center gap-2">
                  <ClipboardList className="h-5 w-5 text-muted-foreground" />
                  <CardTitle>Audit Trails</CardTitle>
                </div>
                <CardDescription>Filtered logs for requests, bookings, transactions, payments and night audits.</CardDescription>
          </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid gap-3 md:grid-cols-6">
                  <div className="space-y-1">
                    <Label>From</Label>
                    <Input
                      type="date"
                      value={logFilters.startDate}
                      onChange={(e) => setLogFilters(prev => ({ ...prev, startDate: e.target.value }))}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label>To</Label>
                    <Input
                      type="date"
                      value={logFilters.endDate}
                      onChange={(e) => setLogFilters(prev => ({ ...prev, endDate: e.target.value }))}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label>Type</Label>
                    <Select value={logFilters.type} onValueChange={(value) => setLogFilters(prev => ({ ...prev, type: value }))}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All Logs</SelectItem>
                        <SelectItem value="backdate">Backdate Requests</SelectItem>
                        <SelectItem value="room_change">Room change requests</SelectItem>
                        <SelectItem value="reschedule_stay">Move stay dates</SelectItem>
                        <SelectItem value="booking">Bookings/Reservations</SelectItem>
                        <SelectItem value="payment">Payments</SelectItem>
                        <SelectItem value="transaction">Transactions</SelectItem>
                        <SelectItem value="night_audit">Night Audits</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <Label>Status</Label>
                    <Select value={logFilters.status} onValueChange={(value) => setLogFilters(prev => ({ ...prev, status: value }))}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All Statuses</SelectItem>
                        <SelectItem value="pending">Pending</SelectItem>
                        <SelectItem value="approved">Approved</SelectItem>
                        <SelectItem value="rejected">Rejected</SelectItem>
                        <SelectItem value="confirmed">Confirmed</SelectItem>
                        <SelectItem value="reserved">Reserved</SelectItem>
                        <SelectItem value="paid">Paid</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1 md:col-span-2">
                    <Label>Search</Label>
                    <div className="flex gap-2">
                      <div className="relative flex-1">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                        <Input
                          className="pl-9"
                          placeholder="Actor, guest, reference..."
                          value={logFilters.search}
                          onChange={(e) => setLogFilters(prev => ({ ...prev, search: e.target.value }))}
                        />
                      </div>
                      <Button onClick={fetchAuditLogs} disabled={logsLoading}>
                        {logsLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Filter'}
                      </Button>
                    </div>
                  </div>
                </div>

                {logsLoading ? (
                  <div className="flex justify-center py-10" role="status" aria-label="Loading audit trails">
                    <LoadingSpinner size="lg" />
                  </div>
                ) : (
                  <PaginatedListShell
                    items={auditLogs}
                    pageSize={15}
                    hideSearch
                    emptyMessage="No audit logs found for the selected filters."
                  >
                    {(pageLogs) => (
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Time</TableHead>
                            <TableHead>Type</TableHead>
                            <TableHead>Activity</TableHead>
                            <TableHead>Actor</TableHead>
                            <TableHead>Reference</TableHead>
                            <TableHead>Status</TableHead>
                            <TableHead className="text-right">Amount</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {pageLogs.map((log) => (
                            <TableRow
                              key={`${log.source}-${log.id}`}
                              className={log.href ? 'cursor-pointer' : ''}
                              onClick={() => log.href && router.push(log.href)}
                            >
                              <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                                {new Date(log.created_at).toLocaleString('en-GB')}
                              </TableCell>
                              <TableCell>
                                <Badge variant="outline">{log.category}</Badge>
                              </TableCell>
                              <TableCell>
                                <div className="font-medium text-sm">{log.action}</div>
                                <div className="text-xs text-muted-foreground line-clamp-1">{log.description}</div>
                              </TableCell>
                              <TableCell>{log.actor_name}</TableCell>
                              <TableCell className="font-mono text-xs">{log.reference}</TableCell>
                              <TableCell>
                                <Badge variant={['rejected', 'failed', 'variance'].includes(log.status) ? 'destructive' : 'secondary'}>
                                  {log.status}
                                </Badge>
                              </TableCell>
                              <TableCell className="text-right">
                                {log.amount ? formatNaira(log.amount) : '—'}
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    )}
                  </PaginatedListShell>
                )}
          </CardContent>
        </Card>
          </TabsContent>
        ) : null}

        {canApproveBackdates && userId ? (
          <TabsContent value="backdate-requests">
            <BackdateRequestsTab userId={userId} />
          </TabsContent>
        ) : null}

        {canApproveRoomChanges && userId ? (
          <TabsContent value="room-change-requests">
            <RoomChangeRequestsTab userId={userId} />
          </TabsContent>
        ) : null}

        {canApproveExtendDiscount && userId ? (
          <TabsContent value="extend-discount">
            <ExtendStayDiscountTab userId={userId} />
          </TabsContent>
        ) : null}

        {canApproveRescheduleStay && userId ? (
          <TabsContent value="reschedule-stay-requests">
            <RescheduleStayRequestsTab userId={userId} />
          </TabsContent>
        ) : null}
      </Tabs>

      {auditData?.anomalies && auditData.anomalies.length > 0 && (
        <Card className="border-orange-200">
          <CardHeader>
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-orange-600" />
              <CardTitle>Anomalies Detected</CardTitle>
              <Badge variant="secondary">{auditData.anomalies.length}</Badge>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            {auditData.anomalies.map((anomaly: any, index: number) => (
              <div key={index} className="flex items-start justify-between p-3 bg-orange-50 rounded-lg">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <Badge variant={anomaly.severity === 'high' ? 'destructive' : 'secondary'}>
                      {anomaly.severity}
                    </Badge>
                    <span className="font-semibold text-sm">{anomaly.type}</span>
                  </div>
                  <p className="text-sm text-muted-foreground">{anomaly.description}</p>
                </div>
                {anomaly.bookingId && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => router.push(`/bookings/${anomaly.bookingId}`)}
                  >
                    View
                  </Button>
                )}
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {aiSummary && (
        <Card className="border-indigo-200">
          <CardHeader>
            <div className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-indigo-600" />
              <CardTitle>AI Night Audit Summary</CardTitle>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 md:grid-cols-3">
              <div>
                <p className="text-xs text-muted-foreground">Check-ins</p>
                <p className="text-lg font-semibold">{aiSummary.totalCheckIns}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Check-outs</p>
                <p className="text-lg font-semibold">{aiSummary.totalCheckouts}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Revenue</p>
                <p className="text-lg font-semibold">{aiSummary.dayRevenue}</p>
              </div>
            </div>

            {aiSummary.keyHighlights?.length > 0 && (
              <div>
                <p className="text-sm font-medium mb-1">Key Highlights</p>
                <ul className="list-disc list-inside text-sm text-muted-foreground space-y-1">
                  {aiSummary.keyHighlights.map((h: string, i: number) => (
                    <li key={i}>{h}</li>
                  ))}
                </ul>
              </div>
            )}

            {aiSummary.issues && aiSummary.issues.length > 0 && (
              <div>
                <p className="text-sm font-medium mb-1 text-orange-700">Issues</p>
                <ul className="list-disc list-inside text-sm text-orange-600 space-y-1">
                  {aiSummary.issues.map((issue: string, i: number) => (
                    <li key={i}>{issue}</li>
                  ))}
                </ul>
              </div>
            )}

            {aiSummary.recommendations?.length > 0 && (
              <div>
                <p className="text-sm font-medium mb-1">Recommendations</p>
                <ul className="list-disc list-inside text-sm text-muted-foreground space-y-1">
                  {aiSummary.recommendations.map((r: string, i: number) => (
                    <li key={i}>{r}</li>
                  ))}
                </ul>
              </div>
            )}

            {aiSummary.staffNotes && (
              <div className="p-3 bg-indigo-50 rounded-lg">
                <p className="text-sm font-medium mb-1">Staff Notes</p>
                <p className="text-sm text-muted-foreground">{aiSummary.staffNotes}</p>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  )
}
