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
import { format, addDays } from 'date-fns'
import { Calendar as CalendarIcon, ChevronRight, ChevronLeft, X } from 'lucide-react'
import { formatNaira } from '@/lib/utils/currency'
import { toast } from 'sonner'

interface NewBookingModalProps {
  open: boolean
  onClose: () => void
  onSuccess?: () => void
}

interface Guest {
  id: string
  name: string
  phone: string
  email: string
  address: string
}

interface Room {
  id: string
  room_number: string
  room_type: string
  price_per_night: number
}

interface LedgerAccount {
  id: string
  account_name: string
  account_type: string
  contact_phone: string
  balance: number
}

export function NewBookingModal({ open, onClose, onSuccess }: NewBookingModalProps) {
  const [step, setStep] = useState(1)
  const [loading, setLoading] = useState(false)
  const [organizationId, setOrganizationId] = useState('')

  // Step 1: Guest Data
  const [fullName, setFullName] = useState('')
  const [phone, setPhone] = useState('')
  const [email, setEmail] = useState('')
  const [address, setAddress] = useState('')
  const [guestId, setGuestId] = useState('')
  const [guestSearchOpen, setGuestSearchOpen] = useState(false)
  const [guests, setGuests] = useState<Guest[]>([])
  const [filteredGuests, setFilteredGuests] = useState<Guest[]>([])

  // Step 2: Dates
  const [checkInDate, setCheckInDate] = useState<Date>()
  const [checkOutDate, setCheckOutDate] = useState<Date>()
  const [nights, setNights] = useState(0)
  const [checkInOpen, setCheckInOpen] = useState(false)
  const [checkOutOpen, setCheckOutOpen] = useState(false)

  // Step 3: Room & Payment
  const [rooms, setRooms] = useState<Room[]>([])
  const [selectedRoomType, setSelectedRoomType] = useState('')
  const [selectedRoom, setSelectedRoom] = useState<Room | null>(null)
  const [pricePerNight, setPricePerNight] = useState(0)
  const [customPrice, setCustomPrice] = useState(0)
  const [paymentMethod, setPaymentMethod] = useState('cash')

  // City Ledger
  const [ledgerSearch, setLedgerSearch] = useState('')
  const [ledgerAccount, setLedgerAccount] = useState('')
  const [ledgerAccountName, setLedgerAccountName] = useState('')
  const [ledgerOpen, setLedgerOpen] = useState(false)
  const [allLedgerAccounts, setAllLedgerAccounts] = useState<LedgerAccount[]>([])
  const [filteredLedgerAccounts, setFilteredLedgerAccounts] = useState<LedgerAccount[]>([])

  // New ledger account creation
  const [newAccountDialogOpen, setNewAccountDialogOpen] = useState(false)
  const [newAccountName, setNewAccountName] = useState('')
  const [newAccountPhone, setNewAccountPhone] = useState('')
  const [newAccountEmail, setNewAccountEmail] = useState('')
  const [newAccountType, setNewAccountType] = useState('individual')
  const [newAccountCreating, setNewAccountCreating] = useState(false)

  useEffect(() => {
    if (open) {
      loadData()
    }
  }, [open])

  const loadData = async () => {
    try {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      const { data: profile } = await supabase
        .from('profiles')
        .select('organization_id')
        .eq('id', user.id)
        .single()

      if (!profile?.organization_id) {
        toast.error('Organization not found')
        return
      }

      const orgId = profile.organization_id
      setOrganizationId(orgId)

      // Load guests, rooms, and ledger accounts (individual guests + organizations)
      const [
        { data: guestData },
        { data: roomData },
        { data: guestLedgerData },
        { data: orgLedgerData }
      ] = await Promise.all([
        supabase.from('guests').select('id, name, phone, email, address').eq('organization_id', orgId).order('name'),
        supabase.from('rooms').select('id, room_number, room_type, price_per_night').eq('organization_id', orgId).eq('status', 'available').order('room_number'),
        // Load guests as individual ledger accounts
        supabase.from('guests').select('id, name, phone, balance').eq('organization_id', orgId).order('name'),
        // Load other organizations as ledger accounts (all organizations except current one)
        supabase.from('organizations').select('id, name, phone, email').neq('id', orgId).order('name'),
      ])

      setGuests(guestData || [])
      setRooms(roomData || [])

      // Combine guest and organization ledger accounts
      const combinedLedger: LedgerAccount[] = [
        ...(guestLedgerData || []).map(g => ({
          id: g.id,
          account_name: g.name,
          account_type: 'individual',
          contact_phone: g.phone || '',
          balance: g.balance || 0,
        })),
        ...(orgLedgerData || []).map(o => ({
          id: o.id,
          account_name: o.name,
          account_type: 'organization',
          contact_phone: o.phone || '',
          balance: 0, // Organizations don't have a pre-existing balance in the current schema
        }))
      ]

      console.log('[v0] Loaded ledger accounts:', combinedLedger)
      setAllLedgerAccounts(combinedLedger)
      setFilteredLedgerAccounts(combinedLedger)
    } catch (err: any) {
      console.error('[v0] Error loading data:', err)
      toast.error('Failed to load data')
    }
  }

  // Guest search
  const handleGuestSearch = (value: string) => {
    setFullName(value)
    setGuestId('')
    if (value.trim().length > 0) {
      const filtered = guests.filter(g =>
        g.name.toLowerCase().includes(value.toLowerCase()) ||
        (g.phone || '').includes(value)
      )
      setFilteredGuests(filtered)
      setGuestSearchOpen(filtered.length > 0)
    } else {
      setFilteredGuests([])
      setGuestSearchOpen(false)
    }
  }

  const selectGuest = (guest: Guest) => {
    setGuestId(guest.id)
    setFullName(guest.name)
    setPhone(guest.phone || '')
    setEmail(guest.email || '')
    setAddress(guest.address || '')
    setGuestSearchOpen(false)
  }

  // Ledger search
  const handleLedgerSearch = (value: string) => {
    setLedgerSearch(value)
    setLedgerAccount('')
    setLedgerAccountName('')
    if (value.trim().length > 0) {
      const filtered = allLedgerAccounts.filter(acc =>
        acc.account_name.toLowerCase().includes(value.toLowerCase())
      )
      setFilteredLedgerAccounts(filtered)
      setLedgerOpen(true)
    } else {
      setFilteredLedgerAccounts(allLedgerAccounts)
      setLedgerOpen(allLedgerAccounts.length > 0)
    }
  }

  const selectLedgerAccount = (account: LedgerAccount) => {
    setLedgerAccount(account.id)
    setLedgerAccountName(account.account_name)
    setLedgerSearch(account.account_name)
    setLedgerOpen(false)
  }

  const clearLedgerAccount = () => {
    setLedgerAccount('')
    setLedgerAccountName('')
    setLedgerSearch('')
    setFilteredLedgerAccounts(allLedgerAccounts)
  }

  // Create new ledger account
  const handleCreateNewAccount = async () => {
    if (!newAccountName.trim() || !newAccountPhone.trim()) {
      toast.error('Please enter name and phone number')
      return
    }
    try {
      setNewAccountCreating(true)
      const supabase = createClient()
      
      let newAcc: any
      if (newAccountType === 'individual') {
        // Create as a guest
        const { data, error } = await supabase
          .from('guests')
          .insert([{
            organization_id: organizationId,
            name: newAccountName.trim(),
            phone: newAccountPhone.trim(),
            email: newAccountEmail.trim() || null,
            balance: 0,
          }])
          .select()
          .single()
        if (error) throw error
        newAcc = { ...data, account_type: 'individual' }
      } else {
        // Create as a new organization
        const { data, error } = await supabase
          .from('organizations')
          .insert([{
            name: newAccountName.trim(),
            phone: newAccountPhone.trim(),
            email: newAccountEmail.trim() || `org-${Date.now()}@noemail.com`,
          }])
          .select()
          .single()
        if (error) throw error
        newAcc = { ...data, account_type: 'organization' }
      }

      toast.success(`Account "${newAcc.name}" created`)
      setNewAccountDialogOpen(false)
      setNewAccountName('')
      setNewAccountPhone('')
      setNewAccountEmail('')
      setNewAccountType('individual')

      // Reload and auto-select
      await loadData()
      setLedgerAccount(newAcc.id)
      setLedgerAccountName(newAcc.name)
      setLedgerSearch(newAcc.name)
    } catch (err: any) {
      console.error('[v0] Error creating account:', err)
      toast.error(err.message || 'Failed to create account')
    } finally {
      setNewAccountCreating(false)
    }
  }

  // Date handlers
  const handleCheckInChange = (date: Date | undefined) => {
    if (!date) return
    setCheckInDate(date)
    setCheckInOpen(false)
    setCheckOutDate(undefined)
    setNights(0)
  }

  const handleCheckOutChange = (date: Date | undefined) => {
    if (!date || !checkInDate) return
    setCheckOutDate(date)
    setCheckOutOpen(false)
    const n = Math.ceil((date.getTime() - checkInDate.getTime()) / (1000 * 60 * 60 * 24))
    setNights(Math.max(0, n))
  }

  const handleNightsChange = (value: number) => {
    const n = Math.max(1, value || 1)
    setNights(n)
    if (checkInDate) {
      setCheckOutDate(addDays(checkInDate, n))
    }
  }

  // Room selection
  const handleRoomTypeSelect = (roomType: string) => {
    setSelectedRoomType(roomType)
    const room = rooms.find(r => r.room_type === roomType)
    if (room) {
      setSelectedRoom(room)
      setPricePerNight(room.price_per_night)
    }
  }

  const canGoToNextStep = () => {
    if (step === 1) return !!(guestId || fullName.trim()) && !!phone.trim()
    if (step === 2) return !!(checkInDate && checkOutDate && nights > 0)
    if (step === 3) return !!(selectedRoom && (paymentMethod !== 'city_ledger' || ledgerAccount))
    return false
  }

  const handleSubmit = async () => {
    try {
      setLoading(true)
      if (!checkInDate || !checkOutDate) { toast.error('Dates required'); return }
      if (!selectedRoom) { toast.error('Room required'); return }
      if (paymentMethod === 'city_ledger' && !ledgerAccount) { toast.error('Select a ledger account'); return }

      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()

      let finalGuestId = guestId
      if (!guestId) {
        const { data: newGuest, error: ge } = await supabase
          .from('guests')
          .insert([{ organization_id: organizationId, name: fullName, phone, email: email || null, address: address || null }])
          .select()
          .single()
        if (ge) throw ge
        finalGuestId = newGuest.id
      }

      const effectiveRate = customPrice > 0 ? customPrice : pricePerNight
      const total = effectiveRate * nights
      const isPaid = paymentMethod !== 'city_ledger'
      const folioId = `FOL-${Date.now().toString(36).toUpperCase()}`

      const { data: booking, error: be } = await supabase
        .from('bookings')
        .insert([{
          organization_id: organizationId,
          guest_id: finalGuestId,
          room_id: selectedRoom.id,
          folio_id: folioId,
          check_in: checkInDate.toISOString(),
          check_out: checkOutDate.toISOString(),
          number_of_nights: nights,
          rate_per_night: effectiveRate,
          total_amount: total,
          deposit: isPaid ? total : 0,
          balance: isPaid ? 0 : total,
          payment_status: isPaid ? 'paid' : 'pending',
          status: 'confirmed',
          created_by: user?.id,
        }])
        .select()
        .single()
      if (be) throw be

      if (paymentMethod === 'city_ledger' && ledgerAccount) {
        const account = allLedgerAccounts.find(a => a.id === ledgerAccount)
        if (account) {
          if (account.account_type === 'individual') {
            // Update guest balance
            const { data: guest } = await supabase
              .from('guests')
              .select('balance')
              .eq('id', ledgerAccount)
              .single()
            await supabase
              .from('guests')
              .update({ balance: (guest?.balance || 0) + total })
              .eq('id', ledgerAccount)
          }
          // For organizations, balance tracking would use city_ledger_accounts table
          // For now, we just record the transaction in the folio_charges
        }
      }

      await supabase.from('rooms').update({ status: 'occupied' }).eq('id', selectedRoom.id)

      toast.success(`Booking created! Ref: ${booking.folio_id}`)
      onSuccess?.()
      onClose()
      resetForm()
    } catch (err: any) {
      toast.error(err.message || 'Failed to create booking')
    } finally {
      setLoading(false)
    }
  }

  const resetForm = () => {
    setStep(1)
    setFullName(''); setPhone(''); setEmail(''); setAddress(''); setGuestId('')
    setCheckInDate(undefined); setCheckOutDate(undefined); setNights(0)
    setSelectedRoomType(''); setSelectedRoom(null); setPricePerNight(0); setCustomPrice(0)
    setPaymentMethod('cash')
    setLedgerSearch(''); setLedgerAccount(''); setLedgerAccountName('')
  }

  return (
    <>
      <Dialog open={open} onOpenChange={onClose}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>New Booking - Step {step} of 3</DialogTitle>
            <DialogDescription>
              {step === 1 ? 'Enter guest information' : step === 2 ? 'Select stay dates' : 'Choose room and payment'}
            </DialogDescription>
          </DialogHeader>

          {/* Step 1: Guest Information */}
          {step === 1 && (
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label>Full Name *</Label>
                <div className="relative">
                  <Input
                    placeholder="Type guest name (existing guests will appear)"
                    value={fullName}
                    onChange={(e) => handleGuestSearch(e.target.value)}
                    onFocus={() => {
                      if (filteredGuests.length > 0) setGuestSearchOpen(true)
                    }}
                    onBlur={() => setTimeout(() => setGuestSearchOpen(false), 150)}
                  />
                  {guestSearchOpen && filteredGuests.length > 0 && (
                    <div className="absolute top-full left-0 right-0 mt-1 bg-background border border-input rounded-md shadow-lg z-50 max-h-56 overflow-y-auto">
                      {filteredGuests.map(guest => (
                        <button
                          key={guest.id}
                          className="w-full text-left px-4 py-3 hover:bg-accent border-b last:border-b-0 transition-colors"
                          onMouseDown={(e) => { e.preventDefault(); selectGuest(guest) }}
                        >
                          <div className="font-medium text-sm">{guest.name}</div>
                          <div className="text-xs text-muted-foreground">{guest.phone}</div>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                {filteredGuests.length > 0 && guestSearchOpen && (
                  <p className="text-xs text-muted-foreground">Select a suggestion or keep typing to create a new guest</p>
                )}
              </div>

              <div className="space-y-2">
                <Label>Phone Number * {guestId && <span className="text-xs text-green-600">(from existing guest)</span>}</Label>
                <Input placeholder="Phone number" value={phone} onChange={(e) => setPhone(e.target.value)} disabled={!!guestId} />
              </div>

              <div className="space-y-2">
                <Label>Email {guestId && <span className="text-xs text-green-600">(from existing guest)</span>}</Label>
                <Input type="email" placeholder="Email address" value={email} onChange={(e) => setEmail(e.target.value)} disabled={!!guestId} />
              </div>

              <div className="space-y-2">
                <Label>Address {guestId && <span className="text-xs text-green-600">(from existing guest)</span>}</Label>
                <Input placeholder="Street address" value={address} onChange={(e) => setAddress(e.target.value)} disabled={!!guestId} />
              </div>

              {guestId && (
                <div className="flex items-center justify-between bg-blue-50 border border-blue-200 rounded p-3">
                  <p className="text-sm text-blue-900">Guest details populated from existing record</p>
                  <Button size="sm" variant="ghost" onClick={() => { setGuestId(''); setFullName(''); setPhone(''); setEmail(''); setAddress('') }}>
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              )}
              {!guestId && fullName.trim() && (
                <div className="bg-amber-50 border border-amber-200 rounded p-3">
                  <p className="text-sm text-amber-900">New guest will be created: <strong>{fullName}</strong></p>
                </div>
              )}
            </div>
          )}

          {/* Step 2: Dates */}
          {step === 2 && (
            <div className="space-y-4 py-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Check-in Date *</Label>
                  <Popover open={checkInOpen} onOpenChange={setCheckInOpen}>
                    <PopoverTrigger asChild>
                      <Button variant="outline" className="w-full justify-start text-left font-normal">
                        <CalendarIcon className="mr-2 h-4 w-4" />
                        {checkInDate ? format(checkInDate, 'MMM dd, yyyy') : 'Select date'}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <Calendar mode="single" selected={checkInDate} onSelect={handleCheckInChange} disabled={(date) => date < new Date()} />
                    </PopoverContent>
                  </Popover>
                </div>

                <div className="space-y-2">
                  <Label>Check-out Date *</Label>
                  <Popover open={checkOutOpen} onOpenChange={setCheckOutOpen}>
                    <PopoverTrigger asChild>
                      <Button variant="outline" className="w-full justify-start text-left font-normal">
                        <CalendarIcon className="mr-2 h-4 w-4" />
                        {checkOutDate ? format(checkOutDate, 'MMM dd, yyyy') : 'Select date'}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <Calendar mode="single" selected={checkOutDate} onSelect={handleCheckOutChange} disabled={(date) => !checkInDate || date <= checkInDate} />
                    </PopoverContent>
                  </Popover>
                </div>
              </div>

              <div className="space-y-2">
                <Label>Number of Nights *</Label>
                <Input
                  type="number"
                  min="1"
                  placeholder="1"
                  value={nights || ''}
                  onChange={(e) => {
                    const num = parseInt(e.target.value)
                    if (!isNaN(num) && num >= 1) handleNightsChange(num)
                  }}
                />
                <p className="text-xs text-muted-foreground">Changing nights will update the checkout date automatically</p>
              </div>
            </div>
          )}

          {/* Step 3: Room & Payment */}
          {step === 3 && (
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label>Room Type *</Label>
                <Select value={selectedRoomType} onValueChange={handleRoomTypeSelect}>
                  <SelectTrigger><SelectValue placeholder="Select room type" /></SelectTrigger>
                  <SelectContent>
                    {Array.from(new Set(rooms.map(r => r.room_type))).map(type => (
                      <SelectItem key={type} value={type}>{type}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {selectedRoom && (
                <div className="space-y-2">
                  <Label>Select Room *</Label>
                  <Select value={selectedRoom.id} onValueChange={(id) => {
                    const room = rooms.find(r => r.id === id)
                    if (room) { setSelectedRoom(room); setPricePerNight(room.price_per_night); setCustomPrice(0) }
                  }}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {rooms.filter(r => r.room_type === selectedRoomType).map(room => (
                        <SelectItem key={room.id} value={room.id}>Room {room.room_number}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              {selectedRoom && (
                <>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>Standard Price Per Night</Label>
                      <div className="px-3 py-2 bg-muted rounded border border-input">
                        <p className="text-sm font-medium">{formatNaira(pricePerNight)}</p>
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label>Custom Price Per Night (Optional)</Label>
                      <Input
                        type="number"
                        placeholder="Leave empty for standard price"
                        value={customPrice || ''}
                        onChange={(e) => setCustomPrice(parseFloat(e.target.value) || 0)}
                      />
                    </div>
                  </div>
                  <div className="bg-blue-50 border border-blue-200 p-3 rounded-lg">
                    <p className="text-sm font-medium text-blue-900">Total: {formatNaira((customPrice || pricePerNight) * nights)}</p>
                    <p className="text-xs text-blue-700 mt-1">
                      {customPrice ? `${nights} nights x ${formatNaira(customPrice)} (custom)` : `${nights} nights x ${formatNaira(pricePerNight)}`}
                    </p>
                  </div>
                </>
              )}

              <div className="space-y-2">
                <Label>Payment Method *</Label>
                <Select value={paymentMethod} onValueChange={(v) => { setPaymentMethod(v); setLedgerAccount(''); setLedgerSearch(''); setLedgerAccountName('') }}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="cash">Cash</SelectItem>
                    <SelectItem value="transfer">Transfer</SelectItem>
                    <SelectItem value="pos">POS</SelectItem>
                    <SelectItem value="city_ledger">City Ledger</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {paymentMethod === 'city_ledger' && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label>Search Ledger Account *</Label>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="text-xs h-8"
                      onClick={() => setNewAccountDialogOpen(true)}
                    >
                      + Add New Account
                    </Button>
                  </div>
                  <div className="relative">
                    <Input
                      placeholder="Type to search guest or organization accounts..."
                      value={ledgerSearch}
                      onChange={(e) => handleLedgerSearch(e.target.value)}
                      onFocus={() => {
                        setFilteredLedgerAccounts(
                          ledgerSearch.trim()
                            ? allLedgerAccounts.filter(a => a.account_name.toLowerCase().includes(ledgerSearch.toLowerCase()))
                            : allLedgerAccounts
                        )
                        setLedgerOpen(true)
                      }}
                      onBlur={() => setTimeout(() => setLedgerOpen(false), 150)}
                    />
                    {ledgerAccount && (
                      <button
                        className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                        onMouseDown={(e) => { e.preventDefault(); clearLedgerAccount() }}
                      >
                        <X className="h-4 w-4" />
                      </button>
                    )}
                    {ledgerOpen && (
                      <div className="absolute top-full left-0 right-0 mt-1 bg-background border border-input rounded-md shadow-lg z-50 max-h-56 overflow-y-auto">
                        {filteredLedgerAccounts.length > 0 ? (
                          filteredLedgerAccounts.map(account => (
                            <button
                              key={account.id}
                              className="w-full text-left px-3 py-2 hover:bg-accent border-b last:border-b-0 transition-colors text-sm"
                              onMouseDown={(e) => { e.preventDefault(); selectLedgerAccount(account) }}
                            >
                              <div className="font-medium">{account.account_name}</div>
                              <div className="text-xs text-muted-foreground flex gap-3">
                                <span className="capitalize">{account.account_type}</span>
                                <span>Balance: {formatNaira(account.balance || 0)}</span>
                              </div>
                            </button>
                          ))
                        ) : (
                          <div className="px-3 py-2 text-sm text-muted-foreground text-center">
                            {allLedgerAccounts.length === 0 
                              ? 'No accounts yet. Click "Add New Account" to create one.' 
                              : 'No matching accounts found'}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                  {ledgerAccount && (
                    <p className="text-xs text-green-600 font-medium">Selected: {ledgerAccountName}</p>
                  )}
                  {allLedgerAccounts.length === 0 && (
                    <p className="text-xs text-amber-600">No ledger accounts found. Click "Add New Account" above to create one.</p>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Navigation */}
          <div className="flex justify-between gap-2 pt-4 border-t">
            <Button variant="outline" onClick={() => setStep(step - 1)} disabled={step === 1 || loading}>
              <ChevronLeft className="mr-2 h-4 w-4" />
              Previous
            </Button>
            {step < 3 ? (
              <Button onClick={() => setStep(step + 1)} disabled={!canGoToNextStep() || loading}>
                Next
                <ChevronRight className="ml-2 h-4 w-4" />
              </Button>
            ) : (
              <Button onClick={handleSubmit} disabled={!canGoToNextStep() || loading}>
                {loading ? 'Creating...' : 'Create Booking'}
              </Button>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* New Ledger Account Dialog */}
      <Dialog open={newAccountDialogOpen} onOpenChange={setNewAccountDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Add New Ledger Account</DialogTitle>
            <DialogDescription>
              Create a new city ledger account for a guest or organization.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Account Type *</Label>
              <Select value={newAccountType} onValueChange={setNewAccountType}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="individual">Individual (Guest)</SelectItem>
                  <SelectItem value="organization">Organization / Company</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Account Name *</Label>
              <Input
                placeholder={newAccountType === 'individual' ? 'Guest full name' : 'Company / organization name'}
                value={newAccountName}
                onChange={(e) => setNewAccountName(e.target.value)}
                disabled={newAccountCreating}
              />
            </div>
            <div className="space-y-2">
              <Label>Phone Number *</Label>
              <Input
                type="tel"
                placeholder="Contact phone number"
                value={newAccountPhone}
                onChange={(e) => setNewAccountPhone(e.target.value)}
                disabled={newAccountCreating}
              />
            </div>
            <div className="space-y-2">
              <Label>Email (Optional)</Label>
              <Input
                type="email"
                placeholder="Contact email address"
                value={newAccountEmail}
                onChange={(e) => setNewAccountEmail(e.target.value)}
                disabled={newAccountCreating}
              />
            </div>
            <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-sm">
              <div className="font-medium text-amber-900">Starting Balance: {formatNaira(0)}</div>
              <div className="text-amber-700 text-xs mt-1">Balance will increase as charges are added to this account.</div>
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setNewAccountDialogOpen(false)} disabled={newAccountCreating}>
              Cancel
            </Button>
            <Button
              onClick={handleCreateNewAccount}
              disabled={newAccountCreating || !newAccountName.trim() || !newAccountPhone.trim()}
            >
              {newAccountCreating ? 'Creating...' : 'Create Account'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}
