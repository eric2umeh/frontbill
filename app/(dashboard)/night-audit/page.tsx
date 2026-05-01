'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
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
  CalendarClock,
} from 'lucide-react'
import { toast } from 'sonner'
import { BackdateRequestsTab } from '@/components/night-audit/backdate-requests-tab'

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
  const [auditRunning, setAuditRunning] = useState(false)
  const [auditComplete, setAuditComplete] = useState(false)
  const { initialLoading, startFetch, endFetch } = usePageData()
  const { organizationId, userId, role } = useAuth()
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

  useEffect(() => {
    fetchAuditData()
  }, [])

  useEffect(() => {
    if (canViewAuditTrails && userId) fetchAuditLogs()
  }, [canViewAuditTrails, userId])

  const fetchAuditData = async () => {
    try {
      startFetch()
      const supabase = createClient()
      const emptyData = {
        occupancyRate: 0, totalRooms: 0, occupiedRooms: 0, totalRevenue: 0,
        revenues: { cash: 0, pos: 0, transfer: 0, cityLedger: 0 },
        pendingCheckouts: [], expectedArrivals: [], anomalies: []
      }
      if (!supabase) { setAuditData(emptyData); endFetch(); return }

      const today = new Date().toISOString().split('T')[0]

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
          .gte('payment_date', today),
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
          .eq('check_in', today),
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
        pendingCheckouts: bookings?.filter((b: any) => b.check_out === today) || [],
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
    setAuditRunning(true)
    setAiSummary(null)
    toast.loading('Running night audit...', { id: 'audit' })

    try {
      const supabase = createClient()
      if (!supabase) {
        toast.error('Database connection unavailable', { id: 'audit' })
        setAuditRunning(false)
        return
      }

      const today = new Date().toISOString().split('T')[0]

      const [
        { data: checkedInBookings },
        { data: payments },
        { data: allRooms },
        { data: arrivals },
        { data: overdueBookings },
        { data: occupiedRooms },
      ] = await Promise.all([
        supabase.from('bookings')
          .select('*, rooms(id, room_number), guests:guest_id(name)')
          .eq('organization_id', organizationId)
          .eq('status', 'checked_in'),
        supabase.from('payments')
          .select('*')
          .eq('organization_id', organizationId)
          .gte('payment_date', today),
        supabase.from('rooms')
          .select('id, room_number, status')
          .eq('organization_id', organizationId)
          .neq('status', 'maintenance'),
        supabase.from('bookings')
          .select('id, folio_id, guests:guest_id(name), rooms:room_id(room_number), check_in')
          .eq('organization_id', organizationId)
          .eq('status', 'reserved')
          .eq('check_in', today),
        supabase.from('bookings')
          .select('id, folio_id, guests:guest_id(name), rooms:room_id(room_number), check_out, balance, payment_status')
          .eq('organization_id', organizationId)
          .eq('payment_status', 'pending')
          .lt('check_out', today),
        supabase.from('rooms')
          .select('id, room_number')
          .eq('organization_id', organizationId)
          .eq('status', 'occupied'),
      ])

      const anomalies: any[] = []

      overdueBookings?.forEach((b: any) => {
        anomalies.push({
          type: 'Overdue checkout',
          severity: 'high',
          description: `Booking ${b.folio_id || b.id.slice(0, 8)} – ${b.guests?.name || 'Unknown guest'} (Room ${b.rooms?.room_number || '?'}) was due to check out on ${b.check_out} but payment is still pending.`,
          bookingId: b.id,
        })
      })

      checkedInBookings?.forEach((b: any) => {
        if (b.balance > b.total_amount * 0.5) {
          anomalies.push({
            type: 'High outstanding balance',
            severity: 'medium',
            description: `Booking ${b.folio_id || b.booking_number || b.id.slice(0, 8)} – ${b.guests?.name || 'Unknown guest'} has ${formatNaira(b.balance)} outstanding (>50% of ${formatNaira(b.total_amount)}).`,
            bookingId: b.id,
          })
        }
      })

      const checkedInRoomIds = new Set(checkedInBookings?.map((b: any) => b.room_id) || [])
      occupiedRooms?.forEach((room: any) => {
        if (!checkedInRoomIds.has(room.id)) {
          anomalies.push({
            type: 'Room status mismatch',
            severity: 'high',
            description: `Room ${room.room_number} is marked as occupied but has no active checked-in booking.`,
          })
        }
      })

      const totalRooms = allRooms?.length || 0
      const occupiedCount = checkedInBookings?.length || 0
      const totalRevenue = payments?.reduce((sum: number, p: any) => sum + p.amount, 0) || 0

      setAuditData({
        occupancyRate: totalRooms > 0 ? Math.round((occupiedCount / totalRooms) * 100) : 0,
        totalRooms,
        occupiedRooms: occupiedCount,
        totalRevenue,
        revenues: {
          cash: payments?.filter((p: any) => p.payment_method === 'cash').reduce((sum: number, p: any) => sum + p.amount, 0) || 0,
          pos: payments?.filter((p: any) => p.payment_method === 'pos').reduce((sum: number, p: any) => sum + p.amount, 0) || 0,
          transfer: payments?.filter((p: any) => ['transfer', 'bank_transfer'].includes(p.payment_method)).reduce((sum: number, p: any) => sum + p.amount, 0) || 0,
          cityLedger: payments?.filter((p: any) => p.payment_method === 'city_ledger').reduce((sum: number, p: any) => sum + p.amount, 0) || 0,
        },
        pendingCheckouts: checkedInBookings?.filter((b: any) => b.check_out === today) || [],
        expectedArrivals: arrivals || [],
        anomalies,
      })

      toast.success(`Night audit completed – ${anomalies.length} anomal${anomalies.length === 1 ? 'y' : 'ies'} found`, { id: 'audit' })
      setAuditComplete(true)
    } catch (error: any) {
      console.error('Night audit error:', error)
      toast.error('Night audit failed: ' + error.message, { id: 'audit' })
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
          date: new Date().toISOString().split('T')[0],
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

  const auditDate = new Date().toLocaleDateString('en-GB')
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
            End-of-day financial reconciliation and system rollover
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
            onClick={handleRunAudit}
            disabled={auditRunning || auditComplete}
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

      {auditComplete && (
        <Card className="border-green-200 bg-green-50">
          <CardContent className="flex items-center gap-3 p-4">
            <CheckCircle2 className="h-5 w-5 text-green-600" />
            <div>
              <p className="font-semibold text-green-900">Night audit completed for {auditDate}</p>
              <p className="text-sm text-green-700">System date rolled to {new Date(Date.now() + 86400000).toLocaleDateString('en-GB')}</p>
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
              Today&apos;s revenue
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
          <CardDescription>Payment method distribution for {auditDate}</CardDescription>
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

      <Tabs defaultValue="expected-arrivals" className="space-y-4">
        <TabsList className="flex flex-wrap h-auto">
          <TabsTrigger value="expected-arrivals">Expected Arrivals</TabsTrigger>
          <TabsTrigger value="pending-checkouts">Pending Checkouts</TabsTrigger>
          {canViewAuditTrails && <TabsTrigger value="audit-trails">Audit Trails</TabsTrigger>}
          {canApproveBackdates && !!userId && (
            <TabsTrigger value="backdate-requests" className="gap-1.5">
              <CalendarClock className="h-3.5 w-3.5" />
              Backdate Requests
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
              {auditData?.expectedArrivals?.length ? (
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
                    {auditData.expectedArrivals.map((b: any) => (
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
              ) : (
                <div className="py-8 text-center text-sm text-muted-foreground">No expected arrivals for today.</div>
              )}
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
              {auditData?.pendingCheckouts?.length ? (
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
                    {auditData.pendingCheckouts.map((b: any) => (
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
              ) : (
                <div className="py-8 text-center text-sm text-muted-foreground">No pending checkouts for today.</div>
              )}
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
                    {logsLoading ? (
                      <TableRow>
                        <TableCell colSpan={7} className="py-8 text-center text-muted-foreground">
                          Loading audit trails...
                        </TableCell>
                      </TableRow>
                    ) : auditLogs.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={7} className="py-8 text-center text-muted-foreground">
                          No audit logs found for the selected filters.
                        </TableCell>
                      </TableRow>
                    ) : auditLogs.map((log) => (
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
              </CardContent>
            </Card>
          </TabsContent>
        ) : null}

        {canApproveBackdates && userId ? (
          <TabsContent value="backdate-requests">
            <BackdateRequestsTab userId={userId} />
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
