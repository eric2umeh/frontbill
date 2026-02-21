'use client'

import { useState, useEffect } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Calendar } from '@/components/ui/calendar'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem } from '@/components/ui/command'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Calendar as CalendarIcon, Search, X, Check, ChevronLeft, ChevronRight } from 'lucide-react'
import { format, addDays, differenceInDays } from 'date-fns'
import { cn } from '@/lib/utils'
import { formatNaira } from '@/lib/utils/currency'
import { toast } from 'sonner'
import { generateEnhancedMockGuests, generateRooms } from '@/lib/mock-data'

const mockGuests = generateEnhancedMockGuests(100)
const mockRooms = generateRooms()
const mockOrganizations = [
  { id: '1', name: 'Federal Ministry of Works', balance: -150000 },
  { id: '2', name: 'Shell Petroleum', balance: 0 },
  { id: '3', name: 'MTN Nigeria', balance: 75000 },
  { id: '4', name: 'Dangote Group', balance: -50000 },
  { id: '5', name: 'Access Bank Plc', balance: 0 },
]

const roomTypes = [
  { value: 'deluxe', label: 'Deluxe', baseRate: 25000 },
  { value: 'royal', label: 'Royal Suite', baseRate: 50000 },
  { value: 'king', label: 'King Suite', baseRate: 45000 },
  { value: 'mini', label: 'Mini Suite', baseRate: 30000 },
  { value: 'executive', label: 'Executive', baseRate: 35000 },
  { value: 'diplomatic', label: 'Diplomatic', baseRate: 40000 },
]

interface NewBookingModalProps {
  open: boolean
  onClose: () => void
}

export function NewBookingModal({ open, onClose }: NewBookingModalProps) {
  const [step, setStep] = useState(1)
  const [filteredGuests, setFilteredGuests] = useState<any[]>([])
  const [selectedGuest, setSelectedGuest] = useState<any>(null)

  // Step 1: Guest Info
  const [fullName, setFullName] = useState('')
  const [address, setAddress] = useState('')
  const [phone, setPhone] = useState('')

  // Step 2: Stay Details
  const [arrivalDate, setArrivalDate] = useState<Date>()
  const [departureDate, setDepartureDate] = useState<Date>()
  const [nights, setNights] = useState(1)

  // Step 3: Room Selection
  const [selectedRoomType, setSelectedRoomType] = useState('')
  const [availableRooms, setAvailableRooms] = useState<any[]>([])
  const [selectedRoom, setSelectedRoom] = useState<any>(null)
  const [roomPrice, setRoomPrice] = useState(0)
  const [paymentMethod, setPaymentMethod] = useState('')
  const [selectedOrganization, setSelectedOrganization] = useState<any>(null)
  const [showOrgSearch, setShowOrgSearch] = useState(false)

  // Handle guest search and auto-populate
  useEffect(() => {
    if (fullName.length > 2) {
      const filtered = mockGuests.filter(g => 
        g.name.toLowerCase().includes(fullName.toLowerCase()) ||
        g.phone.includes(fullName)
      ).slice(0, 5)
      setFilteredGuests(filtered)

      // Auto-populate if exact match found
      const exactMatch = mockGuests.find(g => 
        g.name.toLowerCase() === fullName.toLowerCase()
      )
      if (exactMatch && !selectedGuest) {
        setSelectedGuest(exactMatch)
        setPhone(exactMatch.phone)
        setAddress(exactMatch.email || '')
        setFilteredGuests([])
        toast.success('Guest found in database!')
      }
    } else {
      setFilteredGuests([])
    }
  }, [fullName, selectedGuest])

  // Calculate nights when dates change
  useEffect(() => {
    if (arrivalDate && departureDate) {
      const diff = differenceInDays(departureDate, arrivalDate)
      if (diff > 0) {
        setNights(diff)
      }
    }
  }, [arrivalDate, departureDate])

  // Update departure when nights change
  const handleNightsChange = (value: number) => {
    setNights(value)
    if (arrivalDate) {
      setDepartureDate(addDays(arrivalDate, value))
    }
  }

  // Filter rooms by type
  useEffect(() => {
    if (selectedRoomType) {
      const filtered = mockRooms.filter(r => 
        r.type.toLowerCase().includes(selectedRoomType.toLowerCase()) && 
        r.status === 'available'
      )
      setAvailableRooms(filtered)
      
      // Set default room price
      const typeInfo = roomTypes.find(t => t.value === selectedRoomType)
      if (typeInfo) {
        setRoomPrice(typeInfo.baseRate)
      }
    }
  }, [selectedRoomType])

  const handleSelectGuest = (guest: any) => {
    setSelectedGuest(guest)
    setFullName(guest.name)
    setPhone(guest.phone)
    setAddress(guest.email || '')
    setFilteredGuests([])
  }

  const handleNext = () => {
    if (step === 1) {
      if (!fullName || !phone) {
        toast.error('Please fill in required fields')
        return
      }
    }
    if (step === 2) {
      if (!arrivalDate || !departureDate) {
        toast.error('Please select arrival and departure dates')
        return
      }
    }
    setStep(step + 1)
  }

  const handleBack = () => {
    setStep(step - 1)
  }

  const handleSubmit = () => {
    if (!selectedRoom || !paymentMethod) {
      toast.error('Please select a room and payment method')
      return
    }

    const totalAmount = roomPrice * nights
    const guestBalance = selectedGuest?.balance || 0
    const orgBalance = selectedOrganization?.balance || 0
    const applicableBalance = paymentMethod === 'city_ledger' 
      ? (selectedOrganization ? orgBalance : guestBalance)
      : 0

    toast.success(`Booking created! Total: ${formatNaira(totalAmount)}${applicableBalance !== 0 ? `, Balance applied: ${formatNaira(applicableBalance)}` : ''}`)
    onClose()
    resetForm()
  }

  const resetForm = () => {
    setStep(1)
    setSelectedGuest(null)
    setFullName('')
    setAddress('')
    setPhone('')
    setFilteredGuests([])
    setArrivalDate(undefined)
    setDepartureDate(undefined)
    setNights(1)
    setSelectedRoomType('')
    setSelectedRoom(null)
    setRoomPrice(0)
    setPaymentMethod('')
    setSelectedOrganization(null)
    setShowOrgSearch(false)
  }

  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && onClose()}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>New Booking - Step {step} of 3</DialogTitle>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {/* Step 1: Guest Info */}
          {step === 1 && (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="fullName">Full Name *</Label>
                <div className="relative">
                  <Input
                    id="fullName"
                    value={fullName}
                    onChange={(e) => {
                      setFullName(e.target.value)
                      setSelectedGuest(null)
                    }}
                    placeholder="Type guest name or phone to search..."
                    className="pr-8"
                  />
                  <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                </div>
                {filteredGuests.length > 0 && (
                  <Card className="mt-1 absolute z-10 w-full">
                    <CardContent className="p-2">
                      {filteredGuests.map((guest) => (
                        <div
                          key={guest.name}
                          className="p-2 hover:bg-accent rounded cursor-pointer"
                          onClick={() => handleSelectGuest(guest)}
                        >
                          <div className="font-medium">{guest.name}</div>
                          <div className="text-sm text-muted-foreground">{guest.phone}</div>
                        </div>
                      ))}
                    </CardContent>
                  </Card>
                )}
                {selectedGuest && (
                  <p className="text-sm text-green-600 flex items-center gap-1">
                    <Check className="h-3 w-3" /> Guest found in database
                  </p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="address">Address</Label>
                <Input
                  id="address"
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  placeholder="Enter address"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="phone">Phone Number *</Label>
                <Input
                  id="phone"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="Enter phone number"
                />
              </div>

              {selectedGuest && selectedGuest.balance !== 0 && (
                <Card className="bg-muted">
                  <CardContent className="p-3">
                    <div className="text-sm">
                      <span className="text-muted-foreground">Guest Balance: </span>
                      <span className={`font-semibold ${selectedGuest.balance < 0 ? 'text-destructive' : 'text-green-600'}`}>
                        {formatNaira(Math.abs(selectedGuest.balance))} {selectedGuest.balance < 0 ? '(Debt)' : '(Credit)'}
                      </span>
                    </div>
                  </CardContent>
                </Card>
              )}
            </div>
          )}

          {/* Step 2: Stay Details */}
          {step === 2 && (
            <div className="space-y-4">
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label>Arrival Date *</Label>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        className={cn('w-full justify-start text-left font-normal', !arrivalDate && 'text-muted-foreground')}
                      >
                        <CalendarIcon className="mr-2 h-4 w-4" />
                        {arrivalDate ? format(arrivalDate, 'PPP') : 'Pick a date'}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0">
                      <Calendar
                        mode="single"
                        selected={arrivalDate}
                        onSelect={setArrivalDate}
                        initialFocus
                      />
                    </PopoverContent>
                  </Popover>
                </div>

                <div className="space-y-2">
                  <Label>Departure Date *</Label>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        className={cn('w-full justify-start text-left font-normal', !departureDate && 'text-muted-foreground')}
                      >
                        <CalendarIcon className="mr-2 h-4 w-4" />
                        {departureDate ? format(departureDate, 'PPP') : 'Pick a date'}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0">
                      <Calendar
                        mode="single"
                        selected={departureDate}
                        onSelect={setDepartureDate}
                        initialFocus
                        disabled={(date) => arrivalDate ? date <= arrivalDate : false}
                      />
                    </PopoverContent>
                  </Popover>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="nights">Number of Nights</Label>
                <Input
                  id="nights"
                  type="number"
                  min="1"
                  value={nights}
                  onChange={(e) => handleNightsChange(parseInt(e.target.value) || 1)}
                />
              </div>
            </div>
          )}

          {/* Step 3: Room Selection */}
          {step === 3 && (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Room Type *</Label>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                  {roomTypes.map((type) => (
                    <Button
                      key={type.value}
                      variant={selectedRoomType === type.value ? 'default' : 'outline'}
                      onClick={() => setSelectedRoomType(type.value)}
                      className="h-auto py-3"
                    >
                      <div className="text-center">
                        <div className="font-medium">{type.label}</div>
                        <div className="text-xs">{formatNaira(type.baseRate)}/night</div>
                      </div>
                    </Button>
                  ))}
                </div>
              </div>

              {selectedRoomType && (
                <>
                  <div className="space-y-2">
                    <Label>Room Price (Editable)</Label>
                    <Input
                      type="number"
                      value={roomPrice}
                      onChange={(e) => setRoomPrice(parseInt(e.target.value) || 0)}
                    />
                    <p className="text-sm text-muted-foreground">
                      Total: {formatNaira(roomPrice * nights)} ({nights} night{nights > 1 ? 's' : ''})
                    </p>
                  </div>

                  <div className="space-y-2">
                    <Label>Available Rooms ({availableRooms.length})</Label>
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-2 max-h-60 overflow-y-auto">
                      {availableRooms.map((room) => (
                        <Card
                          key={room.id}
                          className={cn(
                            'cursor-pointer transition-all',
                            selectedRoom?.id === room.id && 'ring-2 ring-primary'
                          )}
                          onClick={() => setSelectedRoom(room)}
                        >
                          <CardContent className="p-3">
                            <div className="font-semibold">Room {room.number}</div>
                            <div className="text-sm text-muted-foreground">Floor {room.floor}</div>
                            <div className="text-sm font-medium mt-1">{formatNaira(room.rate)}</div>
                          </CardContent>
                        </Card>
                      ))}
                    </div>
                  </div>

                  {selectedRoom && (
                    <>
                      <div className="space-y-2">
                        <Label>Payment Method *</Label>
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                          {['cash', 'pos', 'transfer', 'city_ledger'].map((method) => (
                            <Button
                              key={method}
                              variant={paymentMethod === method ? 'default' : 'outline'}
                              onClick={() => {
                                setPaymentMethod(method)
                                if (method !== 'city_ledger') {
                                  setShowOrgSearch(false)
                                  setSelectedOrganization(null)
                                }
                              }}
                            >
                              {method.replace('_', ' ').toUpperCase()}
                            </Button>
                          ))}
                        </div>
                      </div>

                      {paymentMethod === 'city_ledger' && (
                        <div className="space-y-3">
                          <Card className="bg-muted">
                            <CardContent className="p-3">
                              <div className="flex items-center justify-between">
                                <div>
                                  <div className="text-sm font-medium">{fullName}</div>
                                  <div className="text-sm text-muted-foreground">
                                    Balance: {formatNaira(selectedGuest?.balance || 0)}
                                  </div>
                                </div>
                                {!showOrgSearch && (
                                  <Badge variant="outline">Selected</Badge>
                                )}
                              </div>
                            </CardContent>
                          </Card>

                          <div className="flex items-center gap-2">
                            <div className="h-px flex-1 bg-border" />
                            <span className="text-xs text-muted-foreground">OR</span>
                            <div className="h-px flex-1 bg-border" />
                          </div>

                          <div>
                            <Button
                              variant="outline"
                              className="w-full"
                              onClick={() => setShowOrgSearch(!showOrgSearch)}
                            >
                              <Search className="mr-2 h-4 w-4" />
                              {showOrgSearch ? 'Hide' : 'Search'} Organization
                            </Button>

                            {showOrgSearch && (
                              <Card className="mt-2">
                                <CardContent className="p-2">
                                  <Command>
                                    <CommandInput placeholder="Search organization..." />
                                    <CommandEmpty>No organization found.</CommandEmpty>
                                    <CommandGroup>
                                      {mockOrganizations.map((org) => (
                                        <CommandItem
                                          key={org.id}
                                          onSelect={() => {
                                            setSelectedOrganization(org)
                                            setShowOrgSearch(false)
                                          }}
                                        >
                                          <div className="flex-1">
                                            <div className="font-medium">{org.name}</div>
                                            <div className="text-sm text-muted-foreground">
                                              Balance: {formatNaira(org.balance)}
                                            </div>
                                          </div>
                                          <Check className={cn('ml-2 h-4 w-4', selectedOrganization?.id === org.id ? 'opacity-100' : 'opacity-0')} />
                                        </CommandItem>
                                      ))}
                                    </CommandGroup>
                                  </Command>
                                </CardContent>
                              </Card>
                            )}

                            {selectedOrganization && (
                              <Card className="mt-2 bg-primary/10 border-primary">
                                <CardContent className="p-3">
                                  <div className="flex items-center justify-between">
                                    <div>
                                      <div className="text-sm font-medium">{selectedOrganization.name}</div>
                                      <div className="text-sm text-muted-foreground">
                                        Balance: {formatNaira(selectedOrganization.balance)}
                                      </div>
                                    </div>
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      onClick={() => setSelectedOrganization(null)}
                                    >
                                      <X className="h-4 w-4" />
                                    </Button>
                                  </div>
                                </CardContent>
                              </Card>
                            )}
                          </div>
                        </div>
                      )}
                    </>
                  )}
                </>
              )}
            </div>
          )}

          {/* Navigation Buttons */}
          <div className="flex justify-between pt-4 border-t">
            <Button variant="outline" onClick={step === 1 ? onClose : handleBack}>
              {step === 1 ? (
                'Cancel'
              ) : (
                <>
                  <ChevronLeft className="mr-2 h-4 w-4" />
                  Back
                </>
              )}
            </Button>
            {step < 3 ? (
              <Button onClick={handleNext}>
                Next
                <ChevronRight className="ml-2 h-4 w-4" />
              </Button>
            ) : (
              <Button onClick={handleSubmit}>
                Create Booking
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
