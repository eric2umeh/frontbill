'use client'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { formatNaira } from '@/lib/utils/currency'
import { AlertTriangle, CheckCircle, Clock, Plus } from 'lucide-react'

// Mock reconciliation data
const mockReconciliations = [
  { id: '1', shiftDate: '2024-01-15', shiftType: 'morning', status: 'approved', totalExpected: 450000, totalActual: 450000, variance: 0, anomalyFlags: [], reconciledBy: 'John Doe' },
  { id: '2', shiftDate: '2024-01-15', shiftType: 'afternoon', status: 'pending', totalExpected: 380000, totalActual: 380000, variance: 0, anomalyFlags: [], reconciledBy: null },
  { id: '3', shiftDate: '2024-01-14', shiftType: 'night', status: 'flagged', totalExpected: 220000, totalActual: 215000, variance: -5000, anomalyFlags: [{ type: 'cash_shortage', amount: 5000 }], reconciledBy: 'Jane Smith' },
  { id: '4', shiftDate: '2024-01-14', shiftType: 'afternoon', status: 'approved', totalExpected: 520000, totalActual: 520000, variance: 0, anomalyFlags: [], reconciledBy: 'Mike Johnson' },
  { id: '5', shiftDate: '2024-01-14', shiftType: 'morning', status: 'approved', totalExpected: 480000, totalActual: 485000, variance: 5000, anomalyFlags: [{ type: 'cash_overage', amount: 5000 }], reconciledBy: 'Sarah Williams' },
]

export default function ReconciliationPage() {
  const pending = mockReconciliations.filter(r => r.status === 'pending').length
  const flagged = mockReconciliations.filter(r => r.status === 'flagged').length
  const approved = mockReconciliations.filter(r => r.status === 'approved').length

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Shift Reconciliation</h1>
          <p className="text-muted-foreground">
            Track end-of-shift payments and detect anomalies
          </p>
        </div>
        <Button>
          <Plus className="mr-2 h-4 w-4" />
          New Reconciliation
        </Button>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Clock className="h-4 w-4" />
              Pending
            </div>
            <div className="text-2xl font-bold text-yellow-600 mt-2">{pending}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <AlertTriangle className="h-4 w-4" />
              Flagged
            </div>
            <div className="text-2xl font-bold text-red-600 mt-2">{flagged}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <CheckCircle className="h-4 w-4" />
              Approved
            </div>
            <div className="text-2xl font-bold text-green-600 mt-2">{approved}</div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Recent Reconciliations</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {mockReconciliations.map((recon) => (
              <div key={recon.id} className="flex items-start justify-between border-b pb-4 last:border-0 last:pb-0">
                <div className="space-y-2">
                  <div className="flex items-center gap-3">
                    <p className="font-medium">{new Date(recon.shiftDate).toLocaleDateString('en-GB')}</p>
                    <Badge variant="secondary" className="capitalize">
                      {recon.shiftType}
                    </Badge>
                    <Badge
                      variant={
                        recon.status === 'approved' ? 'default' :
                        recon.status === 'flagged' ? 'destructive' :
                        'secondary'
                      }
                    >
                      {recon.status}
                    </Badge>
                  </div>
                  <div className="grid grid-cols-3 gap-4 text-sm">
                    <div>
                      <p className="text-muted-foreground">Expected</p>
                      <p className="font-medium">{formatNaira(recon.totalExpected)}</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">Actual</p>
                      <p className="font-medium">{formatNaira(recon.totalActual)}</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">Variance</p>
                      <p className={`font-medium ${
                        recon.variance > 0 ? 'text-green-600' : 
                        recon.variance < 0 ? 'text-red-600' : ''
                      }`}>
                        {recon.variance > 0 ? '+' : ''}{formatNaira(recon.variance)}
                      </p>
                    </div>
                  </div>
                  {recon.anomalyFlags && recon.anomalyFlags.length > 0 && (
                    <div className="flex flex-wrap gap-2">
                      {recon.anomalyFlags.map((flag, i) => (
                        <Badge key={i} variant="destructive" className="text-xs">
                          <AlertTriangle className="h-3 w-3 mr-1" />
                          {flag.type.replace('_', ' ')}
                        </Badge>
                      ))}
                    </div>
                  )}
                  {recon.reconciledBy && (
                    <p className="text-xs text-muted-foreground">
                      Reconciled by: {recon.reconciledBy}
                    </p>
                  )}
                </div>
                <Button variant="outline" size="sm">
                  View Details
                </Button>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
