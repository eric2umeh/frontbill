'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Calendar } from '@/components/ui/calendar'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { format, addDays } from 'date-fns'
import { Calendar as CalendarIcon, X } from 'lucide-react'
import { formatNaira } from '@/lib/utils/currency'
import { toast } from 'sonner'

interface CheckinModalProps {
  open: boolean
  onClose: () => void
  onSuccess?: () => void
}

const toLocalDateStr = (date: Date) => {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

export function CheckinModal({ open, onClose, onSuccess }: CheckinModalProps) {
  const [loading, setLoading] = useState(false)
  const [orgId, setOrgId] = useState('')

  // Guest
  const [fullName, setFullName] = useState('')
  const [phone, setPhone] = useState('')
  const [guestId, setGuestId] = useState('')
  const [guests, setGuests] = useState<any[]>([])
  const [filteredGuests, setFilteredGuests] = useState<any[]>([])
  const [guestSearchOpen, setGuestSearchOpen] = useState(false)

  // Dates
  const [checkInDate, setCheckInDate] = useState<Date>(() => { const d = new Date(); d.setHours(0,0,0,0); return d })
  const [checkOutDate, setCheckOutDate] = useState<Date>(() => { const d = new Date(); d.setHours(0,0,0,0); return addDays(d, 1) })
  const [nights, setNights] = useState(1)
  const [checkInOpen, setCheckInOpen] = useState(false)
  const [checkOutOpen, setCheckOutOpen] = useState(false)

  // Room
  const [rooms, setRooms] = useState<any[]>([])
  const [allRooms, setAllRooms] = useState<any[]>([])
  const [allBookings, setAllBookings] = useState<any[]>([])
  const [selectedRoom, setSelectedRoom] = useState<any>(null)

  // Payment
  const [paymentMethod, setPaymentMethod] = useState('cash')
  const [customPrice, setCustomPrice] = useState<number | ''>('')

  // Driver referral
  const [driverCode, setDriverCode] = useState('')
  const [driverVerified, setDriverVerified] = useState(false)
  const [driverVerifying, setDriverVerifying] = useState(false)
  const [driverName, setDriverName] = useState('')

  useEffect(() => {
    if (open) loadData()
    else resetForm()
  }, [open])

  const loadData = async () => {
    try {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      const { data: profile } = await supabase.from('profiles').select('organization_id').eq('id', user.id).single()
      if (!profile?.organization_id) return
      setOrgId(profile.organization_id)

      const [{ data: guestData }, { data: roomData }, { data: bookingData }] = await Promise.all([
        supabase.from('guests').select('id, name, phone').eq('organization_id', profile.organization_id).order('name'),
        supabase.from('rooms').select('id, room_number, room_type, price_per_night, status').eq('organization_id', profile.organization_id).eq('status', 'available').order('room_number'),
        supabase.from('bookings').select('room_id, check_in, check_out').eq('organization_id', profile.organization_id).in('status', ['confirmed', 'reserved', 'checked_in']),
      ])

      setGuests(guestData || [])
      const sanitized = (roomData || []).filter((r: any) => r.id && r.room_type && r.room_number)
      setAllRooms(sanitized)
      setAllBookings(bookingData || [])
      filterRooms(checkInDate, checkOutDate, bookingData || [], sanitized)
    } catch {
      toast.error('Failed to load data')
    }
  }

  const filterRooms = (ci: Date, co: Date, bookings: any[], allRms: any[]) => {
    const ciStr = toLocalDateStr(ci)
    const coStr = toLocalDateStr(co)
    const bookedIds = new Set(bookings.filter(b => b.check_in < coStr && b.check_out > ciStr).map(b => b.room_id))
    const available = allRms.filter(r => !bookedIds.has(r.id))
    setRooms(available)
    setSelectedRoom((prev: any) => prev && bookedIds.has(prev.id) ? null : prev)
  }

  const handleGuestSearch = (value: string) => {
    setFullName(value)
    setGuestId('')
    if (value.trim()) {
      const filtered = guests.filter(g => g.name.toLowerCase().includes(value.toLowerCase()) || (g.phone || '').includes(value))
      setFilteredGuests(filtered)
      setGuestSearchOpen(filtered.length > 0)
    } else {
      setFilteredGuests([])
      setGuestSearchOpen(false)
    }
  }

  const selectGuest = (guest: any) => {
    setGuestId(guest.id)
    setFullName(guest.name)
    setPhone(guest.phone || '')
    setGuestSearchOpen(false)
  }

  const handleCheckInChange = (date: Date | undefined) => {
    if (!date) return
    setCheckInDate(date)
    setCheckInOpen(false)
    const next = addDays(date, 1)
    setCheckOutDate(next)
    setNights(1)
    filterRooms(date, next, allBookings, allRooms)
  }

  const handleCheckOutChange = (date: Date | undefined) => {
    if (!date || !checkInDate) return
    setCheckOutDate(date)
    setCheckOutOpen(false)
    const n = Math.max(1, Math.round((date.getTime() - checkInDate.getTime()) / 86400000))
    setNights(n)
    filterRooms(checkInDate, date, allBookings, allRooms)
  }

  const handleNightsChange = (n: number) => {
    const val = Math.max(1, n || 1)
    setNights(val)
    const co = addDays(checkInDate, val)
    setCheckOutDate(co)
    filterRooms(checkInDate, co, allBookings, allRooms)
  }

  const handleVerifyDriver = async () => {
    if (!driverCode.trim()) return
    setDriverVerifying(true)
    try {
      const supabase = createClient()
      const { data } = await supabase.from('profiles').select('full_name').eq('driver_code', driverCode.trim().toUpperCase()).maybeSingle()
      if (data) {
        setDriverVerified(true)
        setDriverName(data.full_name)
        toast.success(`Driver verified: ${data.full_name}`)
      } else {
        setDriverVerified(false)
        setDriverName('')
        toast.error('Driver code not found')
      }
    } catch {
      toast.error('Failed to verify driver')
    } finally {
      setDriverVerifying(false)
    }
  }

  const canSubmit = () => !!(fullName.trim() && selectedRoom && checkInDate && checkOutDate && nights > 0)

  const handleSubmit = async () => {
    if (!canSubmit()) { toast.error('Please fill in all required fields'); return }
    try {
      setLoading(true)
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()

      let finalGuestId = guestId
      if (!guestId) {
        const { data: newGuest, error: ge } = await supabase
          .from('guests')
          .insert([{ organization_id: orgId, name: fullName, phone: phone || null }])
          .select().single()
        if (ge) throw ge
        finalGuestId = newGuest.id

      }

      const rate = customPrice !== '' ? Number(customPrice) : (selectedRoom.price_per_night || 0)
      const total = rate * nights
      const isPaid = paymentMethod !== 'city_ledger'
      const folioId = `FOL-${Date.now().toString(36).toUpperCase()}`

      const { data: booking, error: be } = await supabase.from('bookings').insert([{
        organization_id: orgId,
        guest_id: finalGuestId,
        room_id: selectedRoom.id,
        folio_id: folioId,
        check_in: toLocalDateStr(checkInDate),
        check_out: toLocalDateStr(checkOutDate),
        number_of_nights: nights,
        rate_per_night: rate,
        total_amount: total,
        deposit: isPaid ? total : 0,
        balance: isPaid ? 0 : total,
        payment_status: isPaid ? 'paid' : 'pending',
        status: 'confirmed',
        created_by: user?.id,
        notes: `payment_method: ${paymentMethod}${driverVerified ? ` | driver: ${driverCode}` : ''}`,
      }]).select().single()
      if (be) throw be

      await supabase.from('rooms').update({ status: 'occupied', updated_by: user?.id, updated_at: new Date().toISOString() }).eq('id', selectedRoom.id)

      await supabase.from('folio_charges').insert([{
        booking_id: booking.id,
        organization_id: orgId,
        description: `Check-in charge — ${nights} night${nights !== 1 ? 's' : ''}`,
        amount: total,
        charge_type: 'room_charge',
        payment_method: paymentMethod,
        payment_status: isPaid ? 'paid' : 'unpaid',
        created_by: user?.id,
      }])

      await supabase.from('transactions').insert([{
        organization_id: orgId,
        booking_id: booking.id,
        transaction_id: `TXN-${Date.now().toString(36).toUpperCase()}`,
        guest_name: fullName,
        room: selectedRoom.room_number,
        amount: total,
        payment_method: paymentMethod,
        status: isPaid ? 'completed' : 'pending',
        description: `Check-in — Folio ${folioId}`,
        received_by: user?.id,
      }])

      await supabase.from('payments').insert([{
        organization_id: orgId,
        booking_id: booking.id,
        guest_id: finalGuestId,
        amount: total,
        payment_method: paymentMethod,
        payment_date: new Date().toISOString(),
        notes: `Check-in payment — Folio ${folioId}`,
        received_by: user?.id,
      }])

      toast.success(`Guest checked in! Ref: ${folioId}`)
      onSuccess?.()
      onClose()
      resetForm()
    } catch (err: any) {
      toast.error(err.message || 'Failed to check in guest')
    } finally {
      setLoading(false)
    }
  }

  const resetForm = () => {
    setFullName(''); setPhone(''); setGuestId('')
    setFilteredGuests([]); setGuestSearchOpen(false)
    const d = new Date(); d.setHours(0,0,0,0)
    setCheckInDate(d); setCheckOutDate(addDays(d, 1)); setNights(1)
    setSelectedRoom(null); setPaymentMethod('cash'); setCustomPrice('')
    setDriverCode(''); setDriverVerified(false); setDriverName('')
  }

  const pricePerNight = selectedRoom?.price_per_night || 0
  const effectiveRate = customPrice !== '' ? Number(customPrice) : pricePerNight
  const totalAmount = effectiveRate * nights

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose() }}>
      <DialogContent className="max-w-2xl max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>New Guest Check-in</DialogTitle>
          <DialogDescription>Fill in details to check in a guest immediately</DialogDescription>
        </DialogHeader>

        <div className="space-y-5 py-2">

          {/* Guest Information */}
          <div className="rounded-lg border p-4 space-y-4">
            <p className="text-sm font-semibold">Guest Information</p>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2 col-span-2 md:col-span-1">
                <Label>Guest Full Name *</Label>
                <div className="relative">
                  <Input
                    placeholder="Type guest name or phone..."
                    value={fullName}
                    onChange={(e) => handleGuestSearch(e.target.value)}
                    onBlur={() => setTimeout(() => setGuestSearchOpen(false), 150)}
                  />
                  {guestSearchOpen && filteredGuests.length > 0 && (
                    <div className="absolute top-full left-0 right-0 mt-1 bg-background border rounded-md shadow-lg z-50 max-h-52 overflow-y-auto">
                      {filteredGuests.map(g => (
                        <button key={g.id} className="w-full text-left px-4 py-3 hover:bg-accent border-b last:border-b-0" onMouseDown={(e) => { e.preventDefault(); selectGuest(g) }}>
                          <div className="font-medium text-sm">{g.name}</div>
                          <div className="text-xs text-muted-foreground">{g.phone}</div>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                {guestId && (
                  <div className="flex items-center justify-between bg-blue-50 border border-blue-200 rounded px-2 py-1">
                    <p className="text-xs text-blue-800">Existing guest selected</p>
                    <Button size="sm" variant="ghost" className="h-5 w-5 p-0" onClick={() => { setGuestId(''); setFullName(''); setPhone('') }}>
                      <X className="h-3 w-3" />
                    </Button>
                  </div>
                )}
                {!guestId && fullName.trim() && <p className="text-xs text-amber-600">New guest will be created</p>}
              </div>
              <div className="space-y-2 col-span-2 md:col-span-1">
                <Label>Phone Number *</Label>
                <Input placeholder="08012345678" value={phone} onChange={(e) => setPhone(e.target.value)} disabled={!!guestId} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Check-in Date *</Label>
                <Popover open={checkInOpen} onOpenChange={setCheckInOpen}>
                  <PopoverTrigger asChild>
                    <Button variant="outline" className="w-full justify-start text-left font-normal">
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {format(checkInDate, 'dd/MM/yyyy')}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar mode="single" selected={checkInDate} onSelect={handleCheckInChange} disabled={(d) => d < new Date(new Date().setHours(0,0,0,0))} />
                  </PopoverContent>
                </Popover>
              </div>
              <div className="space-y-2">
                <Label>Check-out Date *</Label>
                <Popover open={checkOutOpen} onOpenChange={setCheckOutOpen}>
                  <PopoverTrigger asChild>
                    <Button variant="outline" className="w-full justify-start text-left font-normal">
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {format(checkOutDate, 'dd/MM/yyyy')}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar mode="single" selected={checkOutDate} onSelect={handleCheckOutChange} disabled={(d) => d <= checkInDate} />
                  </PopoverContent>
                </Popover>
              </div>
            </div>
            <div className="space-y-2">
              <Label>Room Number *</Label>
              <Select
                value={selectedRoom?.id ?? ''}
                onValueChange={(id) => {
                  const r = rooms.find(x => x.id === id)
                  if (r) setSelectedRoom(r)
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder={rooms.length === 0 ? 'No rooms available for selected dates' : 'Select room...'} />
                </SelectTrigger>
                <SelectContent>
                  {rooms.length === 0 ? (
                    <SelectItem value="__none__" disabled>No rooms available</SelectItem>
                  ) : (
                    rooms.map(r => (
                      <SelectItem key={r.id} value={r.id}>
                        {r.room_type} — Room {r.room_number}
                      </SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Room Payment */}
          <div className="rounded-lg border p-4 space-y-4">
            <div>
              <p className="text-sm font-semibold">Room Payment</p>
              <p className="text-xs text-muted-foreground">Calculated based on room type and stay duration</p>
            </div>
            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label>Room Rate (per night)</Label>
                <div className="flex items-center gap-1 px-3 py-2 bg-muted rounded border text-sm font-medium">
                  <span className="text-muted-foreground">₦</span>
                  <span>{pricePerNight.toLocaleString()}</span>
                </div>
              </div>
              <div className="space-y-2">
                <Label>Total Nights</Label>
                <div className="flex items-center gap-1 px-3 py-2 bg-muted rounded border text-sm">
                  <Input
                    type="number"
                    min={1}
                    value={nights}
                    onChange={(e) => handleNightsChange(parseInt(e.target.value))}
                    className="border-0 bg-transparent p-0 h-auto focus-visible:ring-0 text-sm"
                  />
                  <span className="text-muted-foreground text-xs">night{nights !== 1 ? 's' : ''}</span>
                </div>
              </div>
              <div className="space-y-2">
                <Label>Room Payment *</Label>
                <div className="space-y-1">
                  <div className="flex items-center gap-1 px-3 py-2 bg-muted rounded border text-sm font-medium">
                    <span className="text-muted-foreground">₦</span>
                    <span>{totalAmount.toLocaleString()}</span>
                  </div>
                  <p className="text-xs text-muted-foreground">Auto-calculated: ₦{totalAmount.toLocaleString()}</p>
                </div>
              </div>
            </div>
            <div className="space-y-2">
              <Label>Custom Rate / Night (optional)</Label>
              <Input type="number" placeholder="Leave empty to use room rate" value={customPrice} onChange={(e) => setCustomPrice(e.target.value === '' ? '' : Number(e.target.value))} />
            </div>
          </div>

          {/* Payment Mode */}
          <div className="rounded-lg border p-4 space-y-4">
            <div>
              <p className="text-sm font-semibold">Payment Mode</p>
              <p className="text-xs text-muted-foreground">Select how the guest will pay for their stay</p>
            </div>
            <div className="space-y-2">
              <Label>Payment Mode *</Label>
              <Select value={paymentMethod} onValueChange={setPaymentMethod}>
                <SelectTrigger><SelectValue placeholder="Select payment mode" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="cash">Cash</SelectItem>
                  <SelectItem value="pos">POS</SelectItem>
                  <SelectItem value="transfer">Transfer</SelectItem>
                  <SelectItem value="card">Card</SelectItem>
                  <SelectItem value="city_ledger">City Ledger</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Driver Referral */}
          <div className="rounded-lg border p-4 space-y-4">
            <div>
              <p className="text-sm font-semibold">Driver Referral (Optional)</p>
              <p className="text-xs text-muted-foreground">Attach a driver referral code to give them commission. Leave empty if no driver.</p>
            </div>
            <div className="space-y-2">
              <Label>Driver Referral Code</Label>
              <div className="flex gap-2">
                <Input
                  placeholder="ENTER DRIVER REFERRAL CODE (E.G., DRV001)"
                  value={driverCode}
                  onChange={(e) => { setDriverCode(e.target.value.toUpperCase()); setDriverVerified(false); setDriverName('') }}
                  className="uppercase"
                />
                <Button type="button" variant="outline" onClick={handleVerifyDriver} disabled={driverVerifying || !driverCode.trim()}>
                  {driverVerifying ? 'Checking...' : 'Verify'}
                </Button>
              </div>
              {driverVerified && <p className="text-xs text-green-600">Driver verified: <strong>{driverName}</strong></p>}
            </div>
          </div>
        </div>

        <div className="flex justify-end gap-2 pt-4 border-t">
          <Button variant="outline" onClick={onClose} disabled={loading}>Cancel</Button>
          <Button onClick={handleSubmit} disabled={loading || !canSubmit()}>
            {loading ? 'Checking in...' : 'Check In Guest'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
