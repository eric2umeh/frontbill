'use client'

import Link from 'next/link'
import { useEffect, useState, type ReactNode } from 'react'
import { format, parseISO } from 'date-fns'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Loader2, CalendarClock } from 'lucide-react'
import { toast } from 'sonner'
import { dispatchNightAuditPendingChanged } from '@/lib/utils/dispatch-night-audit-pending-changed'
import { formatNaira } from '@/lib/utils/currency'
import type { BackdateRequestSummary } from '@/lib/backdate/request-summary'
import { PaginatedListShell } from '@/components/shared/paginated-list-shell'

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
  decided_at?: string | null
  created_booking_id?: string | null
  metadata?: { created_folio_id?: string; [k: string]: unknown }
  summary?: BackdateRequestSummary | null
}

interface Props {
  userId: string
}

function formatRequestInstant(iso: string | null | undefined): string {
  if (!iso) return '—'
  try {
    return format(parseISO(iso), 'dd MMM yyyy · h:mm a')
  } catch {
    return iso
  }
}

function formatStayDate(ymd: string | null | undefined): string {
  if (!ymd) return '—'
  try {
    return format(parseISO(`${ymd}T12:00:00`), 'dd MMM yyyy')
  } catch {
    return ymd
  }
}

function DetailItem({ label, value }: { label: string; value: ReactNode }) {
  if (value == null || value === '' || value === '—') return null
  return (
    <div className="space-y-0.5">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-sm font-medium">{value}</p>
    </div>
  )
}

function BackdateRequestDetails({ request }: { request: BackdateRequest }) {
  const s = request.summary
  const isBulk =
    request.request_type === 'bulk_booking' ||
    request.request_type === 'bulk_reservation' ||
    (s?.room_count != null && s.room_count > 0)

  if (isBulk) {
    return (
      <div className="grid gap-3 rounded-md border bg-muted/30 p-3 sm:grid-cols-2">
        <DetailItem label="Submitted" value={formatRequestInstant(request.created_at)} />
        <DetailItem label="Requested by" value={request.requested_by_name} />
        <DetailItem label="Stay check-in" value={formatStayDate(request.requested_check_in)} />
        <DetailItem label="Stay check-out" value={formatStayDate(request.requested_check_out)} />
        <DetailItem label="Type" value={s?.booking_type?.replace('_', ' ') || request.request_type.replace('_', ' ')} />
        <DetailItem label="Rooms" value={s?.room_count != null ? String(s.room_count) : null} />
        <DetailItem label="Organization" value={s?.organization_name} />
      </div>
    )
  }

  return (
    <div className="grid gap-3 rounded-md border bg-muted/30 p-3 sm:grid-cols-2">
      <DetailItem label="Submitted" value={formatRequestInstant(request.created_at)} />
      <DetailItem label="Requested by" value={request.requested_by_name} />
      <DetailItem label="Guest" value={s?.guest_name} />
      <DetailItem label="Guest phone" value={s?.guest_phone} />
      <DetailItem
        label="Room"
        value={
          s?.room_number
            ? `Room ${s.room_number}${s.room_type ? ` · ${s.room_type}` : ''}`
            : s?.room_type || null
        }
      />
      <DetailItem
        label="Stay dates"
        value={`${formatStayDate(request.requested_check_in)} → ${formatStayDate(request.requested_check_out)}`}
      />
      <DetailItem label="Nights" value={s?.nights != null ? String(s.nights) : null} />
      <DetailItem
        label="Rate / night"
        value={s?.rate_per_night != null ? formatNaira(s.rate_per_night) : null}
      />
      <DetailItem
        label="Estimated total"
        value={s?.total_amount != null ? formatNaira(s.total_amount) : null}
      />
      <DetailItem
        label="Payment"
        value={
          s?.payment_method
            ? `${String(s.payment_method).replace('_', ' ')}${s.payment_status ? ` · ${s.payment_status}` : ''}`
            : null
        }
      />
      {s?.amount_paid != null && s.amount_paid > 0 ? (
        <DetailItem label="Amount paid" value={formatNaira(s.amount_paid)} />
      ) : null}
    </div>
  )
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
      const decision_note = status === 'approved' ? 'Approved in Night Audit' : 'Rejected in Night Audit'
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
      if (status === 'approved' && json.created_booking_id) {
        toast.success(
          typeof json.request?.metadata?.created_folio_id === 'string'
            ? `Booking created (${json.request.metadata.created_folio_id})`
            : 'Booking created for this approval',
        )
      } else {
        toast.success(`Backdate request ${status}`)
      }
      setRequests((prev) => prev.map((item) => (item.id === requestId ? { ...item, ...json.request } : item)))
      void load()
      dispatchNightAuditPendingChanged()
    } catch {
      toast.error('Failed to update request')
    } finally {
      setDecidingId(null)
    }
  }

  const pendingCount = requests.filter((r) => r.status === 'pending').length
  const typeOptions = Array.from(new Set(requests.map((r) => r.request_type).filter(Boolean)))
    .sort()
    .map((type) => ({ value: type, label: type.replace(/_/g, ' ') }))
  const requestDate = (request: BackdateRequest) => request.created_at.slice(0, 10)

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <CalendarClock className="h-5 w-5 text-muted-foreground" />
          <div>
            <CardTitle className="text-base">Backdate requests</CardTitle>
            <CardDescription>
              Approve or reject staff requests to record bookings or reservations with past check-in dates.
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
        ) : (
          <PaginatedListShell
            items={requests}
            pageSize={8}
            searchPlaceholder="Search request, guest, org, reason…"
            filters={[
              {
                key: 'status',
                label: 'Status',
                options: [
                  { value: 'pending', label: 'Pending' },
                  { value: 'approved', label: 'Approved' },
                  { value: 'rejected', label: 'Rejected' },
                ],
              },
              ...(typeOptions.length > 1
                ? [{ key: 'type', label: 'Type', options: typeOptions }]
                : []),
              {
                key: 'created',
                label: 'Submitted',
                options: [
                  { value: 'today', label: 'Today' },
                  { value: '7d', label: 'Last 7 days' },
                  { value: '30d', label: 'Last 30 days' },
                ],
              },
            ]}
            searchMatch={(request, query) => {
              const q = query.trim().toLowerCase()
              const s = request.summary
              return [
                request.id,
                request.request_type,
                request.reason,
                request.requested_by_name,
                request.status,
                s?.guest_name,
                s?.guest_phone,
                s?.organization_name,
                s?.room_number,
                request.metadata?.created_folio_id,
              ]
                .filter(Boolean)
                .some((value) => String(value).toLowerCase().includes(q))
            }}
            filterMatch={(request, key, value) => {
              if (key === 'status') return request.status === value
              if (key === 'type') return request.request_type === value
              if (key === 'created') {
                const created = requestDate(request)
                const today = new Date()
                const start = new Date()
                if (value === 'today') return created === today.toISOString().slice(0, 10)
                if (value === '7d') start.setDate(today.getDate() - 7)
                if (value === '30d') start.setDate(today.getDate() - 30)
                return new Date(`${created}T12:00:00`) >= start
              }
              return undefined
            }}
            emptyMessage="No matching backdate requests."
          >
            {(pageRequests) => (
              <div className="grid gap-3">
                {pageRequests.map((request) => (
              <Card key={request.id} className="border-muted shadow-none">
                <CardContent className="space-y-3 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="font-medium capitalize">
                          {request.request_type.replace(/_/g, ' ')} backdate
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
                      <p className="mt-1 text-xs text-muted-foreground">
                        Request ID {request.id.slice(0, 8)}…
                        {request.decided_at
                          ? ` · Decided ${formatRequestInstant(request.decided_at)}`
                          : ''}
                      </p>
                    </div>
                    {request.status === 'pending' && (
                      <div className="flex shrink-0 gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => void decide(request.id, 'rejected')}
                          disabled={decidingId === request.id}
                        >
                          Reject
                        </Button>
                        <Button
                          size="sm"
                          onClick={() => void decide(request.id, 'approved')}
                          disabled={decidingId === request.id}
                        >
                          {decidingId === request.id ? (
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          ) : null}
                          Approve
                        </Button>
                      </div>
                    )}
                  </div>

                  <BackdateRequestDetails request={request} />

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
                  {request.status === 'approved' && request.created_booking_id && (
                    <Button variant="link" className="h-auto p-0 text-sm" asChild>
                      <Link href={`/bookings/${request.created_booking_id}`}>Open created booking</Link>
                    </Button>
                  )}
                </CardContent>
              </Card>
                ))}
              </div>
            )}
          </PaginatedListShell>
        )}
      </CardContent>
    </Card>
  )
}
