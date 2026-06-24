'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Loader2, Percent } from 'lucide-react'
import { toast } from 'sonner'
import { dispatchNightAuditPendingChanged } from '@/lib/utils/dispatch-night-audit-pending-changed'
import { formatNaira } from '@/lib/utils/currency'
import { FolioAttachmentLinks } from '@/components/folio/folio-attachment-links'
import { PaginatedListShell } from '@/components/shared/paginated-list-shell'

interface Row {
  id: string
  booking_id: string
  new_check_out: string
  additional_nights: number
  standard_total: number
  discounted_total: number
  discount_amount: number
  payment_method: string
  reason: string
  status: string
  requested_by_name: string
  approved_by_name?: string | null
  decision_note?: string | null
  created_at: string
}

export function ExtendStayDiscountTab({ userId }: { userId: string }) {
  const [rows, setRows] = useState<Row[]>([])
  const [loading, setLoading] = useState(true)
  const [deciding, setDeciding] = useState<string | null>(null)

  const load = async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/extend-stay-discount-requests?caller_id=${userId}`, { credentials: 'include' })
      const json = await res.json()
      if (!res.ok) {
        toast.error(json.error || 'Failed to load')
        setRows([])
        return
      }
      setRows(json.requests || [])
    } catch {
      setRows([])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (userId) load()
  }, [userId])

  const decide = async (id: string, status: 'approved' | 'rejected') => {
    setDeciding(id)
    try {
      const res = await fetch('/api/extend-stay-discount-requests', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          caller_id: userId,
          request_id: id,
          status,
          decision_note: status === 'approved' ? 'Approved — discounted extension applied' : 'Rejected',
        }),
      })
      const json = await res.json()
      if (!res.ok) {
        toast.error(json.error || 'Failed')
        return
      }
      toast.success(status === 'approved' ? 'Discounted extension applied' : 'Rejected')
      await load()
      dispatchNightAuditPendingChanged()
    } catch {
      toast.error('Failed')
    } finally {
      setDeciding(null)
    }
  }

  const pending = rows.filter((r) => r.status === 'pending').length

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <Percent className="h-5 w-5 text-muted-foreground" />
          <div>
            <CardTitle className="text-base">Extend-stay discount requests</CardTitle>
            <CardDescription>
              Front desk requests a lower total for extra nights; approval posts the discounted folio line and new
              checkout date.
              {pending > 0 && (
                <Badge variant="secondary" className="ml-2">
                  {pending} pending
                </Badge>
              )}
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {loading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <PaginatedListShell
            items={rows}
            pageSize={8}
            searchPlaceholder="Search requester, reason, booking…"
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
              {
                key: 'payment',
                label: 'Payment',
                options: [
                  { value: 'cash', label: 'Cash' },
                  { value: 'pos', label: 'POS' },
                  { value: 'transfer', label: 'Transfer' },
                  { value: 'city_ledger', label: 'City ledger' },
                  { value: 'pending', label: 'Pending' },
                ],
              },
            ]}
            searchMatch={(r, query) => {
              const q = query.trim().toLowerCase()
              return [
                r.booking_id,
                r.reason,
                r.status,
                r.payment_method,
                r.requested_by_name,
                r.approved_by_name,
                r.decision_note,
              ]
                .filter(Boolean)
                .some((value) => String(value).toLowerCase().includes(q))
            }}
            filterMatch={(r, key, value) => {
              if (key === 'status') return r.status === value
              if (key === 'payment') return String(r.payment_method || '').toLowerCase() === value
              return undefined
            }}
            emptyMessage="No matching discount requests."
          >
            {(pageRows) => (
              <div className="grid gap-3">
                {pageRows.map((r) => (
              <Card key={r.id} className="border-muted shadow-none">
                <CardContent className="p-4 space-y-2 text-sm">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <Badge variant={r.status === 'pending' ? 'default' : r.status === 'approved' ? 'secondary' : 'destructive'}>
                        {r.status}
                      </Badge>
                      <p className="mt-2 font-medium">
                        {formatNaira(r.standard_total)} → {formatNaira(r.discounted_total)} (−{formatNaira(r.discount_amount)})
                      </p>
                      <p className="text-muted-foreground text-xs">
                        +{r.additional_nights} night(s) · checkout {r.new_check_out} · {r.payment_method}
                      </p>
                      <p className="text-xs mt-1">By {r.requested_by_name}</p>
                    </div>
                    {r.status === 'pending' && (
                      <div className="flex gap-2 shrink-0">
                        <Button size="sm" variant="outline" disabled={deciding === r.id} onClick={() => decide(r.id, 'rejected')}>
                          Reject
                        </Button>
                        <Button size="sm" disabled={deciding === r.id} onClick={() => decide(r.id, 'approved')}>
                          {deciding === r.id ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Approve'}
                        </Button>
                      </div>
                    )}
                  </div>
                  <div className="rounded-md bg-muted/50 p-2 text-xs">
                    <span className="font-medium">Reason: </span>
                    {r.reason}
                  </div>
                  <FolioAttachmentLinks
                    bookingId={r.booking_id}
                    userId={userId}
                    source="extend_stay_discount"
                    sourceId={r.id}
                  />
                  <Button variant="link" className="h-auto p-0 text-xs" asChild>
                    <Link href={`/bookings/${r.booking_id}`}>Open folio</Link>
                  </Button>
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
