'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Calendar } from '@/components/ui/calendar'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { format, addDays, differenceInDays } from 'date-fns'
import { Calendar as CalendarIcon, ChevronRight, ChevronLeft } from 'lucide-react'
import { formatNaira } from '@/lib/utils/currency'
import { toast } from 'sonner'

const ROOM_TYPES = [
  'Deluxe', 'Royal', 'Kings', 'Mini Suite', 'Executive Suite', 'Diplomatic Suite',
]

interface NewReservationModalProps {
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

export function NewReservationModal({ open, onClose, onSuccess }: NewReservationModalProps) {
  const [step, setStep] = useState(1)
  const [loading, setLoading] = useState(false)
  const [orgId, setOrgId] = useState('')

  // Step 1: Guest
  const [fullName, setFullName] = useState('')
  const [phone, setPhone] = useState('')
  const [email, setEmail] = useState('')
  const [address, setAddress] = useState('')
  const [guestId, setGuestId] = useState('')
  const [guests, setGuests] = useState<any[]>([])
  const [filteredGuests, setFilteredGuests] = useState<any[]>([])
  const [guestSearchOpen, setGuestSearchOpen] = useState(false)

  // Step 2: Dates
  const [checkInDate, setCheckInDate] = useState<Date>()
  const [checkOutDate, setCheckOutDate] = useState<Date>()
  const [nights, setNights] = useState(0)
  const [checkInOpen, setCheckInOpen] = useState(false)
  const [checkOutOpen, setCheckOutOpen] = useState(false)

  // Step 3: Room & Payment
  const [rooms, setRooms] = useState<any[]>([])
  const [selectedRoomType, setSelectedRoomType] = useState('')
  const [selectedRoom, setSelectedRoom] = useState<any>(null)
  const [pricePerNight, setPricePerNight] = useState(0)
  const [customPrice, setCustomPrice] = useState(0)
  const [paymentStatus, setPaymentStatus] = useState<'paid' | 'unpaid'>('unpaid')
  const [paymentMethod, setPaymentMethod] = useState('cash')

  useEffect(() => {
    if (open) loadData()
  }, [open])

  const loadData = async () => {
    try {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      const { data: profile } = await supabase.from('profiles').select('organization_id').eq('id', user.id).single()
      if (!profile?.organization_id) return
      setOrgId(profile.organization_id)

      const [{ data: guestData }, { data: roomData }] = await Promise.all([
        supabase.from('guests').select('id, name, phone, email, address').eq('organization_id', profile.organization_id).order('name'),
        supabase.from('rooms').select('id, room_number, room_type, price_per_night').eq('organization_id', profile.organization_id).in('status', ['available', 'reserved']).order('room_number'),
      ])
      setGuests(guestData || [])
      setRooms(roomData || [])
    } catch {
      toast.error('Failed to load data')
    }
  }

  const handleGuestSearch = (value: string) => {
    setFullName(value)
    setGuestId('')
    if (value.trim()) {
      const filtered = guests.filter(g => g.name.toLowerCase().includes(value.toLowerCase()) || (g.phone || '').includes(value))
      setFilteredGuests(filtered)
      setGuestSearchOpen(filtered.length > 0)
    } else {
      setFilteredGuests([]); setGuestSearchOpen(false)
    }
  }

  const selectGuest = (guest: any) => {
    setGuestId(guest.id); setFullName(guest.name)
    setPhone(guest.phone || ''); setEmail(guest.email || ''); setAddress(guest.address || '')
    setGuestSearchOpen(false)
  }

  const handleCheckInChange = (date: Date | undefined) => {
    if (!date) return
    setCheckInDate(date); setCheckInOpen(false); setCheckOutDate(undefined); setNights(0)
  }

  const handleCheckOutChange = (date: Date | undefined) => {
    if (!date || !checkInDate) return
    setCheckOutDate(date); setCheckOutOpen(false)
    setNights(Math.max(0, differenceInDays(date, checkInDate)))
  }

  const handleNightsChange = (value: number) => {
    const n = Math.max(1, value || 1); setNights(n)
    if (checkInDate) setCheckOutDate(addDays(checkInDate, n))
  }

  const handleRoomTypeSelect = (roomType: string) => {
    setSelectedRoomType(roomType)
    const room = rooms.find(r => r.room_type === roomType)
    if (room) { setSelectedRoom(room); setPricePerNight(room.price_per_night) }
    else { setSelectedRoom(null); setPricePerNight(0) }
  }

  const canGoNext = () => {
    if (step === 1) return !!(guestId || fullName.trim()) && !!phone.trim()
    if (step === 2) return !!(checkInDate && checkOutDate && nights > 0)
    if (step === 3) return !!(selectedRoom)
    return false
  }

  const handleSubmit = async () => {
    try {
      setLoading(true)
      if (!checkInDate || !checkOutDate) { toast.error('Dates required'); return }
      if (!selectedRoom) { toast.error('Room required'); return }

      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()

      let finalGuestId = guestId
      if (!guestId) {
        const { data: newGuest, error: ge } = await supabase
          .from('guests')
          .insert([{ organization_id: orgId, name: fullName, phone, email: email || null, address: address || null }])
          .select().single()
        if (ge) throw ge
        finalGuestId = newGuest.id
      }

      const effectiveRate = customPrice > 0 ? customPrice : pricePerNight
      const total = effectiveRate * nights
      const isPaid = paymentStatus === 'paid'
      const folioId = `RES-${Date.now().toString(36).toUpperCase()}`

      const { data: booking, error: be } = await supabase
        .from('bookings')
        .insert([{
          organization_id: orgId,
          guest_id: finalGuestId,
          room_id: selectedRoom.id,
          folio_id: folioId,
          check_in: toLocalDateStr(checkInDate),
          check_out: toLocalDateStr(checkOutDate),
          number_of_nights: nights,
          rate_per_night: effectiveRate,
          total_amount: total,
          deposit: isPaid ? total : 0,
          balance: isPaid ? 0 : total,
          payment_status: isPaid ? 'paid' : 'pending',
          status: 'reserved',
          created_by: user?.id,
        }])
        .select().single()
      if (be) throw be

      // Mark room as reserved
      await supabase.from('rooms').update({ status: 'reserved' }).eq('id', selectedRoom.id)

      // Record transaction
      await supabase.from('transactions').insert([{
        organization_id: orgId,
        booking_id: booking.id,
        transaction_id: `TXN-${Date.now().toString(36).toUpperCase()}`,
        guest_name: fullName,
        room: selectedRoom.room_number,
        amount: total,
        payment_method: isPaid ? paymentMethod : 'pending',
        status: isPaid ? 'completed' : 'pending',
        description: `Reservation created - Ref ${folioId}`,
        received_by: user?.id,
      }])

      toast.success(`Reservation created! Ref: ${folioId}`)
      onSuccess?.()
      onClose()
      resetForm()
    } catch (err: any) {
      toast.error(err.message || 'Failed to create reservation')
    } finally {
      setLoading(false)
    }
  }

  const resetForm = () => {
    setStep(1)
    setFullName(''); setPhone(''); setEmail(''); setAddress(''); setGuestId('')
    setCheckInDate(undefined); setCheckOutDate(undefined); setNights(0)
    setSelectedRoomType(''); setSelectedRoom(null); setPricePerNight(0); setCustomPrice(0)
    setPaymentStatus('unpaid'); setPaymentMethod('cash')
  }

  const effectiveRate = customPrice > 0 ? customPrice : pricePerNight
  const totalAmount = effectiveRate * nights

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>New Reservation — Step {step} of 3</DialogTitle>
          <DialogDescription>
            {step === 1 ? 'Enter guest information' : step === 2 ? 'Select stay dates' : 'Choose room and payment status'}
          </DialogDescription>
        </DialogHeader>

        {/* Step 1: Guest */}
        {step === 1 && (
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Full Name *</Label>
              <div className="relative">
                <Input
                  placeholder="Type guest name — existing guests will appear"
                  value={fullName}
                  onChange={(e) => handleGuestSearch(e.target.value)}
                  onBlur={() => setTimeout(() => setGuestSearchOpen(false), 150)}
                />
                {guestSearchOpen && filteredGuests.length > 0 && (
                  <div className="absolute top-full left-0 right-0 mt-1 bg-background border rounded-md shadow-lg z-50 max-h-56 overflow-y-auto">
                    {filteredGuests.map(g => (
                      <button key={g.id} className="w-full text-left px-4 py-3 hover:bg-accent border-b last:border-b-0" onMouseDown={(e) => { e.preventDefault(); selectGuest(g) }}>
                        <div className="font-medium text-sm">{g.name}</div>
                        <div className="text-xs text-muted-foreground">{g.phone}</div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
              {!guestId && fullName.trim() && <p className="text-xs text-amber-600">New guest will be created: <strong>{fullName}</strong></p>}
            </div>
            <div className="space-y-2">
              <Label>Phone *</Label>
              <Input placeholder="Phone number" value={phone} onChange={(e) => setPhone(e.target.value)} disabled={!!guestId} />
            </div>
            <div className="space-y-2">
              <Label>Email</Label>
              <Input type="email" placeholder="Email address" value={email} onChange={(e) => setEmail(e.target.value)} disabled={!!guestId} />
            </div>
            <div className="space-y-2">
              <Label>Address</Label>
              <Input placeholder="Street address" value={address} onChange={(e) => setAddress(e.target.value)} disabled={!!guestId} />
            </div>
          </div>
        )}

        {/* Step 2: Dates */}
        {step === 2 && (
          <div className="space-y-4 py-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Check-in *</Label>
                <Popover open={checkInOpen} onOpenChange={setCheckInOpen}>
                  <PopoverTrigger asChild>
                    <Button variant="outline" className="w-full justify-start text-left font-normal">
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {checkInDate ? format(checkInDate, 'dd MMM yyyy') : 'Select date'}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0">
                    <Calendar mode="single" selected={checkInDate} onSelect={handleCheckInChange} initialFocus />
                  </PopoverContent>
                </Popover>
              </div>
              <div className="space-y-2">
                <Label>Check-out *</Label>
                <Popover open={checkOutOpen} onOpenChange={setCheckOutOpen}>
                  <PopoverTrigger asChild>
                    <Button variant="outline" className="w-full justify-start text-left font-normal">
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {checkOutDate ? format(checkOutDate, 'dd MMM yyyy') : 'Select date'}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0">
                    <Calendar mode="single" selected={checkOutDate} onSelect={handleCheckOutChange} disabled={(d) => checkInDate ? d <= checkInDate : false} initialFocus />
                  </PopoverContent>
                </Popover>
              </div>
            </div>
            <div className="space-y-2">
              <Label>Number of Nights</Label>
              <Input type="number" min={1} value={nights || ''} onChange={(e) => handleNightsChange(parseInt(e.target.value))} placeholder="e.g., 2" />
            </div>
            {checkInDate && checkOutDate && (
              <div className="p-3 rounded-lg bg-muted text-sm">
                <span className="text-muted-foreground">Duration: </span>
                <span className="font-semibold">{nights} night(s)</span>
                <span className="text-muted-foreground"> · Check-in: </span>
                <span className="font-semibold">{format(checkInDate, 'EEE, dd MMM yyyy')}</span>
                <span className="text-muted-foreground"> · Check-out: </span>
                <span className="font-semibold">{format(checkOutDate, 'EEE, dd MMM yyyy')}</span>
              </div>
            )}
          </div>
        )}

        {/* Step 3: Room & Payment */}
        {step === 3 && (
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Room Type *</Label>
              <Select value={selectedRoomType} onValueChange={handleRoomTypeSelect}>
                <SelectTrigger>
                  <SelectValue placeholder="Select room type" />
                </SelectTrigger>
                <SelectContent>
                  {ROOM_TYPES.map(rt => {
                    const count = rooms.filter(r => r.room_type === rt).length
                    return (
                      <SelectItem key={rt} value={rt} disabled={count === 0}>
                        {rt} {count === 0 ? '(none available)' : `(${count} available)`}
                      </SelectItem>
                    )
                  })}
                </SelectContent>
              </Select>
            </div>

            {selectedRoom && (
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Room Number</Label>
                  <Select value={selectedRoom?.id} onValueChange={(id) => {
                    const r = rooms.find(x => x.id === id)
                    if (r) { setSelectedRoom(r); setPricePerNight(r.price_per_night) }
                  }}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select room" />
                    </SelectTrigger>
                    <SelectContent>
                      {rooms.filter(r => r.room_type === selectedRoomType).map(r => (
                        <SelectItem key={r.id} value={r.id}>Room {r.room_number}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Rate/Night (auto)</Label>
                  <Input value={formatNaira(pricePerNight)} readOnly className="bg-muted" />
                </div>
              </div>
            )}

            <div className="space-y-2">
              <Label>Custom Rate (optional)</Label>
              <Input type="number" placeholder="Leave blank to use room rate" value={customPrice || ''} onChange={(e) => setCustomPrice(Number(e.target.value))} />
            </div>

            <div className="space-y-2">
              <Label>Payment Status *</Label>
              <Select value={paymentStatus} onValueChange={(v: any) => setPaymentStatus(v)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="unpaid">Unpaid (pay at check-in)</SelectItem>
                  <SelectItem value="paid">Paid in advance</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {paymentStatus === 'paid' && (
              <div className="space-y-2">
                <Label>Payment Method</Label>
                <Select value={paymentMethod} onValueChange={setPaymentMethod}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="cash">Cash</SelectItem>
                    <SelectItem value="bank_transfer">Bank Transfer</SelectItem>
                    <SelectItem value="card">Card</SelectItem>
                    <SelectItem value="pos">POS</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}

            {selectedRoom && nights > 0 && (
              <div className="p-4 rounded-lg bg-muted space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Room {selectedRoom.room_number} · {nights} night(s)</span>
                  <span>{formatNaira(effectiveRate)} / night</span>
                </div>
                <div className="flex justify-between font-semibold text-base border-t pt-2">
                  <span>Total Amount</span>
                  <span>{formatNaira(totalAmount)}</span>
                </div>
                <div className={`flex justify-between text-xs font-medium ${paymentStatus === 'paid' ? 'text-green-600' : 'text-orange-600'}`}>
                  <span>Payment Status</span>
                  <span>{paymentStatus === 'paid' ? 'Paid in advance' : 'To be paid at check-in'}</span>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Navigation */}
        <div className="flex justify-between pt-4 border-t">
          <Button variant="outline" onClick={() => step > 1 ? setStep(step - 1) : onClose()} disabled={loading}>
            <ChevronLeft className="mr-2 h-4 w-4" />
            {step > 1 ? 'Back' : 'Cancel'}
          </Button>
          {step < 3 ? (
            <Button onClick={() => setStep(step + 1)} disabled={!canGoNext()}>
              Next <ChevronRight className="ml-2 h-4 w-4" />
            </Button>
          ) : (
            <Button onClick={handleSubmit} disabled={loading || !canGoNext()}>
              {loading ? 'Creating...' : 'Create Reservation'}
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
