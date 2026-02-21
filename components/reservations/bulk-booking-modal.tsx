'use client'

import { useState } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Calendar } from '@/components/ui/calendar'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Card } from '@/components/ui/card'
import { Calendar as CalendarIcon, Plus, Trash2, Search } from 'lucide-react'
import { format } from 'date-fns'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'

interface BulkBookingModalProps {
  open: boolean
  onClose: () => void
}

interface BulkRoom {
  id: string
  guestName: string
  phone: string
  roomType: string
  roomNumber: string
}

export function BulkBookingModal({ open, onClose }: BulkBookingModalProps) {
  const [organizationSearch, setOrganizationSearch] = useState('')
  const [selectedOrganization, setSelectedOrganization] = useState<any>(null)
  const [bookingType, setBookingType] = useState('organization')
  const [checkIn, setCheckIn] = useState<Date>()
  const [checkOut, setCheckOut] = useState<Date>()
  const [rooms, setRooms] = useState<BulkRoom[]>([
    { id: '1', guestName: '', phone: '', roomType: '', roomNumber: '' }
  ])

  const mockOrganizations = [
    { id: '1', name: 'Federal Ministry of Works', balance: -150000 },
    { id: '2', name: 'Shell Petroleum', balance: 0 },
    { id: '3', name: 'MTN Nigeria', balance: 75000 },
  ]

  const addRoom = () => {
    setRooms([...rooms, {
      id: Date.now().toString(),
      guestName: '',
      phone: '',
      roomType: '',
      roomNumber: ''
    }])
  }

  const removeRoom = (id: string) => {
    if (rooms.length > 1) {
      setRooms(rooms.filter(r => r.id !== id))
    }
  }

  const handleSubmit = () => {
    if (!checkIn || !checkOut) {
      toast.error('Please select check-in and check-out dates')
      return
    }

    const incomplete = rooms.some(r => !r.guestName || !r.roomType)
    if (incomplete) {
      toast.error('Please fill in all guest and room details')
      return
    }

    if (bookingType === 'organization' && !selectedOrganization) {
      toast.error('Please select an organization')
      return
    }

    toast.success(`${rooms.length} rooms booked successfully`)
    onClose()
  }

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Bulk Booking</DialogTitle>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {/* Booking Type */}
          <div className="space-y-2">
            <Label>Booking Type</Label>
            <Select value={bookingType} onValueChange={setBookingType}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="organization">Organization</SelectItem>
                <SelectItem value="individual">Individual Group</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Organization Search (if applicable) */}
          {bookingType === 'organization' && (
            <div className="space-y-2">
              <Label>Organization</Label>
              <div className="flex gap-2">
                <Input
                  placeholder="Search organization..."
                  value={organizationSearch}
                  onChange={(e) => setOrganizationSearch(e.target.value)}
                />
                <Button variant="outline" size="icon">
                  <Search className="h-4 w-4" />
                </Button>
              </div>
              {selectedOrganization && (
                <div className="text-sm text-muted-foreground">
                  Selected: {selectedOrganization.name}
                </div>
              )}
            </div>
          )}

          {/* Check-in and Check-out Dates */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Check-in Date</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className={cn("w-full justify-start text-left font-normal", !checkIn && "text-muted-foreground")}
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {checkIn ? format(checkIn, 'PPP') : 'Select date'}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0">
                  <Calendar mode="single" selected={checkIn} onSelect={setCheckIn} />
                </PopoverContent>
              </Popover>
            </div>

            <div className="space-y-2">
              <Label>Check-out Date</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className={cn("w-full justify-start text-left font-normal", !checkOut && "text-muted-foreground")}
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {checkOut ? format(checkOut, 'PPP') : 'Select date'}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0">
                  <Calendar mode="single" selected={checkOut} onSelect={setCheckOut} />
                </PopoverContent>
              </Popover>
            </div>
          </div>

          {/* Room List */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <Label>Rooms ({rooms.length})</Label>
              <Button variant="outline" size="sm" onClick={addRoom}>
                <Plus className="mr-2 h-4 w-4" />
                Add Room
              </Button>
            </div>

            <div className="space-y-3">
              {rooms.map((room, index) => (
                <Card key={room.id} className="p-4">
                  <div className="flex items-start gap-4">
                    <div className="flex-1 grid grid-cols-2 gap-3">
                      <div>
                        <Label className="text-xs">Guest Name</Label>
                        <Input
                          placeholder="Enter name"
                          value={room.guestName}
                          onChange={(e) => {
                            const updated = [...rooms]
                            updated[index].guestName = e.target.value
                            setRooms(updated)
                          }}
                        />
                      </div>
                      <div>
                        <Label className="text-xs">Phone</Label>
                        <Input
                          placeholder="Enter phone"
                          value={room.phone}
                          onChange={(e) => {
                            const updated = [...rooms]
                            updated[index].phone = e.target.value
                            setRooms(updated)
                          }}
                        />
                      </div>
                      <div>
                        <Label className="text-xs">Room Type</Label>
                        <Select
                          value={room.roomType}
                          onValueChange={(value) => {
                            const updated = [...rooms]
                            updated[index].roomType = value
                            setRooms(updated)
                          }}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Select" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="deluxe">Deluxe</SelectItem>
                            <SelectItem value="royal">Royal Suite</SelectItem>
                            <SelectItem value="executive">Executive</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div>
                        <Label className="text-xs">Room Number</Label>
                        <Input
                          placeholder="e.g., 101"
                          value={room.roomNumber}
                          onChange={(e) => {
                            const updated = [...rooms]
                            updated[index].roomNumber = e.target.value
                            setRooms(updated)
                          }}
                        />
                      </div>
                    </div>
                    {rooms.length > 1 && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="mt-5"
                        onClick={() => removeRoom(room.id)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                </Card>
              ))}
            </div>
          </div>

          {/* Submit */}
          <div className="flex justify-end gap-2 pt-4">
            <Button variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button onClick={handleSubmit}>
              Create {rooms.length} Reservation{rooms.length > 1 ? 's' : ''}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
