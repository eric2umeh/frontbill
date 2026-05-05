'use client'

import { useEffect, useMemo, useState } from 'react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { formatNaira } from '@/lib/utils/currency'
import { toast } from 'sonner'
import { Loader2 } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { BOOKING_MODAL_ROOMS_LIMIT, normalizeRoomsForBookingPickers } from '@/lib/utils/room-bookability'
import { calendarNightsBetween } from '@/lib/booking/edit-booking-patch'

export type EditBookingModalBooking = {
  id: string
  organization_id: string
  check_in: string
  check_out: string
  room_id: string
  rate_per_night: number
  total_amount: number
  deposit?: number | null
  balance?: number | null
  payment_status?: string | null
  payment_method?: string | null
  ledger_account_name?: string | null
  status?: string | null
  folio_status?: string | null
  notes?: string | null
  rooms?: { id?: string; room_number?: string; room_type?: string } | null
}

interface EditBookingModalProps {
  open: boolean
  onClose: () => void
  booking: EditBookingModalBooking | null
  userId: string | null
  onSaved: () => void | Promise<void>
}

const BOOKING_STATUSES = [
  { value: 'reserved', label: 'Reserved' },
  { value: 'confirmed', label: 'Confirmed' },
  { value: 'checked_in', label: 'Checked in' },
  { value: 'checked_out', label: 'Checked out' },
  { value: 'cancelled', label: 'Cancelled' },
  { value: 'active', label: 'Active' },
]

const PAYMENT_STATUSES = [
  { value: 'pending', label: 'Pending' },
  { value: 'partial', label: 'Partial' },
  { value: 'paid', label: 'Paid' },
  { value: 'city_ledger', label: 'City ledger' },
]

const PAYMENT_METHODS = ['cash', 'card', 'transfer', 'pos', 'city_ledger', 'complimentary']

function toYmdInput(isoOrYmd: string) {
  if (!isoOrYmd) return ''
  const s = isoOrYmd.slice(0, 10)
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : ''
}

export function EditBookingModal({ open, onClose, booking, userId, onSaved }: EditBookingModalProps) {
  const [rooms, setRooms] = useState<{ id: string; room_number: string; room_type: string }[]>([])
  const [loadingRooms, setLoadingRooms] = useState(false)
  const [saving, setSaving] = useState(false)

  const [checkIn, setCheckIn] = useState('')
  const [checkOut, setCheckOut] = useState('')
  const [roomId, setRoomId] = useState('')
  const [ratePerNight, setRatePerNight] = useState('')
  const [totalAmount, setTotalAmount] = useState('')
  const [deposit, setDeposit] = useState('')
  const [balance, setBalance] = useState('')
  const [paymentStatus, setPaymentStatus] = useState('pending')
  const [paymentMethod, setPaymentMethod] = useState('cash')
  const [ledgerAccountName, setLedgerAccountName] = useState('')
  const [status, setStatus] = useState('active')
  const [notes, setNotes] = useState('')

  const nightsPreview = useMemo(() => {
    if (!checkIn || !checkOut || checkIn >= checkOut) return 0
    try {
      return calendarNightsBetween(checkIn, checkOut)
    } catch {
      return 0
    }
  }, [checkIn, checkOut])

  useEffect(() => {
    if (!open || !booking?.organization_id) return

    const load = async () => {
      setLoadingRooms(true)
      try {
        const supabase = createClient()
        const { data, error } = await supabase
          .from('rooms')
          .select('id, room_number, room_type, status, organization_id')
          .eq('organization_id', booking.organization_id)
          .order('room_number')
          .limit(BOOKING_MODAL_ROOMS_LIMIT)

        if (error) throw error
        const normalized = normalizeRoomsForBookingPickers(data || []) as {
          id: string
          room_number: string
          room_type: string
        }[]

        const byId = new Map(normalized.map((r) => [r.id, r]))
        const curId = booking.room_id || booking.rooms?.id
        if (curId && !byId.has(curId)) {
          const num = booking.rooms?.room_number ?? '?'
          const rt = booking.rooms?.room_type ?? '—'
          byId.set(curId, { id: curId, room_number: String(num), room_type: String(rt) })
        }
        setRooms([...byId.values()].sort((a, b) => a.room_number.localeCompare(b.room_number, undefined, { numeric: true })))
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : 'Failed to load rooms'
        toast.error(msg)
        setRooms([])
      } finally {
        setLoadingRooms(false)
      }
    }

    load()
  }, [open, booking?.organization_id, booking?.room_id, booking?.rooms?.id, booking?.rooms?.room_number, booking?.rooms?.room_type])

  useEffect(() => {
    if (!open || !booking) return
    setCheckIn(toYmdInput(booking.check_in))
    setCheckOut(toYmdInput(booking.check_out))
    setRoomId(booking.room_id || booking.rooms?.id || '')
    setRatePerNight(String(Number(booking.rate_per_night ?? 0)))
    setTotalAmount(String(Number(booking.total_amount ?? 0)))
    setDeposit(String(Number(booking.deposit ?? 0)))
    setBalance(String(Number(booking.balance ?? 0)))
    setPaymentStatus(String(booking.payment_status || 'pending'))
    setPaymentMethod(String(booking.payment_method || 'cash'))
    setLedgerAccountName(String(booking.ledger_account_name || ''))
    setStatus(String(booking.status || 'active'))
    setNotes(String(booking.notes || ''))
  }, [open, booking])

  const handleSave = async () => {
    if (!booking || !userId) {
      toast.error('Missing booking or session')
      return
    }
    if (!checkIn || !checkOut || checkIn >= checkOut) {
      toast.error('Check-out must be after check-in')
      return
    }
    if (!roomId) {
      toast.error('Select a room')
      return
    }

    const nextRate = Number(ratePerNight)
    const nextTotal = Number(totalAmount)
    const nextDeposit = Number(deposit)
    const nextBalance = Number(balance)
    if ([nextRate, nextTotal, nextDeposit, nextBalance].some((n) => Number.isNaN(n))) {
      toast.error('Enter valid numbers for rate and amounts')
      return
    }

    const patch: Record<string, unknown> = {}
    if (checkIn !== toYmdInput(booking.check_in)) patch.check_in = checkIn
    if (checkOut !== toYmdInput(booking.check_out)) patch.check_out = checkOut
    if (roomId !== (booking.room_id || booking.rooms?.id)) patch.room_id = roomId
    if (nextRate !== Number(booking.rate_per_night ?? 0)) patch.rate_per_night = nextRate
    if (nextTotal !== Number(booking.total_amount ?? 0)) patch.total_amount = nextTotal
    if (nextDeposit !== Number(booking.deposit ?? 0)) patch.deposit = nextDeposit
    if (nextBalance !== Number(booking.balance ?? 0)) patch.balance = nextBalance
    if (paymentStatus !== String(booking.payment_status || 'pending')) patch.payment_status = paymentStatus
    if (paymentMethod !== String(booking.payment_method || 'cash')) patch.payment_method = paymentMethod || null

    const led = ledgerAccountName.trim()
    const prevLed = String(booking.ledger_account_name || '').trim()
    if (led !== prevLed) patch.ledger_account_name = led || null

    if (status !== String(booking.status || 'active')) patch.status = status
    if (notes.trim() !== String(booking.notes || '')) patch.notes = notes.trim() || null

    if (Object.keys(patch).length === 0) {
      toast.message('No changes to save')
      return
    }

    setSaving(true)
    try {
      const res = await fetch(`/api/bookings/${booking.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ caller_id: userId, patch }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) {
        const err = typeof json?.error === 'string' ? json.error : JSON.stringify(json?.error || res.status)
        throw new Error(err)
      }
      toast.success('Booking updated')
      await onSaved()
      onClose()
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Failed to update booking')
    } finally {
      setSaving(false)
    }
  }

  const stayLabel =
    nightsPreview > 0
      ? `${nightsPreview} night${nightsPreview === 1 ? '' : 's'} (${formatNaira(Number(ratePerNight || 0) * nightsPreview)} at current rate)`
      : '—'

  if (!booking) return null

  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && onClose()}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Edit booking</DialogTitle>
          <DialogDescription>
            Change stay dates, room assignment, rates, folio totals, payment flags, or status. Guest identity is unchanged.
            Structural edits require an administrator role and are enforced on the server.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 py-2">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="eb-check-in">Check-in</Label>
              <Input id="eb-check-in" type="date" value={checkIn} onChange={(e) => setCheckIn(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="eb-check-out">Check-out</Label>
              <Input id="eb-check-out" type="date" value={checkOut} onChange={(e) => setCheckOut(e.target.value)} />
            </div>
          </div>
          <p className="text-xs text-muted-foreground">{stayLabel}</p>

          <div className="space-y-2">
            <Label>Room</Label>
            <Select value={roomId} onValueChange={setRoomId} disabled={loadingRooms}>
              <SelectTrigger>
                <SelectValue placeholder={loadingRooms ? 'Loading rooms…' : 'Select room'} />
              </SelectTrigger>
              <SelectContent className="max-h-[240px]">
                {rooms.map((r) => (
                  <SelectItem key={r.id} value={r.id}>
                    {r.room_number} — {r.room_type}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="eb-rate">Rate / night (₦)</Label>
            <Input
              id="eb-rate"
              inputMode="decimal"
              value={ratePerNight}
              onChange={(e) => setRatePerNight(e.target.value)}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="eb-total">Total room charge (₦)</Label>
              <Input
                id="eb-total"
                inputMode="decimal"
                value={totalAmount}
                onChange={(e) => setTotalAmount(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="eb-deposit">Deposit (₦)</Label>
              <Input
                id="eb-deposit"
                inputMode="decimal"
                value={deposit}
                onChange={(e) => setDeposit(e.target.value)}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="eb-balance">Balance (₦)</Label>
            <Input
              id="eb-balance"
              inputMode="decimal"
              value={balance}
              onChange={(e) => setBalance(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              Usually matches unpaid folio total; adjust only when reconciling with charges.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>Payment status</Label>
              <Select value={paymentStatus} onValueChange={setPaymentStatus}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PAYMENT_STATUSES.map((o) => (
                    <SelectItem key={o.value} value={o.value}>
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Payment method</Label>
              <Select value={paymentMethod} onValueChange={setPaymentMethod}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PAYMENT_METHODS.map((m) => (
                    <SelectItem key={m} value={m}>
                      {m.replace('_', ' ')}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="eb-ledger">Ledger account name (optional)</Label>
            <Input
              id="eb-ledger"
              value={ledgerAccountName}
              onChange={(e) => setLedgerAccountName(e.target.value)}
              placeholder="City ledger account label"
            />
          </div>

          <div className="space-y-2">
            <Label>Booking status</Label>
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {BOOKING_STATUSES.map((o) => (
                  <SelectItem key={o.value} value={o.value}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="eb-notes">Notes</Label>
            <Textarea id="eb-notes" value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} />
          </div>
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button type="button" variant="outline" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button type="button" onClick={handleSave} disabled={saving || loadingRooms}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Save changes'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
