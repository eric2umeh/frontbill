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
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { format, addDays, differenceInDays } from 'date-fns'
import { Calendar as CalendarIcon, ChevronRight, ChevronLeft, Search, Plus, X, Loader2 } from 'lucide-react'
import { formatNaira } from '@/lib/utils/currency'
import { toast } from 'sonner'

const toLocalDateStr = (date: Date) => {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

const today = () => {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  return d
}

export function NewReservationModal({ open, onClose, onSuccess }: NewReservationModalProps) {
  const [step, setStep] = useState(1)
  const [loading, setLoading] = useState(false)
  const [orgId, setOrgId] = useState('')
  const [currentUserId, setCurrentUserId] = useState('')

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
  const [allBookings, setAllBookings] = useState<any[]>([]) // for date-based availability
  const [selectedRoomType, setSelectedRoomType] = useState('')
  const [selectedRoom, setSelectedRoom] = useState<any>(null)
  const [pricePerNight, setPricePerNight] = useState(0)
  const [customPrice, setCustomPrice] = useState<number | ''>('')
  // Payment
  const [paymentMethod, setPaymentMethod] = useState<'cash' | 'pos' | 'card' | 'bank_transfer' | 'city_ledger'>('cash')
  const [paymentStatus, setPaymentStatus] = useState<'paid' | 'partial' | 'unpaid'>('unpaid')
  const [partialAmount, setPartialAmount] = useState<number | ''>('')
  // City Ledger sub-fields
  const [ledgerType, setLedgerType] = useState<'individual' | 'organization'>('individual')
  const [ledgerSearch, setLedgerSearch] = useState('')
  const [ledgerResults, setLedgerResults] = useState<any[]>([])
  const [ledgerSearchOpen, setLedgerSearchOpen] = useState(false)
  const [selectedLedger, setSelectedLedger] = useState<any>(null)
  // Inline new org form for city ledger
  const [showNewLedgerOrgForm, setShowNewLedgerOrgForm] = useState(false)
  const [newLedgerOrgName, setNewLedgerOrgName] = useState('')
  const [newLedgerOrgEmail, setNewLedgerOrgEmail] = useState('')
  const [newLedgerOrgPhone, setNewLedgerOrgPhone] = useState('')
  const [newLedgerOrgAddress, setNewLedgerOrgAddress] = useState('')
  const [creatingLedgerOrg, setCreatingLedgerOrg] = useState(false)

  useEffect(() => {
    if (open) {
      loadData()
      // Set default dates: today for check-in, tomorrow for check-out
      const todayDate = today()
      setCheckInDate(todayDate)
      setCheckOutDate(addDays(todayDate, 1))
      setNights(1)
    } else {
      // Reset loading state when modal closes
      setLoading(false)
      resetForm()
    }
  }, [open])

  const loadData = async () => {
    try {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      setCurrentUserId(user.id)
      const { data: profile } = await supabase.from('profiles').select('organization_id').eq('id', user.id).single()
      if (!profile?.organization_id) return
      setOrgId(profile.organization_id)

      const [{ data: guestData }, { data: roomData }, { data: bookingData }] = await Promise.all([
        supabase.from('guests').select('id, name, phone, email, address').eq('organization_id', profile.organization_id).order('name'),
        // Fetch all non-maintenance rooms — we'll filter availability by date ourselves
        supabase.from('rooms').select('id, room_number, room_type, price_per_night, status').eq('organization_id', profile.organization_id).neq('status', 'maintenance').order('room_number'),
        // Fetch active bookings to check date availability
        supabase.from('bookings').select('room_id, check_in, check_out').eq('organization_id', profile.organization_id).in('status', ['confirmed', 'reserved', 'checked_in']),
      ])
      setGuests(guestData || [])
      setRooms((roomData || []).filter((r: any) => r.id && r.room_type && String(r.room_type).trim() !== '' && r.room_number && String(r.room_number).trim() !== ''))
      setAllBookings(bookingData || [])
    } catch {
      toast.error('Failed to load data')
    } finally {
      setLoading(false)
    }
  }

  // Guest search in Step 1
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
    setEmail(guest.email || '')
    setAddress(guest.address || '')
    setGuestSearchOpen(false)
  }

  // City Ledger account search — filtered by type (individual / organization)
  const searchLedger = async (term: string) => {
    setLedgerSearch(term)
    setSelectedLedger(null)
    if (!term.trim()) { setLedgerResults([]); setLedgerSearchOpen(false); return }
    const supabase = createClient()

    // Re-fetch orgId from profile in case state hasn't populated yet
    let effectiveOrgId = orgId
    if (!effectiveOrgId) {
      const { data: { user } } = await supabase.auth.getUser()
      if (user) {
        const { data: profile } = await supabase.from('profiles').select('organization_id').eq('id', user.id).single()
        effectiveOrgId = profile?.organization_id || ''
        if (effectiveOrgId) setOrgId(effectiveOrgId)
      }
    }
    if (!effectiveOrgId) return

    // Query both city_ledger_accounts AND organizations table (same as new-booking-modal)
    const [{ data: ledgerData }, { data: orgTableData }] = await Promise.all([
      supabase
        .from('city_ledger_accounts')
        .select('id, account_name, account_type, contact_phone, balance')
        .eq('organization_id', effectiveOrgId)
        .ilike('account_name', `%${term}%`)
        .limit(10),
      ledgerType === 'organization'
        ? supabase
            .from('organizations')
            .select('id, name, phone')
            .ilike('name', `%${term}%`)
            .limit(5)
        : Promise.resolve({ data: [] }),
    ])

    const fromLedger = (ledgerData || [])
      .filter(d => ledgerType === 'individual'
        ? ['individual', 'guest'].includes(d.account_type)
        : d.account_type === 'organization')
      .map(d => ({ ...d, name: d.account_name, source: 'city_ledger' as const }))

    const fromOrgs = ledgerType === 'organization'
      ? (orgTableData || [])
          .filter(o => !fromLedger.some(l => l.name.toLowerCase() === o.name.toLowerCase()))
          .map(o => ({
            id: o.id,
            name: o.name,
            account_name: o.name,
            account_type: 'organization' as const,
            contact_phone: o.phone || '',
            balance: 0,
            source: 'organizations' as const,
          }))
      : []

    const combined = [...fromLedger, ...fromOrgs]
    setLedgerResults(combined)
    setLedgerSearchOpen(combined.length > 0)
  }

  const createNewLedgerOrg = async () => {
    if (!newLedgerOrgName.trim()) { toast.error('Name required'); return }
    setCreatingLedgerOrg(true)
    try {
      const supabase = createClient()
      const { data, error } = await supabase
        .from('city_ledger_accounts')
        .insert([{
          organization_id: orgId,
          account_name: newLedgerOrgName.trim(),
          account_type: ledgerType === 'individual' ? 'individual' : 'organization',
          contact_phone: newLedgerOrgPhone.trim() || null,
          balance: 0,
        }])
        .select().single()
      if (error) throw error
      setSelectedLedger({ ...data, name: data.account_name, source: 'city_ledger' })
      setLedgerSearch(data.account_name)
      setShowNewLedgerOrgForm(false)
      setNewLedgerOrgName(''); setNewLedgerOrgEmail(''); setNewLedgerOrgPhone(''); setNewLedgerOrgAddress('')
      toast.success(`"${data.account_name}" created and selected`)
    } catch (err: any) {
      toast.error(err.message || 'Failed to create account')
    } finally {
      setCreatingLedgerOrg(false)
    }
  }

  // Filter available rooms for selected dates — exclude rooms booked for overlapping dates
  const getAvailableRoomsForType = (roomType: string) => {
    const roomsOfType = rooms.filter(r => r.room_type === roomType)
    if (!checkInDate || !checkOutDate) return roomsOfType
    const cin = toLocalDateStr(checkInDate)
    const cout = toLocalDateStr(checkOutDate)
    // A room is booked if any existing booking overlaps: existing.check_in < newCheckOut AND existing.check_out > newCheckIn
    const bookedRoomIds = new Set(
      allBookings
        .filter(b => b.check_in < cout && b.check_out > cin)
        .map(b => b.room_id)
    )
    return roomsOfType.filter(r => !bookedRoomIds.has(r.id))
  }

  const handleCheckInChange = (date: Date | undefined) => {
    if (!date) return
    setCheckInDate(date)
    setCheckInOpen(false)
    const nextDay = addDays(date, 1)
    setCheckOutDate(nextDay)
    setNights(1)
    setSelectedRoom(null); setSelectedRoomType('')
  }

  const handleCheckOutChange = (date: Date | undefined) => {
    if (!date || !checkInDate) return
    setCheckOutDate(date)
    setCheckOutOpen(false)
    setNights(Math.max(0, differenceInDays(date, checkInDate)))
    setSelectedRoom(null); setSelectedRoomType('')
  }

  const handleNightsChange = (value: number) => {
    const n = Math.max(1, value || 1)
    setNights(n)
    if (checkInDate) setCheckOutDate(addDays(checkInDate, n))
  }

  const handleRoomTypeSelect = (roomType: string) => {
    setSelectedRoomType(roomType)
    const room = rooms.find(r => r.room_type === roomType)
    if (room) { setSelectedRoom(room); setPricePerNight(room.price_per_night) }
    else { setSelectedRoom(null); setPricePerNight(0) }
  }

  const canGoNext = () => {
    if (step === 1) return !!(guestId || fullName.trim())
    if (step === 2) return !!(checkInDate && checkOutDate && nights > 0)
    if (step === 3) return !!(selectedRoom)
    return false
  }

  const effectiveRate = (customPrice !== '' ? Number(customPrice) : pricePerNight) || 0
  const totalAmount = effectiveRate * nights
  // For cash/POS/card/bank_transfer: full payment received (deposit = total, balance = 0)
  // For city_ledger: deferred payment (deposit = 0, balance = total)
  const isCityLedgerPayment = paymentMethod === 'city_ledger'
  const depositAmount = isCityLedgerPayment ? 0 : totalAmount
  const balanceAmount = isCityLedgerPayment ? totalAmount : 0

  const handleSubmit = async () => {
    if (!checkInDate || !checkOutDate) { toast.error('Dates required'); return }
    if (!selectedRoom) { toast.error('Room required'); return }
    if (paymentMethod === 'city_ledger' && !selectedLedger) {
      toast.error('Please select a city ledger account')
      return
    }

    try {
      setLoading(true)
      const supabase = createClient()

      let finalGuestId = guestId
      if (!guestId) {
        const { data: newGuest, error: ge } = await supabase
          .from('guests')
          .insert([{ organization_id: orgId, name: fullName, phone, email: email || null, address: address || null }])
          .select().single()
        if (ge) throw ge
        finalGuestId = newGuest.id

        // Auto-create city_ledger_account for this guest to prevent duplicates when city ledger is used later
        await supabase.from('city_ledger_accounts').insert([{
          organization_id: orgId,
          account_name: fullName,
          account_type: 'individual',
          contact_phone: phone || null,
          contact_email: email || null,
          balance: 0,
        }])
      }

      const isCityLedger = paymentMethod === 'city_ledger'
      const folioId = `RES-${Date.now().toString(36).toUpperCase()}`
      // For cash/POS/card/bank_transfer: payment is received, so status is 'paid'
      // For city_ledger: payment is deferred, so status is 'pending'
      const bookingPaymentStatus = isCityLedger ? 'pending' : 'paid'

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
          total_amount: totalAmount,
          deposit: depositAmount,
          balance: balanceAmount,
          payment_status: bookingPaymentStatus,
          status: 'reserved',
          created_by: currentUserId,
          notes: isCityLedger
            ? `City Ledger: ${selectedLedger?.account_name || selectedLedger?.name}`
            : `payment_method: ${paymentMethod}`,
        }])
        .select().single()
      if (be) throw be

      await supabase.from('rooms').update({ status: 'reserved' }).eq('id', selectedRoom.id)

      // If city ledger: update account + guest/org profile balance
      if (isCityLedger && selectedLedger?.id) {
        const { data: acc } = await supabase
          .from('city_ledger_accounts').select('balance, account_type').eq('id', selectedLedger.id).single()
        await supabase
          .from('city_ledger_accounts')
          .update({ balance: (acc?.balance || 0) + balanceAmount })
          .eq('id', selectedLedger.id)

        const acctType = acc?.account_type || ledgerType
        if (acctType === 'individual' || acctType === 'guest') {
          if (finalGuestId) {
            const { data: guestRow } = await supabase.from('guests').select('balance').eq('id', finalGuestId).single()
            await supabase.from('guests')
              .update({ balance: ((guestRow?.balance as number) || 0) + balanceAmount })
              .eq('id', finalGuestId)
          }
        } else {
          const { data: orgRow } = await supabase.from('organizations').select('current_balance').eq('id', selectedLedger.id).single()
          if (orgRow) {
            await supabase.from('organizations')
              .update({ current_balance: ((orgRow.current_balance as number) || 0) + balanceAmount })
              .eq('id', selectedLedger.id)
          }
        }
      }

      // Insert folio charge (this is what the Transactions page reads from)
      await supabase.from('folio_charges').insert([{
        booking_id: booking.id,
        organization_id: orgId,
        description: `Reservation charge - ${nights} night${nights !== 1 ? 's' : ''}`,
        amount: totalAmount,
        charge_type: 'reservation',
        payment_method: isCityLedger ? 'city_ledger' : paymentMethod,
        ledger_account_id: isCityLedger && selectedLedger ? selectedLedger.id : null,
        ledger_account_type: isCityLedger ? ledgerType : null,
        payment_status: bookingPaymentStatus === 'paid' ? 'paid' : 'unpaid',
        created_by: currentUserId,
      }])

      // Record in transactions table
      await supabase.from('transactions').insert([{
        organization_id: orgId,
        booking_id: booking.id,
        transaction_id: `TXN-${Date.now().toString(36).toUpperCase()}`,
        guest_name: fullName,
        room: selectedRoom.room_number,
        amount: totalAmount,
        payment_method: isCityLedger ? 'city_ledger' : paymentMethod,
        status: bookingPaymentStatus,
        description: `Reservation — ${folioId}`,
        received_by: currentUserId,
      }])

      // Always insert into payments table so Transactions page shows ALL transactions
      // This includes both paid and unpaid/pending reservations
      const paidAmount = paymentStatus === 'paid' ? totalAmount : (Number(partialAmount) || 0)
      if (paidAmount > 0 || isCityLedger) {
        await supabase.from('payments').insert([{
          organization_id: orgId,
          booking_id: booking.id,
          guest_id: finalGuestId,
          amount: paidAmount || totalAmount,
          payment_method: isCityLedger ? 'city_ledger' : paymentMethod,
          payment_date: new Date().toISOString(),
          notes: `Reservation payment — Folio ${folioId}`,
          received_by: currentUserId || null,
        }])
      }

      toast.success(`Reservation created — Ref: ${folioId}`)
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
    const d = new Date(); d.setHours(0, 0, 0, 0)
    setCheckInDate(d); setCheckOutDate(addDays(d, 1)); setNights(1)
    setSelectedRoomType(''); setSelectedRoom(null); setPricePerNight(0); setCustomPrice('')
    setPaymentMethod('cash'); setPaymentStatus('unpaid'); setPartialAmount('')
    setLedgerType('individual'); setLedgerSearch(''); setLedgerResults([])
    setSelectedLedger(null); setLedgerSearchOpen(false)
    setShowNewLedgerOrgForm(false); setNewLedgerOrgName(''); setNewLedgerOrgEmail(''); setNewLedgerOrgPhone(''); setNewLedgerOrgAddress('')
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) { setLoading(false); onClose() } }}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>New Reservation — Step {step} of 3</DialogTitle>
          <DialogDescription>
            {step === 1 ? 'Enter guest information' : step === 2 ? 'Select stay dates (today or future only)' : 'Choose room and payment details'}
          </DialogDescription>
        </DialogHeader>

        {/* Step indicator */}
        <div className="flex items-center gap-2 pb-2">
          {[1,2,3].map(s => (
            <div key={s} className={`flex-1 h-1.5 rounded-full transition-colors ${s <= step ? 'bg-primary' : 'bg-muted'}`} />
          ))}
        </div>

        {/* ── STEP 1: Guest ── */}
        {step === 1 && (
          <div className="space-y-4 py-2">
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
              {guestId && <p className="text-xs text-green-600">Existing guest selected: <strong>{fullName}</strong></p>}
              {!guestId && fullName.trim() && <p className="text-xs text-amber-600">New guest will be created: <strong>{fullName}</strong></p>}
            </div>
            <div className="space-y-2">
              <Label>Phone</Label>
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

        {/* ── STEP 2: Dates ── */}
        {step === 2 && (
          <div className="space-y-4 py-2">
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
                    <Calendar
                      mode="single"
                      selected={checkInDate}
                      onSelect={handleCheckInChange}
                      disabled={(d) => d < today()}
                      initialFocus
                    />
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
                    <Calendar
                      mode="single"
                      selected={checkOutDate}
                      onSelect={handleCheckOutChange}
                      disabled={(d) => checkInDate ? d <= checkInDate : d < today()}
                      initialFocus
                    />
                  </PopoverContent>
                </Popover>
              </div>
            </div>
            <div className="space-y-2">
              <Label>Number of Nights</Label>
              <Input
                type="number"
                min={1}
                value={nights || ''}
                onChange={(e) => handleNightsChange(parseInt(e.target.value))}
                placeholder="e.g., 2"
              />
            </div>
            {checkInDate && checkOutDate && (
              <div className="p-3 rounded-lg bg-muted text-sm space-y-1">
                <div><span className="text-muted-foreground">Duration: </span><span className="font-semibold">{nights} night(s)</span></div>
                <div><span className="text-muted-foreground">Check-in: </span><span className="font-semibold">{format(checkInDate, 'EEE, dd MMM yyyy')}</span></div>
                <div><span className="text-muted-foreground">Check-out: </span><span className="font-semibold">{format(checkOutDate, 'EEE, dd MMM yyyy')}</span></div>
              </div>
            )}
          </div>
        )}

        {/* ── STEP 3: Room + Payment ── */}
        {step === 3 && (
          <div className="space-y-4 py-2">
            {/* Room selection */}
            <div className="space-y-2">
              <Label>Room Type *</Label>
              <Select value={selectedRoomType} onValueChange={handleRoomTypeSelect}>
                <SelectTrigger><SelectValue placeholder="Select room type" /></SelectTrigger>
                <SelectContent>
                  {Array.from(new Set(rooms.map(r => r.room_type))).length === 0 ? (
                    <SelectItem value="__none__" disabled>No rooms in your organization yet</SelectItem>
                  ) : (
                    Array.from(new Set(rooms.map(r => r.room_type))).map(rt => {
                      const availableRooms = getAvailableRoomsForType(rt)
                      const count = availableRooms.length
                      return (
                        <SelectItem key={rt} value={rt} disabled={count === 0}>
                          {rt} {count === 0 ? '(none available)' : `(${count} available)`}
                        </SelectItem>
                      )
                    })
                  )}
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
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {rooms.filter(r => r.room_type === selectedRoomType).map(r => (
                        <SelectItem key={r.id} value={r.id}>Room {r.room_number}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Rate / Night</Label>
                  <Input value={formatNaira(pricePerNight)} readOnly className="bg-muted" />
                </div>
              </div>
            )}

            <div className="space-y-2">
              <Label>Custom Rate (optional — overrides room rate)</Label>
              <Input
                type="number"
                placeholder="Leave blank to use room rate"
                value={customPrice}
                onChange={(e) => setCustomPrice(e.target.value === '' ? '' : Number(e.target.value))}
              />
            </div>

            <Separator />

            {/* Payment Method */}
            <div className="space-y-2">
              <Label>Payment Method</Label>
              <Select value={paymentMethod} onValueChange={(v: any) => { setPaymentMethod(v); if (v !== 'city_ledger') setSelectedLedger(null) }}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="cash">Cash</SelectItem>
                  <SelectItem value="pos">POS</SelectItem>
                  <SelectItem value="card">Card</SelectItem>
                  <SelectItem value="bank_transfer">Bank Transfer</SelectItem>
                  <SelectItem value="city_ledger">City Ledger (bill to account)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* City Ledger account picker */}
            {paymentMethod === 'city_ledger' && (
              <div className="space-y-3 p-3 border rounded-lg bg-muted/30">
                <Label className="text-sm font-medium">City Ledger Account</Label>
                <div className="flex gap-2">
                  <Button type="button" size="sm" variant={ledgerType === 'individual' ? 'default' : 'outline'}
                    onClick={() => { setLedgerType('individual'); setLedgerSearch(''); setLedgerResults([]); setSelectedLedger(null); setShowNewLedgerOrgForm(false) }}>Individual</Button>
                  <Button type="button" size="sm" variant={ledgerType === 'organization' ? 'default' : 'outline'}
                    onClick={() => { setLedgerType('organization'); setLedgerSearch(''); setLedgerResults([]); setSelectedLedger(null); setShowNewLedgerOrgForm(false) }}>Organization</Button>
                </div>

                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <Input
                      placeholder={ledgerType === 'individual' ? 'Search guest from database...' : 'Search organization from database...'}
                      value={ledgerSearch}
                      onChange={(e) => searchLedger(e.target.value)}
                      onBlur={() => setTimeout(() => setLedgerSearchOpen(false), 150)}
                    />
                    {ledgerSearchOpen && ledgerResults.length > 0 && (
                      <div className="absolute top-full left-0 right-0 mt-1 bg-background border rounded-md shadow-lg z-50 max-h-48 overflow-y-auto">
                        {ledgerResults.map((r: any) => (
                          <button key={r.id} className="w-full text-left px-4 py-2 hover:bg-accent border-b last:border-b-0 text-sm"
                            onMouseDown={(e) => { e.preventDefault(); setSelectedLedger(r); setLedgerSearch(r.name || r.account_name); setLedgerSearchOpen(false) }}>
                            <div className="font-medium">{r.name || r.account_name}</div>
                            <div className="text-xs text-muted-foreground flex items-center gap-2">
                              {(r.phone || r.contact_phone) && <span>{r.phone || r.contact_phone}</span>}
                              {r.balance !== undefined && (
                                <span className={r.balance > 0 ? 'text-orange-600' : 'text-green-600'}>
                                  Balance: {formatNaira(r.balance || 0)}
                                </span>
                              )}
                            </div>
                          </button>
                        ))}
                      </div>
                    )}
                    {ledgerSearch.trim() && ledgerResults.length === 0 && !ledgerSearchOpen && (
                      <p className="text-xs text-muted-foreground mt-1">
                        No account found. Use the New button to create one.
                      </p>
                    )}
                  </div>
                  <Button type="button" size="sm" variant="outline" className="gap-1 whitespace-nowrap" onClick={() => setShowNewLedgerOrgForm(v => !v)}>
                    <Plus className="h-3 w-3" /> New
                  </Button>
                </div>

                {/* Inline new account form */}
                {showNewLedgerOrgForm && (
                  <div className="border rounded-md p-3 space-y-2 bg-background">
                    <p className="text-xs font-medium text-muted-foreground">
                      Create new {ledgerType === 'individual' ? 'individual' : 'organization'} account
                    </p>
                    <Input
                      placeholder={ledgerType === 'individual' ? 'Individual name' : 'Organization name'}
                      value={newLedgerOrgName}
                      onChange={(e) => setNewLedgerOrgName(e.target.value)}
                      className="mt-2"
                    />
                    <Input
                      placeholder="Phone (optional)"
                      value={newLedgerOrgPhone}
                      onChange={(e) => setNewLedgerOrgPhone(e.target.value)}
                    />
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        onClick={createNewLedgerOrg}
                        disabled={creatingLedgerOrg || !newLedgerOrgName.trim()}
                      >
                        {creatingLedgerOrg ? 'Creating...' : 'Create'}
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setShowNewLedgerOrgForm(false)}
                      >
                        Cancel
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Summary */}
            {selectedRoom && nights > 0 && (
              <div className="p-4 rounded-lg bg-muted space-y-2 text-sm border">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Room {selectedRoom.room_number} · {nights} night(s) @ {formatNaira(effectiveRate)}/night</span>
                </div>
                <div className="flex justify-between font-semibold">
                  <span>Total Amount</span>
                  <span>{formatNaira(totalAmount)}</span>
                </div>
                {depositAmount > 0 && (
                  <div className="flex justify-between text-green-700">
                    <span>Amount Paid</span>
                    <span>{formatNaira(depositAmount)}</span>
                  </div>
                )}
                {balanceAmount > 0 && (
                  <div className="flex justify-between text-orange-700 font-medium border-t pt-2">
                    <span>Balance Due</span>
                    <span>{formatNaira(balanceAmount)}</span>
                  </div>
                )}
                <div className="flex justify-between items-center pt-1">
                  <span className="text-muted-foreground">Payment Method</span>
                  <Badge variant="outline">{paymentMethod.replace('_', ' ')}</Badge>
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
