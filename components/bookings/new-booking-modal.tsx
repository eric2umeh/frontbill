'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Card, CardContent } from '@/components/ui/card'
import { Calendar } from '@/components/ui/calendar'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { format } from 'date-fns'
import { Calendar as CalendarIcon } from 'lucide-react'
import { formatNaira } from '@/lib/utils/currency'
import { toast } from 'sonner'

interface NewBookingModalProps {
  open: boolean
  onClose: () => void
  onSuccess?: () => void
}

export function NewBookingModal({ open, onClose, onSuccess }: NewBookingModalProps) {
  const [step, setStep] = useState(1)
  const [loading, setLoading] = useState(false)
  const [guests, setGuests] = useState<any[]>([])
  const [rooms, setRooms] = useState<any[]>([])
  const [organizationId, setOrganizationId] = useState<string>('')

  // Form data
  const [guestId, setGuestId] = useState('')
  const [guestName, setGuestName] = useState('')
  const [guestPhone, setGuestPhone] = useState('')
  const [roomId, setRoomId] = useState('')
  const [checkInDate, setCheckInDate] = useState<Date>()
  const [checkOutDate, setCheckOutDate] = useState<Date>()
  const [ratePerNight, setRatePerNight] = useState(0)
  const [paymentMethod, setPaymentMethod] = useState('cash')

  // Load organization and data
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

      setGuests(guestData || [])
      setRooms(roomData || [])
    } catch (error: any) {
      toast.error('Failed to load data')
    }
  }

  const handleSelectGuest = (id: string) => {
    const guest = guests.find(g => g.id === id)
    if (guest) {
      setGuestId(id)
      setGuestName(guest.name)
      setGuestPhone(guest.phone)
    }
  }

  const handleCreateNewGuest = async () => {
    if (!guestName || !guestPhone) {
      toast.error('Please enter guest name and phone')
      return
    }

    try {
      const supabase = createClient()
      const { data: newGuest, error } = await supabase
        .from('guests')
        .insert([{
          organization_id: organizationId,
          name: guestName,
          phone: guestPhone,
        }])
        .select()
        .single()

      if (error) throw error
      setGuestId(newGuest.id)
      setGuests([...guests, newGuest])
      toast.success('Guest created')
    } catch (error: any) {
      toast.error('Failed to create guest')
    }
  }

  const handleSelectRoom = (id: string) => {
    const room = rooms.find(r => r.id === id)
    if (room) {
      setRoomId(id)
      setRatePerNight(room.price_per_night)
    }
  }

  const handleSubmit = async () => {
    if (!guestId || !roomId || !checkInDate || !checkOutDate) {
      toast.error('Please fill in all required fields')
      return
    }

    setLoading(true)
    try {
      const supabase = createClient()
      const nights = Math.ceil((checkOutDate.getTime() - checkInDate.getTime()) / (1000 * 60 * 60 * 24))
      const totalAmount = ratePerNight * nights

      // Create booking
      const { error } = await supabase
        .from('bookings')
        .insert([{
          organization_id: organizationId,
          guest_id: guestId,
          room_id: roomId,
          check_in: format(checkInDate, 'yyyy-MM-dd'),
          check_out: format(checkOutDate, 'yyyy-MM-dd'),
          rate_per_night: ratePerNight,
          total_amount: totalAmount,
          payment_status: 'pending',
          status: 'active',
        }])

      if (error) throw error

      toast.success(`Booking created! Total: ${formatNaira(totalAmount)}`)
      resetForm()
      onClose()
      onSuccess?.()
    } catch (error: any) {
      toast.error(error.message || 'Failed to create booking')
    } finally {
      setLoading(false)
    }
  }

  const resetForm = () => {
    setStep(1)
    setGuestId('')
    setGuestName('')
    setGuestPhone('')
    setRoomId('')
    setCheckInDate(undefined)
    setCheckOutDate(undefined)
    setRatePerNight(0)
    setPaymentMethod('cash')
  }

  const handleClose = () => {
    resetForm()
    onClose()
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>New Booking</DialogTitle>
          <DialogDescription>Step {step} of 3</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {step === 1 && (
            <div className="space-y-4">
              <Label>Guest</Label>
              <Select value={guestId} onValueChange={handleSelectGuest}>
                <SelectTrigger>
                  <SelectValue placeholder="Select guest or create new" />
                </SelectTrigger>
                <SelectContent>
                  {guests.map(guest => (
                    <SelectItem key={guest.id} value={guest.id}>
                      {guest.name} - {guest.phone}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <div className="border-t pt-4">
                <Label className="text-sm">Or Create New Guest</Label>
                <div className="space-y-2 mt-2">
                  <Input
                    placeholder="Guest name"
                    value={guestName}
                    onChange={(e) => setGuestName(e.target.value)}
                  />
                  <Input
                    placeholder="Phone"
                    value={guestPhone}
                    onChange={(e) => setGuestPhone(e.target.value)}
                  />
                  <Button onClick={handleCreateNewGuest} variant="outline" className="w-full">
                    Create Guest
                  </Button>
                </div>
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-4">
              <div>
                <Label>Check-in Date</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" className="w-full justify-start">
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {checkInDate ? format(checkInDate, 'PPP') : 'Pick a date'}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0">
                    <Calendar
                      mode="single"
                      selected={checkInDate}
                      onSelect={setCheckInDate}
                      disabled={(date) => date < new Date()}
                    />
                  </PopoverContent>
                </Popover>
              </div>

              <div>
                <Label>Check-out Date</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" className="w-full justify-start">
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {checkOutDate ? format(checkOutDate, 'PPP') : 'Pick a date'}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0">
                    <Calendar
                      mode="single"
                      selected={checkOutDate}
                      onSelect={setCheckOutDate}
                      disabled={(date) => !checkInDate || date <= checkInDate}
                    />
                  </PopoverContent>
                </Popover>
              </div>
            </div>
          )}

          {step === 3 && (
            <div className="space-y-4">
              <Label>Room</Label>
              <Select value={roomId} onValueChange={handleSelectRoom}>
                <SelectTrigger>
                  <SelectValue placeholder="Select room" />
                </SelectTrigger>
                <SelectContent>
                  {rooms.map(room => (
                    <SelectItem key={room.id} value={room.id}>
                      Room {room.room_number} - {room.room_type} ({formatNaira(room.price_per_night)}/night)
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <div>
                <Label>Payment Method</Label>
                <Select value={paymentMethod} onValueChange={setPaymentMethod}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="cash">Cash</SelectItem>
                    <SelectItem value="card">Card</SelectItem>
                    <SelectItem value="transfer">Transfer</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {roomId && checkInDate && checkOutDate && (
                <Card>
                  <CardContent className="pt-4">
                    <div className="space-y-2 text-sm">
                      <div className="flex justify-between">
                        <span>Rate per night:</span>
                        <span>{formatNaira(ratePerNight)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Nights:</span>
                        <span>{Math.ceil((checkOutDate.getTime() - checkInDate.getTime()) / (1000 * 60 * 60 * 24))}</span>
                      </div>
                      <div className="border-t pt-2 flex justify-between font-semibold">
                        <span>Total:</span>
                        <span>{formatNaira(ratePerNight * Math.ceil((checkOutDate.getTime() - checkInDate.getTime()) / (1000 * 60 * 60 * 24)))}</span>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )}
            </div>
          )}
        </div>

        <div className="flex gap-2 justify-between">
          {step > 1 && (
            <Button variant="outline" onClick={() => setStep(step - 1)} disabled={loading}>
              Back
            </Button>
          )}
          {step < 3 && (
            <Button onClick={() => setStep(step + 1)} disabled={loading} className="ml-auto">
              Next
            </Button>
          )}
          {step === 3 && (
            <Button onClick={handleSubmit} disabled={loading} className="ml-auto">
              {loading ? 'Creating...' : 'Create Booking'}
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
