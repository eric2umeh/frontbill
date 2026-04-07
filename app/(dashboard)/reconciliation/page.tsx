'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { formatNaira } from '@/lib/utils/currency'
import { AlertTriangle, CheckCircle, Clock, Plus, Loader2 } from 'lucide-react'
import { useAuth } from '@/lib/auth-context'
import { toast } from 'sonner'

interface Reconciliation {
  id: string
  shift_date: string
  shift_type: string
  status: string
  total_expected: number
  total_actual: number
  variance: number
  anomalies?: any[]
  reconciled_by?: string
}

export default function ReconciliationPage() {
  const [reconciliations, setReconciliations] = useState<Reconciliation[]>([])
  const [loading, setLoading] = useState(true)
  const { organizationId } = useAuth()

  useEffect(() => {
    fetchReconciliations()
  }, [])

  const fetchReconciliations = async () => {
    try {
      setLoading(true)
      const supabase = createClient()
      
      if (!supabase) {
        setReconciliations([])
        setLoading(false)
        return
      }

      const { data, error } = await supabase
        .from('reconciliations')
        .select('*')
        .eq('organization_id', organizationId)
        .order('shift_date', { ascending: false })
        .limit(20)

      if (error) throw error
      setReconciliations(data || [])
    } catch (error: any) {
      console.error('Error fetching reconciliations:', error)
      setReconciliations([])
    } finally {
      setLoading(false)
    }
  }

  const pending = reconciliations.filter(r => r.status === 'pending').length
  const flagged = reconciliations.filter(r => r.status === 'flagged').length
  const approved = reconciliations.filter(r => r.status === 'approved').length

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    )
  }

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
          {reconciliations.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <p>No reconciliations found. Start by creating a new reconciliation.</p>
            </div>
          ) : (
            <div className="space-y-4">
              {reconciliations.map((recon) => (
                <div key={recon.id} className="flex items-start justify-between border-b pb-4 last:border-0 last:pb-0">
                  <div className="space-y-2">
                    <div className="flex items-center gap-3">
                      <p className="font-medium">{new Date(recon.shift_date).toLocaleDateString('en-GB')}</p>
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
                    {recon.anomalies && recon.anomalies.length > 0 && (
                      <div className="flex flex-wrap gap-2">
                        {recon.anomalies.map((anomaly, i) => (
                          <Badge key={i} variant="destructive" className="text-xs">
                            <AlertTriangle className="h-3 w-3 mr-1" />
                            {typeof anomaly === 'string' ? anomaly : anomaly.type}
                          </Badge>
                        ))}
                      </div>
                    )}
                    {recon.reconciled_by && (
                      <p className="text-xs text-muted-foreground">
                        Reconciled by: {recon.reconciled_by}
                      </p>
                    )}
                  </div>
                  <Button variant="outline" size="sm">
                    View Details
                  </Button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
