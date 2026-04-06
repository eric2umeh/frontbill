'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import { formatNaira } from '@/lib/utils/currency'
import { usePageData } from '@/hooks/use-page-data'
import { useAuth } from '@/lib/auth-context'
import { 
  CheckCircle2, AlertTriangle, TrendingUp, Users,
  Bed, DollarSign, Clock, Play, Loader2, Sparkles
} from 'lucide-react'
import { toast } from 'sonner'

export default function NightAuditPage() {
  const router = useRouter()
  const [auditRunning, setAuditRunning] = useState(false)
  const [auditComplete, setAuditComplete] = useState(false)
  const { initialLoading, startFetch, endFetch } = usePageData()
  const { organizationId } = useAuth()
  const [auditData, setAuditData] = useState<any>(null)
  const [aiSummary, setAiSummary] = useState<any>(null)
  const [aiLoading, setAiLoading] = useState(false)

  useEffect(() => {
    fetchAuditData()
  }, [])

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

      {auditData?.pendingCheckouts && auditData.pendingCheckouts.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Pending Checkouts</CardTitle>
            <CardDescription>Guests expected to depart today</CardDescription>
          </CardHeader>
          <CardContent>
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
          </CardContent>
        </Card>
      )}

      {auditData?.expectedArrivals && auditData.expectedArrivals.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Expected Arrivals</CardTitle>
            <CardDescription>Reservations arriving today</CardDescription>
          </CardHeader>
          <CardContent>
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
          </CardContent>
        </Card>
      )}

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
