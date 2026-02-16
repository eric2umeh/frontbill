import { createClient } from '@/lib/supabase/server'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { formatNaira } from '@/lib/utils/currency'
import { formatDate } from '@/lib/utils/date'
import { AlertTriangle, CheckCircle, Clock, Plus } from 'lucide-react'

export default async function ReconciliationPage() {
  const supabase = await createClient()
  const { data: reconciliations } = await supabase
    .from('reconciliations')
    .select('*')
    .order('shift_date', { ascending: false })
    .limit(15)

  const pending = reconciliations?.filter(r => r.status === 'pending').length || 0
  const flagged = reconciliations?.filter(r => r.status === 'flagged').length || 0
  const approved = reconciliations?.filter(r => r.status === 'approved').length || 0

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
            {reconciliations?.length === 0 ? (
              <p className="text-center text-sm text-muted-foreground py-8">
                No reconciliations yet
              </p>
            ) : (
              reconciliations?.map((recon) => (
                <div key={recon.id} className="flex items-start justify-between border-b pb-4 last:border-0 last:pb-0">
                  <div className="space-y-2">
                    <div className="flex items-center gap-3">
                      <p className="font-medium">{formatDate(recon.shift_date)}</p>
                      <Badge variant="secondary" className="capitalize">
                        {recon.shift_type}
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
                        <p className="font-medium">{formatNaira(recon.total_expected)}</p>
                      </div>
                      <div>
                        <p className="text-muted-foreground">Actual</p>
                        <p className="font-medium">{formatNaira(recon.total_actual)}</p>
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
                    {recon.anomaly_flags && Array.isArray(recon.anomaly_flags) && recon.anomaly_flags.length > 0 && (
                      <div className="flex flex-wrap gap-2">
                        {recon.anomaly_flags.map((flag: any, i: number) => (
                          <Badge key={i} variant="destructive" className="text-xs">
                            <AlertTriangle className="h-3 w-3 mr-1" />
                            {flag.type.replace('_', ' ')}
                          </Badge>
                        ))}
                      </div>
                    )}
                  </div>
                  <Button variant="outline" size="sm">
                    View Details
                  </Button>
                </div>
              ))
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
