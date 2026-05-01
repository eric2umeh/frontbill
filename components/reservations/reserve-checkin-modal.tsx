'use client'

import { useState, useEffect, useMemo } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { formatPersonName, normalizeNameKey } from '@/lib/utils/name-format'

export interface ReserveCheckInBooking {
  id: string
  organization_id: string
  folio_id: string
  check_in: string
  check_out: string
  guest_id?: string | null
  room_id?: string | null
  rate_per_night?: number | null
  guests?: { name?: string | null } | null
  rooms?: { id?: string; room_number?: string; room_type?: string } | null
}

interface Props {
  open: boolean
  onClose: () => void
  onSuccess: () => void
  booking: ReserveCheckInBooking | null
  userId: string
}

export function ReserveCheckInModal({ open, onClose, onSuccess, booking, userId }: Props) {
  const [loading, setLoading] = useState(false)
  const [roomsFetch, setRoomsFetch] = useState<Array<{ id: string; room_number: string; room_type: string; status: string }>>([])
  const [bookingsFetch, setBookingsFetch] = useState<
    Array<{ id: string; room_id: string | null; check_in: string; check_out: string; status: string }>
  >([])
  const [guestNameOpt, setGuestNameOpt] = useState('')
  const [guestPhoneOpt, setGuestPhoneOpt] = useState('')
  const [selectedRoomId, setSelectedRoomId] = useState('')

  const cin = booking?.check_in ?? ''
  const cout = booking?.check_out ?? ''
  const orgId = booking?.organization_id ?? ''

  useEffect(() => {
    if (!open || !booking) return
    setGuestNameOpt((booking.guests as any)?.name || '')
    setGuestPhoneOpt('')
    ;(async () => {
      const supabase = createClient()
      if (!supabase) return
      const [{ data: rms }, { data: bks }] = await Promise.all([
        supabase
          .from('rooms')
          .select('id, room_number, room_type, status')
          .eq('organization_id', orgId)
          .neq('status', 'maintenance')
          .order('room_number'),
        supabase
          .from('bookings')
          .select('id, room_id, check_in, check_out, status')
          .eq('organization_id', orgId)
          .in('status', ['reserved', 'confirmed', 'checked_in']),
      ])
      setRoomsFetch((rms || []) as any[])
      setBookingsFetch(((bks || []) as any[]).filter((b) => b.id !== booking.id))
    })()
  }, [open, booking?.id, orgId])

  const bookedOverlapRoomIds = useMemo(() => {
    return new Set(
      bookingsFetch
        .filter(
          (b) =>
            String(b.room_id || '') &&
            b.check_in < cout &&
            b.check_out > cin &&
            ['reserved', 'confirmed', 'checked_in'].includes(String(b.status || '')),
        )
        .map((b) => b.room_id as string),
    )
  }, [bookingsFetch, cin, cout])

  const availableRooms = useMemo(() => {
    return roomsFetch.filter((r) => {
      if (!r.id) return false
      if (booking?.room_id && r.id === booking.room_id) return true
      if (bookedOverlapRoomIds.has(r.id)) return false
      return true
    })
  }, [roomsFetch, bookedOverlapRoomIds, booking?.room_id])

  const byTypeCounts = useMemo(() => {
    const m: Record<string, number> = {}
    for (const r of availableRooms) {
      const t = r.room_type || 'Other'
      m[t] = (m[t] || 0) + 1
    }
    return m
  }, [availableRooms])

  useEffect(() => {
    if (!open || !booking || availableRooms.length === 0) {
      setSelectedRoomId('')
      return
    }
    const hasCurrent =
      booking.room_id && availableRooms.some((r) => r.id === booking.room_id)
    if (hasCurrent && booking.room_id) {
      setSelectedRoomId(booking.room_id)
      return
    }
    const preferredRows = booking.rooms?.room_type
      ? sortByRoomNumber(
          availableRooms.filter(
            (r) => r.room_type === booking.rooms?.room_type && r.id !== booking.room_id,
          ),
        )
      : []

    const excludingCurrent = sortByRoomNumber(
      booking.room_id ? availableRooms.filter((r) => r.id !== booking.room_id) : [...availableRooms],
    )
    const pick =
      preferredRows[0]?.id ?? excludingCurrent[0]?.id ?? availableRooms[0]?.id ?? ''
    setSelectedRoomId(pick)
  }, [open, booking?.id, booking?.room_id, booking?.rooms?.room_type, availableRooms])

  const handleConfirm = async () => {
    if (!booking?.id || !selectedRoomId) {
      toast.error('Select an available room')
      return
    }
    const supabase = createClient()
    if (!supabase) return

    setLoading(true)
    try {
      let finalGuestId = booking.guest_id || null
      const nameInput = guestNameOpt.trim()
      const phoneInput = guestPhoneOpt.trim()

      if (nameInput) {
        const formatted = formatPersonName(nameInput)
        const nk = normalizeNameKey(formatted)
        if (!finalGuestId && nk) {
          const { data: existing } = await supabase
            .from('guests')
            .select('id')
            .eq('organization_id', orgId)
            .ilike('name', formatted)
            .maybeSingle()
          if (existing?.id) {
            finalGuestId = existing.id
          } else {
            const { data: inserted, error: ge } = await supabase
              .from('guests')
              .insert([{ organization_id: orgId, name: formatted, phone: phoneInput || null }])
              .select('id')
              .single()
            if (ge) throw ge
            finalGuestId = inserted.id
          }
        }
      }

      const prevRoomId = booking.room_id ? String(booking.room_id) : null
      if (prevRoomId && prevRoomId !== selectedRoomId) {
        await supabase.from('rooms').update({ status: 'available', updated_at: new Date().toISOString() }).eq('id', prevRoomId)
      }

      const patch: Record<string, unknown> = {
        status: 'checked_in',
        room_id: selectedRoomId,
        updated_at: new Date().toISOString(),
        updated_by: userId,
      }
      if (finalGuestId) patch.guest_id = finalGuestId

      const { error: be } = await supabase.from('bookings').update(patch).eq('id', booking.id)
      if (be) throw be

      await supabase
        .from('rooms')
        .update({ status: 'occupied', updated_at: new Date().toISOString() })
        .eq('id', selectedRoomId)

      toast.success('Guest checked in')
      onSuccess()
      onClose()
    } catch (e: any) {
      toast.error(e?.message || 'Check-in failed')
    } finally {
      setLoading(false)
    }
  }

  if (!booking) return null

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose() }}>
      <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Check in from reservation</DialogTitle>
          <DialogDescription>
            Folio {booking.folio_id} · {booking.check_in} → {booking.check_out}. Pick an available room for today’s stay.
            Guest details are optional if the reservation already has a contact.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div>
            <p className="text-xs font-medium text-muted-foreground mb-2">Available by type</p>
            <div className="flex flex-wrap gap-2">
              {Object.entries(byTypeCounts).length === 0 ? (
                <span className="text-sm text-destructive">No free rooms for these dates.</span>
              ) : (
                Object.entries(byTypeCounts).map(([rt, count]) => (
                  <Badge key={rt} variant="outline" className="text-xs">
                    {rt}: {count}
                  </Badge>
                ))
              )}
            </div>
          </div>

          <div className="space-y-2">
            <Label>Room</Label>
            <Select value={selectedRoomId} onValueChange={setSelectedRoomId}>
              <SelectTrigger>
                <SelectValue placeholder="Select room" />
              </SelectTrigger>
              <SelectContent className="max-h-[220px]">
                {sortByRoomNumber([...availableRooms]).map((r) => (
                  <SelectItem key={r.id} value={r.id}>
                    Room {r.room_number} · {r.room_type}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Guest name (optional)</Label>
            <Input
              value={guestNameOpt}
              onChange={(e) => setGuestNameOpt(e.target.value)}
              placeholder="Override / add guest staying in this room"
            />
          </div>
          <div className="space-y-2">
            <Label>Phone (optional)</Label>
            <Input value={guestPhoneOpt} onChange={(e) => setGuestPhoneOpt(e.target.value)} placeholder="Guest phone" />
          </div>
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <Button variant="outline" onClick={onClose} disabled={loading}>
            Cancel
          </Button>
          <Button onClick={handleConfirm} disabled={loading || availableRooms.length === 0}>
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Confirm check-in
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

function sortByRoomNumber<T extends { room_number?: string | number | null }>(rows: T[]) {
  return [...rows].sort((a, b) =>
    String(a.room_number ?? '').localeCompare(String(b.room_number ?? ''), undefined, { numeric: true }),
  )
}
