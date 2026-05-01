'use client'

import { useEffect, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Loader2, CalendarClock } from 'lucide-react'
import { toast } from 'sonner'

export interface BackdateRequest {
  id: string
  request_type: string
  requested_check_in: string
  requested_check_out: string | null
  reason: string
  status: 'pending' | 'approved' | 'rejected'
  requested_by_name: string
  approved_by_name?: string | null
  decision_note?: string | null
  created_at: string
}

interface Props {
  userId: string
}

export function BackdateRequestsTab({ userId }: Props) {
  const [requests, setRequests] = useState<BackdateRequest[]>([])
  const [loading, setLoading] = useState(true)
  const [decidingId, setDecidingId] = useState<string | null>(null)

  const load = async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/backdate-requests?caller_id=${userId}`, { credentials: 'include' })
      const json = await res.json()
      if (!res.ok) {
        toast.error(json.error || 'Failed to load backdate requests')
        setRequests([])
        return
      }
      setRequests(json.requests || [])
    } catch {
      toast.error('Failed to load backdate requests')
      setRequests([])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (userId) load()
  }, [userId])

  const decide = async (requestId: string, status: 'approved' | 'rejected') => {
    setDecidingId(requestId)
    try {
      const decision_note = status === 'approved' ? 'Approved by superadmin' : 'Rejected by superadmin'
      const res = await fetch('/api/backdate-requests', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ caller_id: userId, request_id: requestId, status, decision_note }),
      })
      const json = await res.json()
      if (!res.ok) {
        toast.error(json.error || 'Failed to update request')
        return
      }
      toast.success(`Backdate request ${status}`)
      setRequests((prev) => prev.map((item) => (item.id === requestId ? { ...item, ...json.request } : item)))
      load()
    } catch {
      toast.error('Failed to update request')
    } finally {
      setDecidingId(null)
    }
  }

  const pendingCount = requests.filter((r) => r.status === 'pending').length

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <CalendarClock className="h-5 w-5 text-muted-foreground" />
          <div>
            <CardTitle className="text-base">Backdate requests</CardTitle>
            <CardDescription>
              Approve or reject staff requests to record bookings or reservations with past check-in dates. Approved
              requests remain in the audit trail.
              {pendingCount > 0 && (
                <Badge variant="secondary" className="ml-2">
                  {pendingCount} pending
                </Badge>
              )}
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {loading ? (
          <div className="flex justify-center py-12 text-muted-foreground">
            <Loader2 className="h-6 w-6 animate-spin" />
          </div>
        ) : requests.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">No backdate requests yet.</p>
        ) : (
          <div className="grid gap-3">
            {requests.map((request) => (
              <Card key={request.id} className="border-muted shadow-none">
                <CardContent className="p-4 space-y-3">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="font-medium capitalize">{request.request_type.replace('_', ' ')} backdate</p>
                        <Badge
                          variant={
                            request.status === 'pending'
                              ? 'default'
                              : request.status === 'approved'
                                ? 'secondary'
                                : 'destructive'
                          }
                        >
                          {request.status}
                        </Badge>
                      </div>
                      <p className="text-sm text-muted-foreground mt-1">
                        Requested by {request.requested_by_name} for {request.requested_check_in}
                        {request.requested_check_out ? ` to ${request.requested_check_out}` : ''}
                      </p>
                    </div>
                    {request.status === 'pending' && (
                      <div className="flex gap-2 shrink-0">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => decide(request.id, 'rejected')}
                          disabled={decidingId === request.id}
                        >
                          Reject
                        </Button>
                        <Button size="sm" onClick={() => decide(request.id, 'approved')} disabled={decidingId === request.id}>
                          {decidingId === request.id ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                          Approve
                        </Button>
                      </div>
                    )}
                  </div>
                  <div className="rounded-md bg-muted/40 p-3 text-sm">
                    <span className="font-medium">Reason: </span>
                    {request.reason}
                  </div>
                  {request.decision_note && (
                    <p className="text-xs text-muted-foreground">
                      Decision: {request.decision_note}
                      {request.approved_by_name ? ` · ${request.approved_by_name}` : ''}
                    </p>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
