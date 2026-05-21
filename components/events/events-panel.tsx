'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useReservationsEventsHeader } from '@/components/reservations/reservations-events-header'
import { format, parseISO } from 'date-fns'
import { useAuth } from '@/lib/auth-context'
import { EventClientSearchField } from '@/components/events/event-client-search-field'
import {
  EventPaymentSection,
  type EventPaymentFormValue,
} from '@/components/events/event-payment-section'
import { computeEventPayment } from '@/lib/events/compute-event-payment'
import { effectiveEventEndDate } from '@/lib/events/event-date-overlap'
import { EventDateAvailability } from '@/components/events/event-date-availability'
import { canManageEvents } from '@/lib/events/access'
import { eventsApiHeaders } from '@/lib/events/events-api-headers'
import type { HotelEventRow } from '@/lib/events/types'
import { EVENT_VENUE_PRESETS } from '@/lib/events/types'
import { formatNaira } from '@/lib/utils/currency'
import { EnhancedDataTable } from '@/components/shared/enhanced-data-table'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { PageLoadingState } from '@/components/loading-screen'
import { toast } from 'sonner'
import { Plus, Pencil, Trash2, Loader2 } from 'lucide-react'

const defaultPayment = (): EventPaymentFormValue => ({
  payment_method: 'cash',
  payment_status: 'paid',
  partial_amount: '',
  pay_above_total: false,
  folio_extras: { remarks: '', files: [] },
})

const emptyForm = {
  title: '',
  description: '',
  venue: '',
  start_date: '',
  end_date: '',
  start_time: '',
  end_time: '',
  client_name: '',
  client_phone: '',
  client_email: '',
  guest_id: null as string | null,
  expected_attendees: '',
  estimated_value: '',
  payment: defaultPayment(),
}

export function EventsPanel() {
  const { role, organizationId } = useAuth()
  const canManage = canManageEvents(role)
  const { setHeaderActions } = useReservationsEventsHeader()
  const [events, setEvents] = useState<HotelEventRow[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState<HotelEventRow | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<HotelEventRow | null>(null)
  const [form, setForm] = useState(emptyForm)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/events', {
        headers: await eventsApiHeaders(),
        credentials: 'include',
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) {
        if (/hotel_events/i.test(json.error || '') && /does not exist/i.test(json.error || '')) {
          setEvents([])
          return
        }
        toast.error(json.error || 'Failed to load events')
        return
      }
      setEvents(
        (json.events ?? []).filter(
          (e: HotelEventRow | null): e is HotelEventRow =>
            e != null && Boolean(e.start_date) && Boolean(e.end_date),
        ),
      )
    } catch {
      toast.error('Network error')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  useEffect(() => {
    if (!canManage) {
      setHeaderActions(null)
      return
    }
    setHeaderActions(
      <Button
        size="sm"
        onClick={() => {
          setEditing(null)
          const today = format(new Date(), 'yyyy-MM-dd')
          setForm({ ...emptyForm, start_date: today, end_date: today, payment: defaultPayment() })
          setDialogOpen(true)
        }}
      >
        <Plus className="h-4 w-4 mr-1" />
        New event
      </Button>,
    )
    return () => setHeaderActions(null)
  }, [canManage, setHeaderActions])

  const openCreate = () => {
    setEditing(null)
    const today = format(new Date(), 'yyyy-MM-dd')
    setForm({ ...emptyForm, start_date: today, end_date: today, payment: defaultPayment() })
    setDialogOpen(true)
  }

  const setClientFields = (client: {
    client_name: string
    client_phone: string
    client_email: string
    guest_id?: string | null
  }) => {
    setForm((f) => ({
      ...f,
      client_name: client.client_name,
      client_phone: client.client_phone,
      client_email: client.client_email,
      guest_id: client.guest_id ?? null,
    }))
  }

  const openEdit = (ev: HotelEventRow) => {
    setEditing(ev)
    setForm({
      title: ev.title,
      description: ev.description || '',
      venue:
        ev.venue && EVENT_VENUE_PRESETS.includes(ev.venue as (typeof EVENT_VENUE_PRESETS)[number])
          ? ev.venue
          : '',
      start_date: ev.start_date,
      end_date: ev.end_date,
      start_time: ev.start_time || '',
      end_time: ev.end_time || '',
      client_name: ev.client_name || '',
      client_phone: ev.client_phone || '',
      client_email: ev.client_email || '',
      expected_attendees: ev.expected_attendees != null ? String(ev.expected_attendees) : '',
      estimated_value: ev.estimated_value != null ? String(ev.estimated_value) : '',
      guest_id: null,
      payment: {
        payment_method: ev.payment_method || 'cash',
        payment_status:
          ev.payment_status === 'pending'
            ? 'unpaid'
            : ev.payment_status === 'partial'
              ? 'partial'
              : 'paid',
        partial_amount:
          ev.amount_paid != null
            ? String(ev.amount_paid)
            : ev.estimated_value != null
              ? String(ev.estimated_value)
              : '',
        pay_above_total:
          ev.amount_paid != null &&
          ev.estimated_value != null &&
          Number(ev.amount_paid) > Number(ev.estimated_value),
        folio_extras: { remarks: ev.remarks || '', files: [] },
      },
    })
    setDialogOpen(true)
  }

  const save = async () => {
    if (!form.title.trim()) {
      toast.error('Event title is required')
      return
    }
    if (!form.start_date) {
      toast.error('Start date is required')
      return
    }
    const resolvedEnd = effectiveEventEndDate(form.start_date, form.end_date)
    if (resolvedEnd < form.start_date) {
      toast.error('End date must be on or after start date')
      return
    }
    const totalAmount = Math.max(0, Number(form.estimated_value) || 0)
    const { depositAmount } = computeEventPayment({
      totalAmount,
      paymentStatus: form.payment.payment_status,
      partialAmount:
        typeof form.payment.partial_amount === 'number'
          ? form.payment.partial_amount
          : Number(form.payment.partial_amount) || 0,
      payAboveTotal: form.payment.pay_above_total,
    })
    if (form.payment.payment_status === 'partial' && depositAmount <= 0) {
      toast.error('Please enter the amount paid')
      return
    }

    setSaving(true)
    try {
      const body = {
        title: form.title,
        description: form.description,
        venue: form.venue.trim() || null,
        start_date: form.start_date,
        end_date: resolvedEnd,
        start_time: form.start_time,
        end_time: form.end_time,
        client_name: form.client_name,
        client_phone: form.client_phone,
        client_email: form.client_email,
        guest_id: form.guest_id,
        expected_attendees: form.expected_attendees,
        estimated_value: form.estimated_value,
        payment_method: form.payment.payment_method,
        payment_status: form.payment.payment_status,
        partial_amount: form.payment.partial_amount,
        pay_above_total: form.payment.pay_above_total,
        remarks: form.payment.folio_extras.remarks,
      }
      const url = editing ? `/api/events/${editing.id}` : '/api/events'
      const res = await fetch(url, {
        method: editing ? 'PATCH' : 'POST',
        headers: await eventsApiHeaders({ 'Content-Type': 'application/json' }),
        credentials: 'include',
        body: JSON.stringify(body),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) {
        toast.error(json.error || 'Save failed')
        return
      }
      if (json.warning) toast.warning(json.warning)

      const eventId = (json.event?.id as string) || editing?.id
      const files = form.payment.folio_extras.files?.filter(Boolean) || []
      if (eventId && files.length > 0) {
        const fd = new FormData()
        for (const file of files) fd.append('files', file)
        const attachRes = await fetch(`/api/events/${eventId}/attachments`, {
          method: 'POST',
          headers: await eventsApiHeaders(),
          credentials: 'include',
          body: fd,
        })
        const attachJson = await attachRes.json().catch(() => ({}))
        if (!attachRes.ok) {
          toast.warning(
            attachJson.error || 'Event saved but file upload failed',
          )
        }
      }

      toast.success(editing ? 'Event updated' : 'Event created')
      setDialogOpen(false)
      void load()
    } catch {
      toast.error('Network error')
    } finally {
      setSaving(false)
    }
  }

  const confirmDelete = async () => {
    if (!deleteTarget) return
    setSaving(true)
    try {
      const res = await fetch(`/api/events/${deleteTarget.id}`, {
        method: 'DELETE',
        headers: await eventsApiHeaders(),
        credentials: 'include',
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) {
        toast.error(json.error || 'Delete failed')
        return
      }
      toast.success('Event deleted')
      setDeleteTarget(null)
      void load()
    } catch {
      toast.error('Network error')
    } finally {
      setSaving(false)
    }
  }

  const formatPeriod = (ev: HotelEventRow | null | undefined) => {
    if (!ev?.start_date || !ev?.end_date) return '—'
    try {
      const start = format(parseISO(String(ev.start_date).slice(0, 10)), 'd MMM yyyy')
      const end = format(parseISO(String(ev.end_date).slice(0, 10)), 'd MMM yyyy')
      const range = ev.start_date === ev.end_date ? start : `${start} – ${end}`
      const times =
        ev.start_time || ev.end_time
          ? ` · ${ev.start_time || '—'}${ev.end_time ? ` – ${ev.end_time}` : ''}`
          : ''
      return range + times
    } catch {
      return `${ev.start_date} – ${ev.end_date}`
    }
  }

  const resolvedFormEnd = useMemo(
    () => (form.start_date ? effectiveEventEndDate(form.start_date, form.end_date) : ''),
    [form.start_date, form.end_date],
  )

  if (loading) return <PageLoadingState />

  return (
    <div className="space-y-4">
      {!canManage && (
        <p className="text-sm text-muted-foreground">
          View only — contact Front Desk or Manager to add or change events.
        </p>
      )}

      <EnhancedDataTable
        compactTable
        data={events}
        searchKeys={['title', 'venue', 'client_name', 'client_phone', 'remarks'] as (keyof HotelEventRow)[]}
        dateField="start_date"
        columns={[
          {
            key: 'title',
            label: 'Event',
            render: (ev) => (
              <div>
                <div className="font-medium">{ev.title}</div>
                {ev.venue && <div className="text-xs text-muted-foreground">{ev.venue}</div>}
              </div>
            ),
          },
          {
            key: 'period',
            label: 'Period',
            render: (ev) => (
              <span className="text-sm whitespace-nowrap">{ev ? formatPeriod(ev) : '—'}</span>
            ),
          },
          {
            key: 'client_name',
            label: 'Client',
            render: (ev) => (
              <div className="text-sm">
                <div>{ev.client_name || '—'}</div>
                {ev.client_phone && (
                  <div className="text-xs text-muted-foreground">{ev.client_phone}</div>
                )}
              </div>
            ),
          },
          {
            key: 'expected_attendees',
            label: 'Guests',
            render: (ev) => (
              <span className="tabular-nums">{ev.expected_attendees ?? '—'}</span>
            ),
          },
          {
            key: 'estimated_value',
            label: 'Est. value',
            render: (ev) => (
              <span className="text-right block">
                {ev.estimated_value != null ? formatNaira(Number(ev.estimated_value)) : '—'}
              </span>
            ),
          },
          ...(canManage
            ? [
                {
                  key: 'actions',
                  label: '',
                  render: (ev: HotelEventRow) => (
                    <div className="flex gap-1 justify-end">
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        onClick={() => openEdit(ev)}
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-destructive"
                        onClick={() => setDeleteTarget(ev)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  ),
                },
              ]
            : []),
        ]}
      />

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing ? 'Edit event' : 'New event'}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-3 py-2">
            <div className="space-y-1">
              <Label>Title *</Label>
              <Input
                value={form.title}
                onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                placeholder="e.g. Adebayo wedding reception"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Start date *</Label>
                <Input
                  type="date"
                  value={form.start_date}
                  onChange={(e) => {
                    const start = e.target.value
                    setForm((f) => ({
                      ...f,
                      start_date: start,
                      end_date: start,
                    }))
                  }}
                />
              </div>
              <div className="space-y-1">
                <Label>End date (optional)</Label>
                <Input
                  type="date"
                  value={form.end_date}
                  min={form.start_date || undefined}
                  onChange={(e) => setForm((f) => ({ ...f, end_date: e.target.value }))}
                />
                {form.start_date && (
                  <p className="text-xs text-muted-foreground">
                    Leave blank or same as start for a single-day event.
                  </p>
                )}
              </div>
            </div>
            {form.start_date && /^\d{4}-\d{2}-\d{2}$/.test(form.start_date) && (
              <EventDateAvailability
                events={events}
                startDate={form.start_date}
                endDate={resolvedFormEnd}
                excludeEventId={editing?.id}
              />
            )}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Start time</Label>
                <Input
                  placeholder="e.g. 14:00"
                  value={form.start_time}
                  onChange={(e) => setForm((f) => ({ ...f, start_time: e.target.value }))}
                />
              </div>
              <div className="space-y-1">
                <Label>End time</Label>
                <Input
                  placeholder="e.g. 22:00"
                  value={form.end_time}
                  onChange={(e) => setForm((f) => ({ ...f, end_time: e.target.value }))}
                />
              </div>
            </div>
            <div className="space-y-1">
              <Label>Venue / hall</Label>
              <Select
                value={form.venue || undefined}
                onValueChange={(v) => setForm((f) => ({ ...f, venue: v }))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select venue" />
                </SelectTrigger>
                <SelectContent>
                  {EVENT_VENUE_PRESETS.map((v) => (
                    <SelectItem key={v} value={v}>
                      {v}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {organizationId ? (
              <EventClientSearchField
                key={editing?.id ?? 'create'}
                organizationId={organizationId}
                value={{
                  client_name: form.client_name,
                  client_phone: form.client_phone,
                  client_email: form.client_email,
                  guest_id: form.guest_id,
                }}
                onChange={setClientFields}
              />
            ) : (
              <div className="space-y-1">
                <Label>Client name</Label>
                <Input
                  value={form.client_name}
                  onChange={(e) => setForm((f) => ({ ...f, client_name: e.target.value }))}
                />
              </div>
            )}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Expected guests</Label>
                <Input
                  type="number"
                  min={0}
                  value={form.expected_attendees}
                  onChange={(e) => setForm((f) => ({ ...f, expected_attendees: e.target.value }))}
                />
              </div>
              <div className="space-y-1">
                <Label>Estimated value (₦)</Label>
                <Input
                  type="number"
                  min={0}
                  value={form.estimated_value}
                  onChange={(e) => setForm((f) => ({ ...f, estimated_value: e.target.value }))}
                />
              </div>
            </div>
            <div className="space-y-1">
              <Label>Description</Label>
              <Textarea
                rows={2}
                value={form.description}
                onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
              />
            </div>
            <EventPaymentSection
              totalAmount={Math.max(0, Number(form.estimated_value) || 0)}
              value={form.payment}
              onChange={(payment) => setForm((f) => ({ ...f, payment }))}
              disabled={saving}
            />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>
              Cancel
            </Button>
            <Button type="button" onClick={() => void save()} disabled={saving}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : editing ? 'Save changes' : 'Create event'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={Boolean(deleteTarget)} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this event?</AlertDialogTitle>
            <AlertDialogDescription>
              {deleteTarget
                ? `${deleteTarget.title} (${formatPeriod(deleteTarget)}) will be removed permanently.`
                : 'This event will be removed permanently.'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => void confirmDelete()}
              disabled={saving}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
