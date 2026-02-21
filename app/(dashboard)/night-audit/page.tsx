'use client'

import { useState } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { EnhancedDataTable } from '@/components/shared/enhanced-data-table'
import { formatNaira } from '@/lib/utils/currency'
import { 
  Moon, 
  CheckCircle2, 
  AlertTriangle, 
  TrendingUp, 
  Users, 
  Bed,
  CreditCard,
  DollarSign,
  FileText,
  Clock,
  Play
} from 'lucide-react'
import { toast } from 'sonner'

export default function NightAuditPage() {
  const [auditRunning, setAuditRunning] = useState(false)
  const [auditComplete, setAuditComplete] = useState(false)

  // Mock data for demonstration
  const auditDate = new Date().toLocaleDateString('en-GB')
  const occupancyRate = 78
  const totalRooms = 50
  const occupiedRooms = 39
  const totalRevenue = 1250000
  const cashRevenue = 450000
  const posRevenue = 600000
  const transferRevenue = 200000
  const cityLedgerRevenue = 0
  
  const pendingCheckouts = [
    { room: '101', guest: 'Mr. Adewale Johnson', checkOut: new Date().toISOString(), balance: 0 },
    { room: '205', guest: 'Mrs. Fatima Bello', checkOut: new Date().toISOString(), balance: 15000 },
    { room: '301', guest: 'Chief Emeka Okafor', checkOut: new Date().toISOString(), balance: 0 },
  ]

  const expectedArrivals = [
    { room: '102', guest: 'Dr. Sarah Williams', checkIn: new Date().toISOString(), status: 'confirmed' },
    { room: '208', guest: 'Mr. Pierre Dubois', checkIn: new Date().toISOString(), status: 'confirmed' },
  ]

  const anomalies = [
    { type: 'Cash Variance', description: 'Cash drawer short by ₦5,000', severity: 'medium' },
    { type: 'Unposted Charges', description: '2 minibar charges not posted to folios', severity: 'high' },
  ]

  const handleRunAudit = () => {
    setAuditRunning(true)
    toast.loading('Running night audit...')
    
    setTimeout(() => {
      setAuditRunning(false)
      setAuditComplete(true)
      toast.success('Night audit completed successfully!')
    }, 3000)
  }

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

      {/* Audit Status Banner */}
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

      {/* Key Metrics */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Occupancy Rate
            </CardTitle>
            <Bed className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{occupancyRate}%</div>
            <p className="text-xs text-muted-foreground mt-1">
              {occupiedRooms} of {totalRooms} rooms occupied
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
            <div className="text-2xl font-bold">{formatNaira(totalRevenue)}</div>
            <p className="text-xs text-green-600 mt-1 flex items-center gap-1">
              <TrendingUp className="h-3 w-3" />
              +12% from yesterday
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
            <div className="text-2xl font-bold">{pendingCheckouts.length}</div>
            <p className="text-xs text-muted-foreground mt-1">
              Expected departures tomorrow
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
            <div className="text-2xl font-bold">{expectedArrivals.length}</div>
            <p className="text-xs text-muted-foreground mt-1">
              Confirmed reservations tomorrow
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Revenue Breakdown */}
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
                  {((cashRevenue / totalRevenue) * 100).toFixed(1)}%
                </div>
                <div className="font-semibold">{formatNaira(cashRevenue)}</div>
              </div>
            </div>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="h-2 w-2 rounded-full bg-blue-500" />
                <span className="text-sm font-medium">POS</span>
              </div>
              <div className="flex items-center gap-4">
                <div className="text-sm text-muted-foreground">
                  {((posRevenue / totalRevenue) * 100).toFixed(1)}%
                </div>
                <div className="font-semibold">{formatNaira(posRevenue)}</div>
              </div>
            </div>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="h-2 w-2 rounded-full bg-purple-500" />
                <span className="text-sm font-medium">Transfer</span>
              </div>
              <div className="flex items-center gap-4">
                <div className="text-sm text-muted-foreground">
                  {((transferRevenue / totalRevenue) * 100).toFixed(1)}%
                </div>
                <div className="font-semibold">{formatNaira(transferRevenue)}</div>
              </div>
            </div>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="h-2 w-2 rounded-full bg-orange-500" />
                <span className="text-sm font-medium">City Ledger</span>
              </div>
              <div className="flex items-center gap-4">
                <div className="text-sm text-muted-foreground">
                  {((cityLedgerRevenue / totalRevenue) * 100).toFixed(1)}%
                </div>
                <div className="font-semibold">{formatNaira(cityLedgerRevenue)}</div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Anomalies and Warnings */}
      {anomalies.length > 0 && (
        <Card className="border-orange-200">
          <CardHeader>
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-orange-600" />
              <CardTitle>Anomalies Detected</CardTitle>
            </div>
            <CardDescription>Items requiring attention before completing audit</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {anomalies.map((anomaly, index) => (
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
                <Button variant="outline" size="sm">
                  Resolve
                </Button>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Pending Checkouts */}
      <Card>
        <CardHeader>
          <CardTitle>Pending Checkouts</CardTitle>
          <CardDescription>Guests scheduled to depart tomorrow</CardDescription>
        </CardHeader>
        <CardContent>
          <EnhancedDataTable
            data={pendingCheckouts}
            searchKeys={['room', 'guest']}
            columns={[
              {
                key: 'room',
                label: 'Room',
                render: (item) => <div className="font-medium">Room {item.room}</div>,
              },
              {
                key: 'guest',
                label: 'Guest',
                render: (item) => <div>{item.guest}</div>,
              },
              {
                key: 'checkOut',
                label: 'Check-out Date',
                render: (item) => (
                  <div className="text-sm">
                    {new Date(item.checkOut).toLocaleDateString('en-GB')}
                  </div>
                ),
              },
              {
                key: 'balance',
                label: 'Balance',
                render: (item) => (
                  <div className={`font-semibold ${item.balance > 0 ? 'text-red-600' : 'text-green-600'}`}>
                    {item.balance > 0 ? formatNaira(item.balance) : 'Settled'}
                  </div>
                ),
              },
            ]}
            itemsPerPage={5}
          />
        </CardContent>
      </Card>

      {/* Expected Arrivals */}
      <Card>
        <CardHeader>
          <CardTitle>Expected Arrivals</CardTitle>
          <CardDescription>Confirmed reservations for tomorrow</CardDescription>
        </CardHeader>
        <CardContent>
          <EnhancedDataTable
            data={expectedArrivals}
            searchKeys={['room', 'guest']}
            columns={[
              {
                key: 'room',
                label: 'Room',
                render: (item) => <div className="font-medium">Room {item.room}</div>,
              },
              {
                key: 'guest',
                label: 'Guest',
                render: (item) => <div>{item.guest}</div>,
              },
              {
                key: 'checkIn',
                label: 'Check-in Date',
                render: (item) => (
                  <div className="text-sm">
                    {new Date(item.checkIn).toLocaleDateString('en-GB')}
                  </div>
                ),
              },
              {
                key: 'status',
                label: 'Status',
                render: (item) => (
                  <Badge variant="outline" className="bg-green-500/10 text-green-700 border-green-200">
                    {item.status}
                  </Badge>
                ),
              },
            ]}
            itemsPerPage={5}
          />
        </CardContent>
      </Card>
    </div>
  )
}
