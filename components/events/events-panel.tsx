'use client'

import { useCallback, useEffect, useState } from 'react'
import { format, parseISO } from 'date-fns'
import { useAuth } from '@/lib/auth-context'
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
  expected_attendees: '',
  estimated_value: '',
  notes: '',
}

export function EventsPanel() {
  const { role } = useAuth()
  const canManage = canManageEvents(role)
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

  const openCreate = () => {
    setEditing(null)
    const today = format(new Date(), 'yyyy-MM-dd')
    setForm({ ...emptyForm, start_date: today, end_date: today })
    setDialogOpen(true)
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
      notes: ev.notes || '',
    })
    setDialogOpen(true)
  }

  const save = async () => {
    if (!form.title.trim()) {
      toast.error('Event title is required')
      return
    }
    if (!form.start_date || !form.end_date) {
      toast.error('Start and end dates are required')
      return
    }
    if (form.end_date < form.start_date) {
      toast.error('End date must be on or after start date')
      return
    }
    setSaving(true)
    try {
      const body = { ...form, venue: form.venue.trim() || null }
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

  if (loading) return <PageLoadingState />

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          Schedule banquets, conferences, and hall hire for specific date ranges.
          {!canManage && ' View only — contact Front Desk or Manager to make changes.'}
        </p>
        {canManage && (
          <Button size="sm" onClick={openCreate}>
            <Plus className="h-4 w-4 mr-1" />
            New event
          </Button>
        )}
      </div>

      <EnhancedDataTable
        compactTable
        data={events}
        searchKeys={['title', 'venue', 'client_name', 'client_phone', 'notes'] as (keyof HotelEventRow)[]}
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
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
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
                  onChange={(e) => setForm((f) => ({ ...f, start_date: e.target.value }))}
                />
              </div>
              <div className="space-y-1">
                <Label>End date *</Label>
                <Input
                  type="date"
                  value={form.end_date}
                  min={form.start_date}
                  onChange={(e) => setForm((f) => ({ ...f, end_date: e.target.value }))}
                />
              </div>
            </div>
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
            <div className="space-y-1">
              <Label>Client name</Label>
              <Input
                value={form.client_name}
                onChange={(e) => setForm((f) => ({ ...f, client_name: e.target.value }))}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Phone</Label>
                <Input
                  value={form.client_phone}
                  onChange={(e) => setForm((f) => ({ ...f, client_phone: e.target.value }))}
                />
              </div>
              <div className="space-y-1">
                <Label>Email</Label>
                <Input
                  type="email"
                  value={form.client_email}
                  onChange={(e) => setForm((f) => ({ ...f, client_email: e.target.value }))}
                />
              </div>
            </div>
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
            <div className="space-y-1">
              <Label>Internal notes</Label>
              <Textarea
                rows={2}
                value={form.notes}
                onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
              />
            </div>
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
