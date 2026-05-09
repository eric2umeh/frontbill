'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Loader2, DoorOpen } from 'lucide-react'
import { toast } from 'sonner'

export interface RoomChangeRequestRow {
  id: string
  booking_id: string
  from_room_label: string
  to_room_label: string
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

export function RoomChangeRequestsTab({ userId }: Props) {
  const [requests, setRequests] = useState<RoomChangeRequestRow[]>([])
  const [loading, setLoading] = useState(true)
  const [decidingId, setDecidingId] = useState<string | null>(null)

  const load = async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/room-change-requests?caller_id=${userId}`, { credentials: 'include' })
      const json = await res.json()
      if (!res.ok) {
        toast.error(json.error || 'Failed to load room change requests')
        setRequests([])
        return
      }
      setRequests(json.requests || [])
    } catch {
      toast.error('Failed to load room change requests')
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
        status === 'approved' ? 'Approved — guest moved to new room' : 'Rejected in Night Audit'
      const res = await fetch('/api/room-change-requests', {
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
      toast.success(status === 'approved' ? 'Room change applied' : 'Request rejected')
      await load()
      if (status === 'approved' && json.booking_id) {
        /* optional: open booking */
      }
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
          <DoorOpen className="h-5 w-5 text-muted-foreground" />
          <div>
            <CardTitle className="text-base">Room change requests</CardTitle>
            <CardDescription>
              Approve moves for checked-in guests (maintenance, AC, etc.). The folio keeps the same dates and rates; a
              note is added to folio history.
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
          <p className="py-8 text-center text-sm text-muted-foreground">No room change requests yet.</p>
        ) : (
          <div className="grid gap-3">
            {requests.map((request) => (
              <Card key={request.id} className="border-muted shadow-none">
                <CardContent className="p-4 space-y-3">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="font-medium">
                          Room {request.from_room_label} → {request.to_room_label}
                        </p>
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
                        Requested by {request.requested_by_name} ·{' '}
                        {new Date(request.created_at).toLocaleString('en-GB')}
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
                        <Button
                          size="sm"
                          onClick={() => decide(request.id, 'approved')}
                          disabled={decidingId === request.id}
                        >
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
                      Note: {request.decision_note}
                      {request.approved_by_name ? ` · ${request.approved_by_name}` : ''}
                    </p>
                  )}
                  <Button variant="link" className="h-auto p-0 text-sm" asChild>
                    <Link href={`/bookings/${request.booking_id}`}>Open booking folio</Link>
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
