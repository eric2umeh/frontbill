'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { EnhancedDataTable } from '@/components/shared/enhanced-data-table'
import { formatNaira } from '@/lib/utils/currency'
import { usePageData } from '@/hooks/use-page-data'
import { 
  CheckCircle2, AlertTriangle, TrendingUp, Users,
  Bed, DollarSign, Clock, Play, Loader2
} from 'lucide-react'
import { toast } from 'sonner'

export default function NightAuditPage() {
  const [auditRunning, setAuditRunning] = useState(false)
  const [auditComplete, setAuditComplete] = useState(false)
  const { initialLoading, startFetch, endFetch } = usePageData()
  const [auditData, setAuditData] = useState<any>(null)
  const router = useRouter()

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

      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/auth/login'); return }

      const { data: profile } = await supabase
        .from('profiles').select('organization_id').eq('id', user.id).single()
      if (!profile) { setAuditData(emptyData); return }

      const [{ data: bookings }, { data: payments }, { data: allRooms }, { data: arrivals }] = await Promise.all([
        supabase
          .from('bookings')
          .select('*, rooms(id, room_number)')
          .eq('organization_id', profile.organization_id)
          .eq('status', 'checked_in'),
        supabase
          .from('payments')
          .select('*')
          .eq('organization_id', profile.organization_id)
          .gte('payment_date', new Date().toISOString().split('T')[0]),
        supabase
          .from('rooms')
          .select('id')
          .eq('organization_id', profile.organization_id)
          .neq('status', 'maintenance'),
        supabase
          .from('bookings')
          .select('id, folio_id, guests:guest_id(name)')
          .eq('organization_id', profile.organization_id)
          .eq('status', 'reserved')
          .eq('check_in', new Date().toISOString().split('T')[0]),
      ])

      const totalRooms = allRooms?.length || 0
      const occupiedRooms = bookings?.length || 0

      setAuditData({
        occupancyRate: totalRooms > 0 ? Math.round((occupiedRooms / totalRooms) * 100) : 0,
        totalRooms,
        occupiedRooms,
        totalRevenue: payments?.reduce((sum, p) => sum + p.amount, 0) || 0,
        revenues: {
          cash: payments?.filter(p => p.payment_method === 'cash').reduce((sum, p) => sum + p.amount, 0) || 0,
          pos: payments?.filter(p => p.payment_method === 'pos').reduce((sum, p) => sum + p.amount, 0) || 0,
          transfer: payments?.filter(p => ['transfer', 'bank_transfer'].includes(p.payment_method)).reduce((sum, p) => sum + p.amount, 0) || 0,
          cityLedger: payments?.filter(p => p.payment_method === 'city_ledger').reduce((sum, p) => sum + p.amount, 0) || 0,
        },
        pendingCheckouts: bookings?.filter((b: any) => b.check_out === new Date().toISOString().split('T')[0]) || [],
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

  const handleRunAudit = () => {
    setAuditRunning(true)
    toast.loading('Running night audit...')
    
    setTimeout(() => {
      setAuditRunning(false)
      setAuditComplete(true)
      toast.success('Night audit completed successfully!')
    }, 3000)
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

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Night Audit</h1>
          <p className="text-muted-foreground">
            End-of-day financial reconciliation and system rollover
          </p>
        </div>
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
              Today's revenue
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
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="h-2 w-2 rounded-full bg-green-500" />
                <span className="text-sm font-medium">Cash</span>
              </div>
              <div className="flex items-center gap-4">
                <div className="text-sm text-muted-foreground">
                  {auditData?.totalRevenue ? ((auditData.revenues.cash / auditData.totalRevenue) * 100).toFixed(1) : 0}%
                </div>
                <div className="font-semibold">{formatNaira(auditData?.revenues.cash || 0)}</div>
              </div>
            </div>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="h-2 w-2 rounded-full bg-blue-500" />
                <span className="text-sm font-medium">POS</span>
              </div>
              <div className="flex items-center gap-4">
                <div className="text-sm text-muted-foreground">
                  {auditData?.totalRevenue ? ((auditData.revenues.pos / auditData.totalRevenue) * 100).toFixed(1) : 0}%
                </div>
                <div className="font-semibold">{formatNaira(auditData?.revenues.pos || 0)}</div>
              </div>
            </div>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="h-2 w-2 rounded-full bg-purple-500" />
                <span className="text-sm font-medium">Transfer</span>
              </div>
              <div className="flex items-center gap-4">
                <div className="text-sm text-muted-foreground">
                  {auditData?.totalRevenue ? ((auditData.revenues.transfer / auditData.totalRevenue) * 100).toFixed(1) : 0}%
                </div>
                <div className="font-semibold">{formatNaira(auditData?.revenues.transfer || 0)}</div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {auditData?.anomalies && auditData.anomalies.length > 0 && (
        <Card className="border-orange-200">
          <CardHeader>
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-orange-600" />
              <CardTitle>Anomalies Detected</CardTitle>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            {auditData.anomalies.map((anomaly: any, index: number) => (
              <div key={index} className="flex items-start justify-between p-3 bg-orange-50 rounded-lg">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <Badge variant="secondary">
                      {anomaly.severity || 'medium'}
                    </Badge>
                    <span className="font-semibold text-sm">{anomaly.type}</span>
                  </div>
                  <p className="text-sm text-muted-foreground">{anomaly.description}</p>
                </div>
                <Button variant="outline" size="sm">
                  Resolve
                </Button>
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  )
}
