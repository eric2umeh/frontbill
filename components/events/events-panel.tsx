'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useReservationsEventsHeader } from '@/components/reservations/reservations-events-header'
import { format, parseISO } from 'date-fns'
import { useAuth } from '@/lib/auth-context'
import {
  EventClientSearchField,
  type EventClientValue,
} from '@/components/events/event-client-search-field'
import {
  EventPaymentSection,
  type EventPaymentFormValue,
} from '@/components/events/event-payment-section'
import { computeEventPayment } from '@/lib/events/compute-event-payment'
import { effectiveEventEndDate } from '@/lib/events/event-date-overlap'
import { EventDateAvailability } from '@/components/events/event-date-availability'
import { EventTimeField } from '@/components/events/event-time-field'
import { canManageEvents } from '@/lib/events/access'
import { eventsApiHeaders } from '@/lib/events/events-api-headers'
import type { HotelEventRow } from '@/lib/events/types'
import { EVENT_VENUE_PRESETS } from '@/lib/events/types'
import {
  EventOtherServicesSection,
  priceMapFromLines,
} from '@/components/events/event-other-services-section'
import {
  computeEventEstimatedTotal,
  eventOtherServiceLabel,
  inferOtherServiceChoice,
  parseEventOtherServices,
  sumEventOtherServices,
  type EventOtherServiceChoice,
  type EventOtherServiceLine,
} from '@/lib/events/event-other-services'
import { formatNaira } from '@/lib/utils/currency'
import { EnhancedDataTable } from '@/components/shared/enhanced-data-table'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
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
import { Plus, Pencil, Ban, Loader2 } from 'lucide-react'
import { EventPaymentReceiptButton } from '@/components/receipts/event-payment-receipt-button'

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
  client_type: 'guest' as EventClientValue['client_type'],
  client_name: '',
  client_phone: '',
  client_email: '',
  client_address: '',
  guest_id: null as string | null,
  client_organization_id: null as string | null,
  org_type: 'other',
  contact_person: '',
  expected_attendees: '',
  estimated_base_value: '',
  other_services: [] as EventOtherServiceLine[],
  other_service_prices: {} as Partial<Record<string, string>>,
  other_service_choice: 'multiple' as EventOtherServiceChoice,
  payment: defaultPayment(),
}

export function EventsPanel() {
  const { role, organizationId, userId, name: userName } = useAuth()
  const canManage = canManageEvents(role)
  const { setHeaderActions } = useReservationsEventsHeader()
  const [events, setEvents] = useState<HotelEventRow[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState<HotelEventRow | null>(null)
  const [cancelTarget, setCancelTarget] = useState<HotelEventRow | null>(null)
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

  const setClientFields = (client: EventClientValue) => {
    setForm((f) => ({
      ...f,
      client_type: client.client_type,
      client_name: client.client_name,
      client_phone: client.client_phone,
      client_email: client.client_email,
      client_address: client.client_address,
      guest_id: client.guest_id,
      client_organization_id: client.client_organization_id,
      org_type: client.org_type,
      contact_person: client.contact_person,
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
          : ev.venue || '',
      start_date: ev.start_date,
      end_date: ev.end_date,
      start_time: ev.start_time || '',
      end_time: ev.end_time || '',
      client_type:
        ev.client_type === 'organization'
          ? 'organization'
          : 'guest',
      client_name: ev.client_name || '',
      client_phone: ev.client_phone || '',
      client_email: ev.client_email || '',
      client_address: '',
      guest_id: ev.guest_id || null,
      client_organization_id: ev.client_organization_id || null,
      org_type: 'other',
      contact_person: '',
      expected_attendees: ev.expected_attendees != null ? String(ev.expected_attendees) : '',
      estimated_base_value: (() => {
        const other = parseEventOtherServices(ev.other_services)
        const otherTotal = sumEventOtherServices(other)
        const total = Number(ev.estimated_value) || 0
        return String(Math.max(0, Math.round((total - otherTotal) * 100) / 100))
      })(),
      other_services: parseEventOtherServices(ev.other_services),
      other_service_prices: priceMapFromLines(parseEventOtherServices(ev.other_services)),
      other_service_choice: inferOtherServiceChoice(parseEventOtherServices(ev.other_services)),
      payment: {
        payment_method:
          ev.payment_method === 'pending' || ev.payment_status === 'pending'
            ? 'pending'
            : ev.payment_method || 'pos',
        payment_status:
          ev.payment_method === 'pending' || ev.payment_status === 'pending'
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
    if (
      form.other_service_choice !== 'none' &&
      form.other_service_choice !== 'multiple' &&
      form.other_services.length === 0
    ) {
      toast.error('Enter a price for the selected other service')
      return
    }

    const totalAmount = eventTotalAmount
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
    if (!form.client_name.trim()) {
      toast.error(
        form.client_type === 'organization'
          ? 'Organization name is required'
          : 'Guest name is required',
      )
      return
    }

    setSaving(true)
    try {
      const body = {
        title: form.title,
        description: form.description,
        venue: form.venue.trim() || null,
        other_services: form.other_services,
        start_date: form.start_date,
        end_date: resolvedEnd,
        start_time: form.start_time,
        end_time: form.end_time,
        client_type: form.client_type,
        client_name: form.client_name,
        client_phone: form.client_phone,
        client_email: form.client_email,
        client_address: form.client_address,
        guest_id: form.guest_id,
        client_organization_id: form.client_organization_id,
        org_type: form.org_type,
        contact_person: form.contact_person,
        expected_attendees: form.expected_attendees,
        estimated_base_value: form.estimated_base_value,
        estimated_value: totalAmount,
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

  const confirmCancelEvent = async () => {
    if (!cancelTarget) return
    setSaving(true)
    try {
      const res = await fetch(`/api/events/${cancelTarget.id}`, {
        method: 'PATCH',
        headers: await eventsApiHeaders({ 'Content-Type': 'application/json' }),
        credentials: 'include',
        body: JSON.stringify({ status: 'cancelled' }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) {
        toast.error(json.error || 'Cancel failed')
        return
      }
      toast.success('Event cancelled')
      setCancelTarget(null)
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
        ev.start_time && ev.end_time
          ? ` · ${ev.start_time} – ${ev.end_time}`
          : ev.start_time
            ? ` · ${ev.start_time}`
            : ev.end_time
              ? ` · until ${ev.end_time}`
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

  const eventTotalAmount = useMemo(
    () =>
      computeEventEstimatedTotal(
        Math.max(0, Number(form.estimated_base_value) || 0),
        form.other_services,
      ),
    [form.estimated_base_value, form.other_services],
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
        onRowClick={canManage ? (ev) => openEdit(ev) : undefined}
        columns={[
          {
            key: 'title',
            label: 'Event',
            render: (ev) => (
              <div>
                <div className="font-medium">{ev.title}</div>
                {ev.venue && <div className="text-xs text-muted-foreground">{ev.venue}</div>}
                {ev.other_services && ev.other_services.length > 0 && (
                  <div className="text-xs text-muted-foreground">
                    + {ev.other_services.map((s) => eventOtherServiceLabel(s.type)).join(', ')}
                  </div>
                )}
              </div>
            ),
          },
          {
            key: 'period',
            label: 'Period',
            render: (ev) => (
              <div className="space-y-1">
                <span className="text-sm whitespace-nowrap block">{ev ? formatPeriod(ev) : '—'}</span>
                {ev.status === 'cancelled' && (
                  <Badge variant="outline" className="text-[10px] text-destructive border-destructive/40">
                    Cancelled
                  </Badge>
                )}
              </div>
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
          {
            key: 'receipt',
            label: '',
            render: (ev) => (
              <div className="flex justify-end">
                <EventPaymentReceiptButton
                  event={ev}
                  role={role}
                  userId={userId}
                  userName={userName}
                />
              </div>
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
                        title="Edit event"
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      {ev.status !== 'cancelled' && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-destructive"
                          title="Cancel event"
                          onClick={() => setCancelTarget(ev)}
                        >
                          <Ban className="h-4 w-4" />
                        </Button>
                      )}
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
                    setForm((f) => {
                      const hadRange =
                        Boolean(f.end_date) &&
                        f.end_date !== f.start_date &&
                        f.end_date >= f.start_date
                      return {
                        ...f,
                        start_date: start,
                        end_date: hadRange && f.end_date >= start ? f.end_date : start,
                      }
                    })
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
              <EventTimeField
                label="Start time"
                value={form.start_time}
                onChange={(start_time) => setForm((f) => ({ ...f, start_time }))}
                disabled={saving}
              />
              <EventTimeField
                label="End time"
                value={form.end_time}
                onChange={(end_time) => setForm((f) => ({ ...f, end_time }))}
                optional
                disabled={saving}
              />
            </div>
            <div className="space-y-1">
              <Label>Venue / hall</Label>
              <Select
                value={form.venue || undefined}
                onValueChange={(v) =>
                  setForm((f) => ({
                    ...f,
                    venue: v,
                    other_service_choice:
                      f.other_service_choice === 'none' ? 'multiple' : f.other_service_choice,
                  }))
                }
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
            {form.venue && (
              <EventOtherServicesSection
                choice={form.other_service_choice}
                onChoiceChange={(other_service_choice) =>
                  setForm((f) => ({ ...f, other_service_choice }))
                }
                lines={form.other_services}
                onChange={(other_services) => setForm((f) => ({ ...f, other_services }))}
                priceByType={form.other_service_prices}
                onPriceByTypeChange={(other_service_prices) =>
                  setForm((f) => ({ ...f, other_service_prices }))
                }
                disabled={saving}
              />
            )}
            {organizationId ? (
              <EventClientSearchField
                key={editing?.id ?? 'create'}
                organizationId={organizationId}
                value={{
                  client_type: form.client_type,
                  client_name: form.client_name,
                  client_phone: form.client_phone,
                  client_email: form.client_email,
                  client_address: form.client_address,
                  guest_id: form.guest_id,
                  client_organization_id: form.client_organization_id,
                  org_type: form.org_type,
                  contact_person: form.contact_person,
                }}
                onChange={setClientFields}
                disabled={saving}
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
                <Label>Hall / package value (₦)</Label>
                <Input
                  type="number"
                  min={0}
                  value={form.estimated_base_value}
                  onChange={(e) => setForm((f) => ({ ...f, estimated_base_value: e.target.value }))}
                />
              </div>
            </div>
            {form.other_services.length > 0 && (
              <p className="text-sm">
                Event total:{' '}
                <span className="font-semibold tabular-nums">{formatNaira(eventTotalAmount)}</span>
                <span className="text-muted-foreground text-xs ml-1">(hall + other services)</span>
              </p>
            )}
            <div className="space-y-1">
              <Label>Description</Label>
              <Textarea
                rows={2}
                value={form.description}
                onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
              />
            </div>
            <EventPaymentSection
              totalAmount={eventTotalAmount}
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

      <AlertDialog open={Boolean(cancelTarget)} onOpenChange={(o) => !o && setCancelTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancel this event?</AlertDialogTitle>
            <AlertDialogDescription>
              {cancelTarget
                ? `${cancelTarget.title} (${formatPeriod(cancelTarget)}) will be marked cancelled. The guest or organization is not continuing with this booking.`
                : 'This event will be marked cancelled.'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep event</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => void confirmCancelEvent()}
              disabled={saving}
            >
              Cancel event
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
