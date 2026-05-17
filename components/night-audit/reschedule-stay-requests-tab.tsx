'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Loader2, CalendarRange } from 'lucide-react'
import { toast } from 'sonner'
import { format } from 'date-fns'

export interface RescheduleStayRequestRow {
  id: string
  booking_id: string
  from_check_in: string
  from_check_out: string
  to_check_in: string
  to_check_out: string
  is_backdate: boolean
  folio_label?: string | null
  guest_label?: string | null
  room_label?: string | null
  reason: string
  status: 'pending' | 'approved' | 'rejected'
  requested_by_name: string
  approved_by_name?: string | null
  decision_note?: string | null
  created_at: string
}

function fmtYmd(ymd: string) {
  try {
    return format(new Date(ymd.slice(0, 10) + 'T12:00:00'), 'dd MMM yyyy')
  } catch {
    return ymd
  }
}

interface Props {
  userId: string
}

export function RescheduleStayRequestsTab({ userId }: Props) {
  const [requests, setRequests] = useState<RescheduleStayRequestRow[]>([])
  const [loading, setLoading] = useState(true)
  const [decidingId, setDecidingId] = useState<string | null>(null)

  const load = async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/reschedule-stay-requests?caller_id=${userId}`, { credentials: 'include' })
      const json = await res.json()
      if (!res.ok) {
        toast.error(json.error || 'Failed to load move-dates requests')
        setRequests([])
        return
      }
      setRequests(json.requests || [])
    } catch {
      toast.error('Failed to load move-dates requests')
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
      const decision_note =
        status === 'approved' ? 'Approved — stay dates updated' : 'Rejected in Night Audit'
      const res = await fetch('/api/reschedule-stay-requests', {
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
      toast.success(status === 'approved' ? 'Stay dates updated on folio' : 'Request rejected')
      await load()
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
          <CalendarRange className="h-5 w-5 text-muted-foreground" />
          <div>
            <CardTitle className="text-base">Move stay dates</CardTitle>
            <CardDescription>
              Approve check-in / check-out changes when guests delay arrival or shift their stay. Backdated
              check-ins are flagged for review here as well.
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
          <p className="py-8 text-center text-sm text-muted-foreground">No move-dates requests yet.</p>
        ) : (
          <div className="grid gap-3">
            {requests.map((request) => (
              <Card key={request.id} className="border-muted shadow-none">
                <CardContent className="p-4 space-y-3">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="font-medium">
                          {request.guest_label || 'Guest'} · {request.folio_label || 'Folio'}
                        </p>
                        <Badge
                          variant={
                            request.status === 'pending'
                              ? 'secondary'
                              : request.status === 'approved'
                                ? 'default'
                                : 'destructive'
                          }
                        >
                          {request.status}
                        </Badge>
                        {request.is_backdate && (
                          <Badge variant="outline" className="border-amber-500 text-amber-800">
                            Backdated check-in
                          </Badge>
                        )}
                      </div>
                      <p className="text-sm text-muted-foreground mt-1">
                        {request.room_label || 'Room'} · Requested by {request.requested_by_name}
                      </p>
                      <p className="text-sm mt-2">
                        <span className="text-muted-foreground">From:</span>{' '}
                        {fmtYmd(request.from_check_in)} → {fmtYmd(request.from_check_out)}
                      </p>
                      <p className="text-sm">
                        <span className="text-muted-foreground">To:</span>{' '}
                        <span className="font-medium">
                          {fmtYmd(request.to_check_in)} → {fmtYmd(request.to_check_out)}
                        </span>
                      </p>
                      <p className="text-sm text-muted-foreground mt-1">Reason: {request.reason}</p>
                    </div>
                    {request.status === 'pending' && (
                      <div className="flex flex-col gap-2 shrink-0">
                        <Button
                          size="sm"
                          disabled={decidingId === request.id}
                          onClick={() => decide(request.id, 'approved')}
                        >
                          {decidingId === request.id ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            'Approve'
                          )}
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={decidingId === request.id}
                          onClick={() => decide(request.id, 'rejected')}
                        >
                          Reject
                        </Button>
                      </div>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
                    <Link href={`/bookings/${request.booking_id}`} className="text-primary hover:underline">
                      Open folio
                    </Link>
                    {request.status !== 'pending' && request.approved_by_name && (
                      <span>
                        {request.status === 'approved' ? 'Approved' : 'Rejected'} by{' '}
                        {request.approved_by_name}
                      </span>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
