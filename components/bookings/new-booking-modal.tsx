'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Card, CardContent } from '@/components/ui/card'
import { Calendar } from '@/components/ui/calendar'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Badge } from '@/components/ui/badge'
import { format, differenceInDays, addDays } from 'date-fns'
import { Calendar as CalendarIcon, ChevronRight, ChevronLeft, X } from 'lucide-react'
import { formatNaira } from '@/lib/utils/currency'
import { toast } from 'sonner'
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem } from '@/components/ui/command'
import { Popover as SearchPopover, PopoverContent as SearchPopoverContent, PopoverTrigger as SearchPopoverTrigger } from '@/components/ui/popover'

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

interface Organization {
  id: string
  name: string
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
  const [nights, setNights] = useState(1)
  const [checkInOpen, setCheckInOpen] = useState(false)
  const [checkOutOpen, setCheckOutOpen] = useState(false)

  // Step 3: Room & Payment
  const [rooms, setRooms] = useState<Room[]>([])
  const [selectedRoomType, setSelectedRoomType] = useState('')
  const [selectedRoom, setSelectedRoom] = useState<Room | null>(null)
  const [pricePerNight, setPricePerNight] = useState(0)
  const [paymentMethod, setPaymentMethod] = useState('cash')
  const [ledgerSearch, setLedgerSearch] = useState('')
  const [ledgerType, setLedgerType] = useState('individual') // individual or organization
  const [ledgerAccount, setLedgerAccount] = useState('')
  const [ledgerAccounts, setLedgerAccounts] = useState<any[]>([])
  const [ledgerOpen, setLedgerOpen] = useState(false)
  const [filteredLedgerAccounts, setFilteredLedgerAccounts] = useState<any[]>([])

  // Load initial data
  useEffect(() => {
    if (open) {
      loadData()
    }
  }, [open])

  const loadData = async () => {
    try {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()

      if (!user) {
        toast.error('User not authenticated')
        return
      }

      const { data: profile } = await supabase
        .from('profiles')
        .select('organization_id')
        .eq('id', user.id)
        .single()

      if (!profile?.organization_id) {
        toast.error('Organization not found')
        return
      }

      setOrganizationId(profile.organization_id)

      // Load guests
      const { data: guestData } = await supabase
        .from('guests')
        .select('*')
        .eq('organization_id', profile.organization_id)
        .order('name')

      // Load available rooms
      const { data: roomData } = await supabase
        .from('rooms')
        .select('*')
        .eq('organization_id', profile.organization_id)
        .eq('status', 'available')
        .order('room_number')

      // Load city ledger accounts
      const { data: ledgerData } = await supabase
        .from('city_ledger_accounts')
        .select('*')
        .eq('organization_id', profile.organization_id)
        .order('name')

      setGuests(guestData || [])
      setRooms(roomData || [])
      setLedgerAccounts(ledgerData || [])
      setFilteredGuests(guestData || [])
      setFilteredLedgerAccounts(ledgerData || [])
    } catch (error: any) {
      toast.error('Failed to load data')
    }
  }

  const handleGuestSearch = (value: string) => {
    setFullName(value)
    setGuestId('') // Clear selected guest when typing
    if (value.length > 0) {
      const filtered = guests.filter(g =>
        g.name.toLowerCase().includes(value.toLowerCase())
      )
      setFilteredGuests(filtered)
      setGuestSearchOpen(filtered.length > 0) // Only show popover if matches exist
    } else {
      setFilteredGuests([])
      setGuestSearchOpen(false)
    }
  }

  const selectGuest = (guest: Guest) => {
    setGuestId(guest.id)
    setFullName(guest.name)
    setPhone(guest.phone)
    setEmail(guest.email)
    setAddress(guest.address)
    setGuestSearchOpen(false)
  }

  const handleCreateGuest = async () => {
    if (!fullName.trim() || !phone.trim()) {
      toast.error('Full name and phone are required')
      return
    }

    try {
      setLoading(true)
      const supabase = createClient()
      const { data, error } = await supabase
        .from('guests')
        .insert([{
          organization_id: organizationId,
          name: fullName,
          phone,
          email: email || null,
          address: address || null,
        }])
        .select()
        .single()

      if (error) throw error
      setGuestId(data.id)
      toast.success('Guest created successfully')
    } catch (error: any) {
      toast.error(error.message || 'Failed to create guest')
    } finally {
      setLoading(false)
    }
  }

  const handleCheckInChange = (date: Date | undefined) => {
    if (!date) return
    setCheckInDate(date)
    setCheckInOpen(false)
    // Update checkout date to be at least 1 day after check-in
    if (checkOutDate && checkOutDate <= date) {
      const newCheckOut = addDays(date, 1)
      setCheckOutDate(newCheckOut)
      setNights(1)
    }
  }

  const handleCheckOutChange = (date: Date | undefined) => {
    if (!date || !checkInDate) return
    setCheckOutDate(date)
    setCheckOutOpen(false)
    // Calculate nights
    const calculatedNights = Math.ceil((date.getTime() - checkInDate.getTime()) / (1000 * 60 * 60 * 24))
    setNights(Math.max(1, calculatedNights))
  }

  const handleNightsChange = (value: number) => {
    const validNights = Math.max(1, value || 1)
    setNights(validNights)
    if (checkInDate) {
      const newCheckOut = addDays(checkInDate, validNights)
      setCheckOutDate(newCheckOut)
    }
  }
  }

  const handleCheckOutChange = (date: Date | undefined) => {
    setCheckOutDate(date)
    if (date && checkInDate) {
      const diff = differenceInDays(date, checkInDate)
      setNights(Math.max(1, diff))
    }
  }

  const handleNightsChange = (value: number) => {
    setNights(Math.max(1, value))
    if (checkInDate) {
      setCheckOutDate(addDays(checkInDate, Math.max(1, value)))
    }
  }

  const handleRoomTypeSelect = (roomType: string) => {
    setSelectedRoomType(roomType)
    const room = rooms.find(r => r.room_type === roomType)
    if (room) {
      setSelectedRoom(room)
      setPricePerNight(room.price_per_night)
    }
  }

  const handleLedgerSearch = (value: string) => {
    setLedgerSearch(value)
    if (value.length > 0) {
      const filtered = ledgerAccounts.filter(acc =>
        acc.name.toLowerCase().includes(value.toLowerCase())
      )
      setFilteredLedgerAccounts(filtered)
    } else {
      setFilteredLedgerAccounts(ledgerAccounts)
    }
  }

  const selectLedgerAccount = (account: any) => {
    setLedgerAccount(account.id)
    setLedgerSearch(account.name)
    setLedgerOpen(false)
  }

  const handleSubmit = async () => {
    try {
      setLoading(true)

      // Validation
      if (!guestId && !fullName) {
        toast.error('Guest information is required')
        return
      }

      if (!checkInDate || !checkOutDate) {
        toast.error('Check-in and check-out dates are required')
        return
      }

      if (!selectedRoom) {
        toast.error('Room selection is required')
        return
      }

      if (paymentMethod === 'ledger' && !ledgerAccount) {
        toast.error('Ledger account is required')
        return
      }

      const supabase = createClient()

      // Create guest if new
      let finalGuestId = guestId
      if (!guestId) {
        const { data: newGuest, error: guestError } = await supabase
          .from('guests')
          .insert([{
            organization_id: organizationId,
            name: fullName,
            phone,
            email: email || null,
            address: address || null,
          }])
          .select()
          .single()

        if (guestError) throw guestError
        finalGuestId = newGuest.id
      }

      // Calculate total
      const total = pricePerNight * nights

      // Create booking
      const { data: booking, error: bookingError } = await supabase
        .from('bookings')
        .insert([{
          organization_id: organizationId,
          guest_id: finalGuestId,
          room_id: selectedRoom.id,
          check_in: checkInDate.toISOString(),
          check_out: checkOutDate.toISOString(),
          number_of_nights: nights,
          rate_per_night: pricePerNight,
          total_charges: total,
          balance: total,
          payment_method: paymentMethod,
          payment_status: 'pending',
          status: 'confirmed',
          city_ledger_id: paymentMethod === 'ledger' ? ledgerAccount : null,
        }])
        .select()
        .single()

      if (bookingError) throw bookingError

      // Update room status
      await supabase
        .from('rooms')
        .update({ status: 'occupied' })
        .eq('id', selectedRoom.id)

      toast.success(`Booking created successfully! Ref: ${booking.folio_id || booking.id}`)
      onSuccess?.()
      onClose()
      resetForm()
    } catch (error: any) {
      toast.error(error.message || 'Failed to create booking')
    } finally {
      setLoading(false)
    }
  }

  const resetForm = () => {
    setStep(1)
    setFullName('')
    setPhone('')
    setEmail('')
    setAddress('')
    setGuestId('')
    setCheckInDate(undefined)
    setCheckOutDate(undefined)
    setNights(1)
    setSelectedRoomType('')
    setSelectedRoom(null)
    setPricePerNight(0)
    setPaymentMethod('cash')
    setLedgerSearch('')
    setLedgerAccount('')
  }

  const canGoToNextStep = () => {
    if (step === 1) {
      return (guestId || fullName.trim()) && phone.trim()
    }
    if (step === 2) {
      return checkInDate && checkOutDate && nights > 0
    }
    if (step === 3) {
      return selectedRoom && (paymentMethod !== 'ledger' || ledgerAccount)
    }
    return false
  }

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>New Booking - Step {step} of 3</DialogTitle>
        </DialogHeader>

        {/* Step 1: Guest Information */}
        {step === 1 && (
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Full Name *</Label>
              <div className="relative">
                <Input
                  placeholder="Type guest name (existing guests will appear below)"
                  value={fullName}
                  onChange={(e) => handleGuestSearch(e.target.value)}
                  onFocus={() => {
                    if (fullName.length > 0 && filteredGuests.length > 0) {
                      setGuestSearchOpen(true)
                    }
                  }}
                />
                
                {/* Suggestions Dropdown */}
                {guestSearchOpen && filteredGuests.length > 0 && (
                  <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-input rounded-md shadow-lg z-50 max-h-64 overflow-y-auto">
                    {filteredGuests.map(guest => (
                      <button
                        key={guest.id}
                        className="w-full text-left px-4 py-3 hover:bg-accent border-b last:border-b-0 transition-colors"
                        onClick={() => selectGuest(guest)}
                      >
                        <div className="font-medium text-sm">{guest.name}</div>
                        <div className="text-xs text-muted-foreground">{guest.phone}</div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
              {filteredGuests.length > 0 && guestSearchOpen && (
                <p className="text-xs text-muted-foreground">
                  Click a suggestion or continue typing to create new guest
                </p>
              )}
            </div>

            <div className="space-y-2">
              <Label>Phone Number * {guestId && <span className="text-xs text-green-600">(from existing guest)</span>}</Label>
              <Input
                placeholder="Phone number"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                disabled={!!guestId}
              />
            </div>

            <div className="space-y-2">
              <Label>Email {guestId && <span className="text-xs text-green-600">(from existing guest)</span>}</Label>
              <Input
                type="email"
                placeholder="Email address"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={!!guestId}
              />
            </div>

            <div className="space-y-2">
              <Label>Address {guestId && <span className="text-xs text-green-600">(from existing guest)</span>}</Label>
              <Input
                placeholder="Street address"
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                disabled={!!guestId}
              />
            </div>

            {guestId && (
              <div className="bg-blue-50 border border-blue-200 rounded p-3">
                <p className="text-sm text-blue-900">
                  ✓ Guest details populated from existing record
                </p>
              </div>
            )}

            {!guestId && fullName.trim() && (
              <div className="bg-amber-50 border border-amber-200 rounded p-3">
                <p className="text-sm text-amber-900">
                  This will create a new guest: <strong>{fullName}</strong>
                </p>
              </div>
            )}

            <div className="space-y-2">
              <Label>Address</Label>
              <Input
                placeholder="Address"
                value={address}
                onChange={(e) => setAddress(e.target.value)}
              />
            </div>
          </div>
        )}

        {/* Step 2: Check-in/Check-out Dates */}
        {step === 2 && (
          <div className="space-y-4 py-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Check-in Date *</Label>
                <Popover open={checkInOpen} onOpenChange={setCheckInOpen}>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      className="w-full justify-start text-left font-normal"
                    >
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {checkInDate ? format(checkInDate, 'MMM dd, yyyy') : 'Select date'}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar
                      mode="single"
                      selected={checkInDate}
                      onSelect={handleCheckInChange}
                      disabled={(date) => date < new Date()}
                    />
                  </PopoverContent>
                </Popover>
              </div>

              <div className="space-y-2">
                <Label>Check-out Date *</Label>
                <Popover open={checkOutOpen} onOpenChange={setCheckOutOpen}>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      className="w-full justify-start text-left font-normal"
                    >
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {checkOutDate ? format(checkOutDate, 'MMM dd, yyyy') : 'Select date'}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar
                      mode="single"
                      selected={checkOutDate}
                      onSelect={handleCheckOutChange}
                      disabled={(date) => !checkInDate || date <= checkInDate}
                    />
                  </PopoverContent>
                </Popover>
              </div>
            </div>

            <div className="space-y-2">
              <Label>Number of Nights *</Label>
              <Input
                type="number"
                min="1"
                placeholder="Enter number of nights"
                value={nights}
                onChange={(e) => handleNightsChange(parseInt(e.target.value) || 0)}
              />
              <p className="text-xs text-muted-foreground">
                Changes will update checkout date automatically
              </p>
            </div>
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
                  {Array.from(new Set(rooms.map(r => r.room_type))).map(type => (
                    <SelectItem key={type} value={type}>
                      {type}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {selectedRoom && (
              <div className="space-y-2">
                <Label>Select Room *</Label>
                <Select value={selectedRoom?.id} onValueChange={(id) => {
                  const room = rooms.find(r => r.id === id)
                  if (room) {
                    setSelectedRoom(room)
                    setPricePerNight(room.price_per_night)
                  }
                }}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {rooms
                      .filter(r => r.room_type === selectedRoomType)
                      .map(room => (
                        <SelectItem key={room.id} value={room.id}>
                          Room {room.room_number}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            <div className="space-y-2">
              <Label>Price Per Night (Optional)</Label>
              <Input
                type="number"
                value={pricePerNight}
                onChange={(e) => setPricePerNight(parseFloat(e.target.value) || 0)}
              />
            </div>

            <div className="bg-muted p-3 rounded-lg">
              <p className="text-sm font-medium">Total: {formatNaira(pricePerNight * nights)}</p>
            </div>

            <div className="space-y-2">
              <Label>Payment Method *</Label>
              <Select value={paymentMethod} onValueChange={setPaymentMethod}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="cash">Cash</SelectItem>
                  <SelectItem value="transfer">Transfer</SelectItem>
                  <SelectItem value="pos">POS</SelectItem>
                  <SelectItem value="ledger">Ledger</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {paymentMethod === 'ledger' && (
              <>
                <div className="space-y-2">
                  <Label>Ledger Account Type *</Label>
                  <Select value={ledgerType} onValueChange={setLedgerType}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="individual">Individual Account</SelectItem>
                      <SelectItem value="organization">Organization Account</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label>Search Ledger Account *</Label>
                  <Popover open={ledgerOpen} onOpenChange={setLedgerOpen}>
                    <PopoverTrigger asChild>
                      <Input
                        placeholder="Search or create account"
                        value={ledgerSearch}
                        onChange={(e) => handleLedgerSearch(e.target.value)}
                      />
                    </PopoverTrigger>
                    <PopoverContent className="w-80 p-0" align="start">
                      <Command>
                        <CommandInput placeholder="Search accounts..." />
                        <CommandEmpty>No accounts found</CommandEmpty>
                        <CommandGroup>
                          {filteredLedgerAccounts.map(account => (
                            <CommandItem
                              key={account.id}
                              onSelect={() => selectLedgerAccount(account)}
                            >
                              <div>
                                <div className="font-medium">{account.name}</div>
                                <div className="text-xs text-muted-foreground">
                                  Balance: {formatNaira(account.balance || 0)}
                                </div>
                              </div>
                            </CommandItem>
                          ))}
                        </CommandGroup>
                      </Command>
                    </PopoverContent>
                  </Popover>
                </div>
              </>
            )}
          </div>
        )}

        {/* Navigation */}
        <div className="flex justify-between gap-2 pt-4 border-t">
          <Button
            variant="outline"
            onClick={() => setStep(step - 1)}
            disabled={step === 1 || loading}
          >
            <ChevronLeft className="mr-2 h-4 w-4" />
            Previous
          </Button>

          {step < 3 ? (
            <Button
              onClick={() => setStep(step + 1)}
              disabled={!canGoToNextStep() || loading}
            >
              Next
              <ChevronRight className="ml-2 h-4 w-4" />
            </Button>
          ) : (
            <Button
              onClick={handleSubmit}
              disabled={!canGoToNextStep() || loading}
            >
              {loading ? 'Creating...' : 'Create Booking'}
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
