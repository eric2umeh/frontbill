'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
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
  const [nights, setNights] = useState(0)
  const [checkInOpen, setCheckInOpen] = useState(false)
  const [checkOutOpen, setCheckOutOpen] = useState(false)

  // Step 3: Room & Payment
  const [rooms, setRooms] = useState<Room[]>([])
  const [selectedRoomType, setSelectedRoomType] = useState('')
  const [selectedRoom, setSelectedRoom] = useState<Room | null>(null)
  const [pricePerNight, setPricePerNight] = useState(0)
  const [customPrice, setCustomPrice] = useState(0) // Custom/discounted price
  const [paymentMethod, setPaymentMethod] = useState('cash')
  const [ledgerSearch, setLedgerSearch] = useState('')
  const [ledgerType, setLedgerType] = useState('individual') // individual or organization
  const [ledgerAccount, setLedgerAccount] = useState('')
  const [ledgerAccounts, setLedgerAccounts] = useState<{ guests: any[]; organizations: any[] }>({ guests: [], organizations: [] })
  const [ledgerOpen, setLedgerOpen] = useState(false)
  const [filteredLedgerAccounts, setFilteredLedgerAccounts] = useState<any[]>([])
  
  // New account creation
  const [newAccountDialogOpen, setNewAccountDialogOpen] = useState(false)
  const [newAccountName, setNewAccountName] = useState('')
  const [newAccountPhone, setNewAccountPhone] = useState('')
  const [newAccountEmail, setNewAccountEmail] = useState('')
  const [newAccountCreating, setNewAccountCreating] = useState(false)

  // Load initial data
  useEffect(() => {
    if (open) {
      loadData()
    }
  }, [open])

  // Update filtered ledger accounts when ledgerType changes
  useEffect(() => {
    handleLedgerTypeChange(ledgerType)
  }, [ledgerType])

  const handleLedgerTypeChange = (type: string) => {
    setLedgerType(type)
    setLedgerAccount('')
    setLedgerSearch('')
    
    if (type === 'individual') {
      setFilteredLedgerAccounts(ledgerAccounts?.guests || [])
    } else {
      setFilteredLedgerAccounts(ledgerAccounts?.organizations || [])
    }
  }
  
  const handleLedgerSearch = (value: string) => {
    setLedgerSearch(value)
    console.log('[v0] Ledger search:', { value, ledgerType, ledgerAccounts })
    
    const toSearch = ledgerType === 'individual' 
      ? (ledgerAccounts?.guests || [])
      : (ledgerAccounts?.organizations || [])
    
    console.log('[v0] toSearch data:', toSearch)
    
    if (value.trim().length > 0) {
      const filtered = toSearch.filter(acc => {
        const name = (acc.name || acc.full_name || '').toLowerCase()
        const matches = name.includes(value.toLowerCase())
        return matches
      })
      console.log('[v0] Filtered results:', filtered)
      setFilteredLedgerAccounts(filtered)
      setLedgerOpen(filtered.length > 0)
    } else {
      setFilteredLedgerAccounts(toSearch)
      setLedgerOpen(false)
    }
  }
      }
      // Show all guests available
      setFilteredLedgerAccounts(guests)
    } else {
      // Show all organizations
      setFilteredLedgerAccounts(ledgerAccounts)
    }
  }

  const handleLedgerSearch = (value: string) => {
    setLedgerSearch(value)
    
    let toSearch = []
    if (ledgerType === 'individual') {
      toSearch = guests
    } else {
      toSearch = ledgerAccounts
    }
    
    if (value.trim().length > 0) {
      const filtered = toSearch.filter(acc => {
        const name = (acc.name || acc.full_name || '').toLowerCase()
        const matches = name.includes(value.toLowerCase())
        return matches
      })
      setFilteredLedgerAccounts(filtered)
    } else {
      setFilteredLedgerAccounts(toSearch)
    }
  }

  const selectLedgerAccount = (account: any) => {
    setLedgerAccount(account.id)
    setLedgerSearch(account.name || account.full_name || '')
  }

  const handleCreateNewAccount = async () => {
    if (!newAccountName.trim() || !newAccountPhone.trim()) {
      toast.error('Please enter name and phone number')
      return
    }

    try {
      setNewAccountCreating(true)
      const supabase = createClient()

      // Create new guest with balance = 0 (will be updated when booking is created)
      const { data: newGuest, error } = await supabase
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

      // Auto-select the new account
      setLedgerAccount(newGuest.id)
      setLedgerSearch(newGuest.name)
      setNewAccountDialogOpen(false)
      setNewAccountName('')
      setNewAccountPhone('')
      setNewAccountEmail('')

      // Refresh guests list
      await loadData()

      toast.success(`New guest account "${newGuest.name}" created and selected for city ledger`)
    } catch (error: any) {
      console.error('[v0] Error creating new account:', error)
      toast.error(error.message || 'Failed to create new account')
    } finally {
      setNewAccountCreating(false)
    }
  }

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
      // For individuals: load all guests with balance info
      // For organizations: load organizations
      const { data: guestLedgerData } = await supabase
        .from('guests')
        .select('id, name, phone, balance')
        .eq('organization_id', organizationId)
        .order('name')

      const { data: orgLedgerData } = await supabase
        .from('organizations')
        .select('id, name, org_type, email, phone, current_balance')
        .eq('parent_id', organizationId)
        .order('name')

      console.log('[v0] Loaded ledger accounts:', { guests: guestLedgerData, organizations: orgLedgerData })

      setGuests(guestData || [])
      setRooms(roomData || [])
      setLedgerAccounts({
        guests: guestLedgerData || [],
        organizations: orgLedgerData || []
      })
      setFilteredGuests([])
      
      // Initialize filtered ledger accounts based on current ledger type
      if (ledgerType === 'individual') {
        setFilteredLedgerAccounts(guestLedgerData || [])
      } else {
        setFilteredLedgerAccounts(orgLedgerData || [])
      }
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
    setPhone(guest.phone || '')
    setEmail(guest.email || '')
    setAddress(guest.address || '')
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
    // Reset checkout date and nights when check-in changes
    setCheckOutDate(undefined)
    setNights(0)
  }

  const handleCheckOutChange = (date: Date | undefined) => {
    if (!date || !checkInDate) return
    setCheckOutDate(date)
    setCheckOutOpen(false)
    // Calculate nights
    const calculatedNights = Math.ceil((date.getTime() - checkInDate.getTime()) / (1000 * 60 * 60 * 24))
    setNights(Math.max(0, calculatedNights))
  }

  const handleNightsChange = (value: number) => {
    const validNights = Math.max(0, value || 0)
    setNights(validNights)
    if (checkInDate && validNights > 0) {
      const newCheckOut = addDays(checkInDate, validNights)
      setCheckOutDate(newCheckOut)
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

      // Use custom price if provided, otherwise standard price
      const effectiveRate = customPrice > 0 ? customPrice : pricePerNight

      // Calculate total
      const total = effectiveRate * nights

      // Selecting a payment method means booking is paid in full
      const isPaidUpfront = paymentMethod !== 'ledger'

      // Generate folio ID
      const folioId = `FOL-${Date.now().toString(36).toUpperCase()}`

      const userId = (await supabase.auth.getUser()).data.user?.id

      // Create booking
      const { data: booking, error: bookingError } = await supabase
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
          balance: isPaidUpfront ? 0 : total,
          deposit: isPaidUpfront ? total : 0,
          payment_status: isPaidUpfront ? 'paid' : 'pending',
          status: 'confirmed',
          created_by: userId,
        }])
        .select()
        .single()

      if (bookingError) throw bookingError

      // If payment method is ledger, add the charge to the ledger account
      if (paymentMethod === 'ledger' && ledgerAccount) {
        if (ledgerType === 'individual') {
          // Add charge to guest's balance
          const guestToUpdate = guests.find(g => g.id === ledgerAccount)
          if (guestToUpdate) {
            const newBalance = (guestToUpdate.balance || 0) + total
            await supabase
              .from('guests')
              .update({ balance: newBalance })
              .eq('id', ledgerAccount)
          }
        } else {
          // Add charge to organization's balance
          const orgToUpdate = ledgerAccounts.find(o => o.id === ledgerAccount)
          if (orgToUpdate) {
            const newBalance = (orgToUpdate.current_balance || 0) + total
            await supabase
              .from('organizations')
              .update({ current_balance: newBalance })
              .eq('id', ledgerAccount)
          }
        }
      }

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
    setNights(0)
    setSelectedRoomType('')
    setSelectedRoom(null)
    setPricePerNight(0)
    setPaymentMethod('cash')
    setLedgerSearch('')
    setLedgerAccount('')
    setCustomPrice(0)
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
    <>
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>New Booking - Step {step} of 3</DialogTitle>
          <DialogDescription>
            Complete the booking process by providing guest information, selecting dates, and payment method.
          </DialogDescription>
        </DialogHeader>

        {/* Step 1: Guest Information */}
        {step === 1 && (
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Full Name *</Label>
              <div className="relative">
                  <Input
                    placeholder="Type guest name (existing guests will appear below)"
                    value={fullName || ''}
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
                value={phone || ''}
                onChange={(e) => setPhone(e.target.value)}
                disabled={!!guestId}
              />
            </div>

            <div className="space-y-2">
              <Label>Email {guestId && <span className="text-xs text-green-600">(from existing guest)</span>}</Label>
              <Input
                type="email"
                placeholder="Email address"
                value={email || ''}
                onChange={(e) => setEmail(e.target.value)}
                disabled={!!guestId}
              />
            </div>

            <div className="space-y-2">
              <Label>Address {guestId && <span className="text-xs text-green-600">(from existing guest)</span>}</Label>
              <Input
                placeholder="Street address"
                value={address || ''}
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
                placeholder="1"
                value={nights.toString()}
                onChange={(e) => {
                  const val = e.target.value
                  if (val === '') {
                    setNights(1)
                  } else {
                    const num = parseInt(val)
                    if (!isNaN(num) && num >= 1) {
                      handleNightsChange(num)
                    }
                  }
                }}
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
                <Select value={selectedRoomType || ''} onValueChange={handleRoomTypeSelect}>
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
                <Select value={selectedRoom?.id || ''} onValueChange={(id) => {
                  const room = rooms.find(r => r.id === id)
                  if (room) {
                    setSelectedRoom(room)
                    setPricePerNight(room.price_per_night)
                    setCustomPrice(0) // Reset custom price when room changes
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
                    <p className="text-xs text-muted-foreground">
                      Use for discounts or special rates
                    </p>
                  </div>
                </div>

                <div className="bg-blue-50 border border-blue-200 p-3 rounded-lg">
                  <p className="text-sm font-medium text-blue-900">
                    Total: {formatNaira((customPrice || pricePerNight) * nights)}
                  </p>
                  <p className="text-xs text-blue-700 mt-1">
                    {customPrice ? `${nights} nights × ${formatNaira(customPrice)} (custom)` : `${nights} nights × ${formatNaira(pricePerNight)}`}
                  </p>
                </div>
              </>
            )}

            <div className="space-y-2">
              <Label>Payment Method *</Label>
                <Select value={paymentMethod || ''} onValueChange={setPaymentMethod}>
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
                  <Select value={ledgerType || ''} onValueChange={setLedgerType}>
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
                  <Label>
                    Search {ledgerType === 'individual' ? 'Guest' : 'Organization'} Account *
                  </Label>
                  <div className="relative">
                    <Input
                      placeholder={ledgerType === 'individual' ? 'Search guest by name...' : 'Search organization by name...'}
                      value={ledgerSearch || ''}
                      onChange={(e) => handleLedgerSearch(e.target.value)}
                      onFocus={() => {
                        if (ledgerSearch.length > 0 && filteredLedgerAccounts.length > 0) {
                          setLedgerOpen(true)
                        }
                      }}
                    />
                    {ledgerAccount && (
                      <button
                        className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                        onClick={() => { setLedgerAccount(''); setLedgerSearch('') }}
                      >
                        <X className="h-4 w-4" />
                      </button>
                    )}
                    {ledgerOpen && filteredLedgerAccounts.length > 0 && (
                      <div className="absolute top-full left-0 right-0 mt-1 bg-background border border-input rounded-md shadow-lg z-50 max-h-56 overflow-y-auto">
                        {filteredLedgerAccounts.map(account => (
                          <button
                            key={account.id}
                            className="w-full text-left px-3 py-2 hover:bg-accent border-b last:border-b-0 transition-colors text-sm"
                            onMouseDown={(e) => { e.preventDefault(); selectLedgerAccount(account) }}
                          >
                            <div className="font-medium">{account.name || account.full_name}</div>
                            <div className="text-xs text-muted-foreground">
                              Balance: {formatNaira(
                                ledgerType === 'individual'
                                  ? (account.balance || 0)
                                  : (account.current_balance || 0)
                              )}
                            </div>
                          </button>
                        ))}
                        {ledgerType === 'individual' && (
                          <>
                            <div className="border-t border-input" />
                            <button
                              className="w-full text-left px-3 py-2 hover:bg-primary/10 text-primary text-sm font-medium"
                              onMouseDown={(e) => {
                                e.preventDefault()
                                setNewAccountDialogOpen(true)
                              }}
                            >
                              + Add New Guest Account
                            </button>
                          </>
                        )}
                      </div>
                    )}
                    {ledgerOpen && ledgerSearch.length > 0 && filteredLedgerAccounts.length === 0 && (
                      <div className="absolute top-full left-0 right-0 mt-1 bg-background border border-input rounded-md shadow-lg z-50 p-4 text-sm text-muted-foreground text-center">
                        No {ledgerType === 'individual' ? 'guests' : 'organizations'} found
                      </div>
                    )}
                  </div>
                  {ledgerAccount && (
                    <p className="text-xs text-green-600 font-medium">Account selected: {ledgerSearch}</p>
                  )}
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
    {newAccountDialogOpen && (
      <Dialog open={newAccountDialogOpen} onOpenChange={setNewAccountDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Create New Guest Account</DialogTitle>
            <DialogDescription>
              Add a new guest account to the city ledger with initial balance of 0 (unpaid status).
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="newAccountName">Guest Name *</Label>
              <Input
                id="newAccountName"
                placeholder="Enter guest name"
                value={newAccountName || ''}
                onChange={(e) => setNewAccountName(e.target.value)}
                disabled={newAccountCreating}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="newAccountPhone">Phone Number *</Label>
              <Input
                id="newAccountPhone"
                placeholder="Enter phone number"
                type="tel"
                value={newAccountPhone || ''}
                onChange={(e) => setNewAccountPhone(e.target.value)}
                disabled={newAccountCreating}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="newAccountEmail">Email (Optional)</Label>
              <Input
                id="newAccountEmail"
                placeholder="Enter email address"
                type="email"
                value={newAccountEmail || ''}
                onChange={(e) => setNewAccountEmail(e.target.value)}
                disabled={newAccountCreating}
              />
            </div>
            <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-sm">
              <div className="font-medium text-amber-900">Initial Status: Unpaid (In Debt)</div>
              <div className="text-amber-800">{'Starting balance: \u20A60 (will increase when charges are added)'}</div>
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <Button
              variant="outline"
              onClick={() => setNewAccountDialogOpen(false)}
              disabled={newAccountCreating}
            >
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
    )}
    </>
  )
}
