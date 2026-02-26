'use client'

import { useState, useEffect, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Calendar } from '@/components/ui/calendar'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Calendar as CalendarIcon, Plus, Trash2, Search, Loader2, Users, Building2 } from 'lucide-react'
import { format, differenceInDays } from 'date-fns'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'
import { formatNaira } from '@/lib/utils/currency'

const ROOM_TYPES = [
  'Deluxe', 'Royal', 'Kings', 'Mini Suite', 'Executive Suite', 'Diplomatic Suite',
]

interface BulkBookingModalProps {
  open: boolean
  onClose: () => void
}

interface BulkRoom {
  id: string
  guestName: string
  guestId: string | null
  phone: string
  roomType: string
  roomNumber: string
  numberOfRooms: number
  // guest search state
  guestSearch: string
  guestSearchOpen: boolean
  filteredGuests: any[]
}

const makeBulkRoom = (): BulkRoom => ({
  id: Date.now().toString() + Math.random(),
  guestName: '',
  guestId: null,
  phone: '',
  roomType: '',
  roomNumber: '',
  numberOfRooms: 1,
  guestSearch: '',
  guestSearchOpen: false,
  filteredGuests: [],
})

const toLocalDateStr = (date: Date) => {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

export function BulkBookingModal({ open, onClose }: BulkBookingModalProps) {
  const [bookingType, setBookingType] = useState<'organization' | 'individual'>('organization')

  // Organization search
  const [orgSearch, setOrgSearch] = useState('')
  const [orgResults, setOrgResults] = useState<any[]>([])
  const [orgSearching, setOrgSearching] = useState(false)
  const [selectedOrg, setSelectedOrg] = useState<any>(null)
  const [orgSearchOpen, setOrgSearchOpen] = useState(false)

  // Guest (individual group leader) search
  const [groupGuestSearch, setGroupGuestSearch] = useState('')
  const [groupGuestResults, setGroupGuestResults] = useState<any[]>([])
  const [groupGuestSearchOpen, setGroupGuestSearchOpen] = useState(false)
  const [selectedGroupGuest, setSelectedGroupGuest] = useState<any>(null)

  const [checkIn, setCheckIn] = useState<Date>()
  const [checkOut, setCheckOut] = useState<Date>()
  const [rooms, setRooms] = useState<BulkRoom[]>([makeBulkRoom()])
  const [loading, setLoading] = useState(false)
  const [orgId, setOrgId] = useState<string>('')

  // All guests cache for per-room individual search
  const [allGuests, setAllGuests] = useState<any[]>([])

  useEffect(() => {
    if (open) {
      fetchOrgId()
      fetchAllGuests()
    }
  }, [open])

  const fetchOrgId = async () => {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    const { data: profile } = await supabase.from('profiles').select('organization_id').eq('id', user.id).single()
    if (profile) setOrgId(profile.organization_id)
  }

  const fetchAllGuests = async () => {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    const { data: profile } = await supabase.from('profiles').select('organization_id').eq('id', user.id).single()
    if (!profile) return
    const { data } = await supabase.from('guests').select('id, name, phone, email').eq('organization_id', profile.organization_id).order('name')
    setAllGuests(data || [])
  }

  // Organization search from DB
  const searchOrgs = async (term: string) => {
    setOrgSearch(term)
    if (!term.trim()) { setOrgResults([]); setOrgSearchOpen(false); return }
    setOrgSearching(true)
    try {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      const { data: profile } = await supabase.from('profiles').select('organization_id').eq('id', user.id).single()
      if (!profile) return
      // Search from the organizations table (city_ledger_accounts with account_type=organization)
      const { data } = await supabase
        .from('city_ledger_accounts')
        .select('id, account_name, account_type, contact_phone, balance')
        .eq('organization_id', profile.organization_id)
        .eq('account_type', 'organization')
        .ilike('account_name', `%${term}%`)
        .limit(8)
      setOrgResults(data || [])
      setOrgSearchOpen(true)
    } finally {
      setOrgSearching(false)
    }
  }

  // Group guest search
  const searchGroupGuest = (term: string) => {
    setGroupGuestSearch(term)
    if (!term.trim()) { setGroupGuestResults([]); setGroupGuestSearchOpen(false); return }
    const filtered = allGuests.filter(g => g.name.toLowerCase().includes(term.toLowerCase()) || (g.phone || '').includes(term))
    setGroupGuestResults(filtered.slice(0, 8))
    setGroupGuestSearchOpen(filtered.length > 0)
  }

  // Per-room guest search
  const handleRoomGuestSearch = (index: number, term: string) => {
    const updated = [...rooms]
    updated[index].guestSearch = term
    updated[index].guestName = term
    updated[index].guestId = null
    if (term.trim()) {
      const filtered = allGuests.filter(g =>
        g.name.toLowerCase().includes(term.toLowerCase()) || (g.phone || '').includes(term)
      )
      updated[index].filteredGuests = filtered.slice(0, 6)
      updated[index].guestSearchOpen = filtered.length > 0
    } else {
      updated[index].filteredGuests = []
      updated[index].guestSearchOpen = false
    }
    setRooms(updated)
  }

  const selectRoomGuest = (index: number, guest: any) => {
    const updated = [...rooms]
    updated[index].guestName = guest.name
    updated[index].guestId = guest.id
    updated[index].phone = guest.phone || ''
    updated[index].guestSearch = guest.name
    updated[index].guestSearchOpen = false
    updated[index].filteredGuests = []
    setRooms(updated)
  }

  const addRoom = () => setRooms([...rooms, makeBulkRoom()])
  const removeRoom = (id: string) => { if (rooms.length > 1) setRooms(rooms.filter(r => r.id !== id)) }

  const handleSubmit = async () => {
    if (!checkIn || !checkOut) { toast.error('Please select check-in and check-out dates'); return }
    const nights = differenceInDays(checkOut, checkIn)
    if (nights <= 0) { toast.error('Check-out must be after check-in'); return }

    if (bookingType === 'organization' && !selectedOrg) { toast.error('Please select an organization'); return }
    if (bookingType === 'individual' && !selectedGroupGuest) { toast.error('Please select a group contact guest'); return }

    const incomplete = rooms.some(r => !r.guestName.trim() || !r.roomType)
    if (incomplete) { toast.error('Fill in guest name and room type for all rooms'); return }

    setLoading(true)
    try {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error('Not authenticated')

      // Get available rooms by type
      const roomTypesNeeded = rooms.reduce<Record<string, number>>((acc, r) => {
        acc[r.roomType] = (acc[r.roomType] || 0) + (r.numberOfRooms || 1)
        return acc
      }, {})

      let createdCount = 0
      for (const roomEntry of rooms) {
        // Find an available room of that type
        const { data: availableRooms } = await supabase
          .from('rooms')
          .select('id, room_number, price_per_night')
          .eq('organization_id', orgId)
          .eq('room_type', roomEntry.roomType)
          .eq('status', 'available')
          .limit(roomEntry.numberOfRooms || 1)

        if (!availableRooms || availableRooms.length === 0) {
          toast.error(`No available ${roomEntry.roomType} rooms`)
          continue
        }

        // Find or create guest
        let finalGuestId = roomEntry.guestId
        if (!finalGuestId) {
          const { data: newGuest, error: ge } = await supabase
            .from('guests')
            .insert([{ organization_id: orgId, name: roomEntry.guestName, phone: roomEntry.phone || null }])
            .select().single()
          if (ge) throw ge
          finalGuestId = newGuest.id
        }

        for (const availRoom of availableRooms) {
          const total = availRoom.price_per_night * nights
          const folioId = `FOL-${Date.now().toString(36).toUpperCase()}`

          const { data: booking, error: be } = await supabase.from('bookings').insert([{
            organization_id: orgId,
            guest_id: finalGuestId,
            room_id: availRoom.id,
            folio_id: folioId,
            check_in: toLocalDateStr(checkIn),
            check_out: toLocalDateStr(checkOut),
            number_of_nights: nights,
            rate_per_night: availRoom.price_per_night,
            total_amount: total,
            deposit: 0,
            balance: total,
            payment_status: 'pending',
            status: 'reserved',
            created_by: user.id,
          }]).select().single()

          if (be) throw be

          await supabase.from('rooms').update({ status: 'reserved' }).eq('id', availRoom.id)

          await supabase.from('transactions').insert([{
            organization_id: orgId,
            booking_id: booking.id,
            transaction_id: `TXN-${Date.now().toString(36).toUpperCase()}`,
            guest_name: roomEntry.guestName,
            room: availRoom.room_number,
            amount: total,
            payment_method: bookingType === 'organization' ? 'city_ledger' : 'pending',
            status: 'pending',
            description: `Bulk reservation - ${bookingType === 'organization' ? selectedOrg?.account_name : selectedGroupGuest?.name}`,
            received_by: user.id,
          }])

          createdCount++
        }
      }

      toast.success(`${createdCount} reservation(s) created successfully`)
      handleClose()
    } catch (err: any) {
      toast.error(err.message || 'Failed to create reservations')
    } finally {
      setLoading(false)
    }
  }

  const handleClose = () => {
    setBookingType('organization')
    setOrgSearch(''); setOrgResults([]); setSelectedOrg(null); setOrgSearchOpen(false)
    setGroupGuestSearch(''); setGroupGuestResults([]); setSelectedGroupGuest(null); setGroupGuestSearchOpen(false)
    setCheckIn(undefined); setCheckOut(undefined)
    setRooms([makeBulkRoom()])
    onClose()
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Bulk Booking / Reservation</DialogTitle>
          <DialogDescription>Reserve multiple rooms for an organization or group</DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-2">
          {/* Booking Type */}
          <div className="space-y-2">
            <Label>Booking Type</Label>
            <Select value={bookingType} onValueChange={(v: any) => setBookingType(v)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="organization">
                  <div className="flex items-center gap-2"><Building2 className="h-4 w-4" /> Organization</div>
                </SelectItem>
                <SelectItem value="individual">
                  <div className="flex items-center gap-2"><Users className="h-4 w-4" /> Individual Group</div>
                </SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Organization search from DB */}
          {bookingType === 'organization' && (
            <div className="space-y-2">
              <Label>Organization *</Label>
              <div className="relative">
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <Input
                      placeholder="Search organization from database..."
                      value={orgSearch}
                      onChange={(e) => searchOrgs(e.target.value)}
                      onFocus={() => orgResults.length > 0 && setOrgSearchOpen(true)}
                      onBlur={() => setTimeout(() => setOrgSearchOpen(false), 150)}
                    />
                    {orgSearching && <Loader2 className="absolute right-3 top-3 h-4 w-4 animate-spin text-muted-foreground" />}
                    {orgSearchOpen && orgResults.length > 0 && (
                      <div className="absolute top-full left-0 right-0 mt-1 bg-background border rounded-md shadow-lg z-50 max-h-48 overflow-y-auto">
                        {orgResults.map(org => (
                          <button
                            key={org.id}
                            className="w-full text-left px-4 py-2 hover:bg-accent border-b last:border-b-0 text-sm"
                            onMouseDown={(e) => { e.preventDefault(); setSelectedOrg(org); setOrgSearch(org.account_name); setOrgSearchOpen(false) }}
                          >
                            <div className="font-medium">{org.account_name}</div>
                            <div className="text-xs text-muted-foreground">{org.contact_phone}</div>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
                {selectedOrg && (
                  <div className="flex items-center gap-2 mt-2 p-2 rounded border bg-muted/40 text-sm">
                    <Building2 className="h-4 w-4 text-muted-foreground" />
                    <span className="font-medium">{selectedOrg.account_name}</span>
                    {selectedOrg.contact_phone && <span className="text-muted-foreground">· {selectedOrg.contact_phone}</span>}
                    <button className="ml-auto text-xs text-destructive" onClick={() => { setSelectedOrg(null); setOrgSearch('') }}>Remove</button>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Individual group contact search */}
          {bookingType === 'individual' && (
            <div className="space-y-2">
              <Label>Group Contact (Guest) *</Label>
              <div className="relative">
                <Input
                  placeholder="Search guest from database..."
                  value={groupGuestSearch}
                  onChange={(e) => searchGroupGuest(e.target.value)}
                  onBlur={() => setTimeout(() => setGroupGuestSearchOpen(false), 150)}
                />
                {groupGuestSearchOpen && groupGuestResults.length > 0 && (
                  <div className="absolute top-full left-0 right-0 mt-1 bg-background border rounded-md shadow-lg z-50 max-h-48 overflow-y-auto">
                    {groupGuestResults.map(g => (
                      <button
                        key={g.id}
                        className="w-full text-left px-4 py-2 hover:bg-accent border-b last:border-b-0 text-sm"
                        onMouseDown={(e) => { e.preventDefault(); setSelectedGroupGuest(g); setGroupGuestSearch(g.name); setGroupGuestSearchOpen(false) }}
                      >
                        <div className="font-medium">{g.name}</div>
                        <div className="text-xs text-muted-foreground">{g.phone}</div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
              {selectedGroupGuest && (
                <div className="flex items-center gap-2 p-2 rounded border bg-muted/40 text-sm">
                  <Users className="h-4 w-4 text-muted-foreground" />
                  <span className="font-medium">{selectedGroupGuest.name}</span>
                  <span className="text-muted-foreground">· {selectedGroupGuest.phone}</span>
                  <button className="ml-auto text-xs text-destructive" onClick={() => { setSelectedGroupGuest(null); setGroupGuestSearch('') }}>Remove</button>
                </div>
              )}
            </div>
          )}

          {/* Dates */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Check-in Date *</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" className={cn('w-full justify-start text-left font-normal', !checkIn && 'text-muted-foreground')}>
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {checkIn ? format(checkIn, 'dd MMM yyyy') : 'Select date'}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0">
                  <Calendar mode="single" selected={checkIn} onSelect={setCheckIn} initialFocus />
                </PopoverContent>
              </Popover>
            </div>
            <div className="space-y-2">
              <Label>Check-out Date *</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" className={cn('w-full justify-start text-left font-normal', !checkOut && 'text-muted-foreground')}>
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {checkOut ? format(checkOut, 'dd MMM yyyy') : 'Select date'}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0">
                  <Calendar mode="single" selected={checkOut} onSelect={setCheckOut} disabled={(d) => checkIn ? d <= checkIn : false} initialFocus />
                </PopoverContent>
              </Popover>
            </div>
          </div>
          {checkIn && checkOut && (
            <p className="text-sm text-muted-foreground -mt-2">
              {differenceInDays(checkOut, checkIn)} night(s)
            </p>
          )}

          {/* Room entries */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label>Rooms ({rooms.length})</Label>
              <Button variant="outline" size="sm" onClick={addRoom}>
                <Plus className="mr-2 h-4 w-4" /> Add Room Entry
              </Button>
            </div>

            {rooms.map((room, index) => (
              <Card key={room.id} className="p-4">
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-muted-foreground">Entry #{index + 1}</span>
                    {rooms.length > 1 && (
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => removeRoom(room.id)}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    {/* Guest name with search */}
                    <div className="col-span-2 space-y-1 relative">
                      <Label className="text-xs">Guest Name *</Label>
                      <Input
                        placeholder="Type to search existing guest or enter new name"
                        value={room.guestName}
                        onChange={(e) => handleRoomGuestSearch(index, e.target.value)}
                        onBlur={() => setTimeout(() => {
                          const updated = [...rooms]
                          updated[index].guestSearchOpen = false
                          setRooms(updated)
                        }, 150)}
                      />
                      {room.guestSearchOpen && room.filteredGuests.length > 0 && (
                        <div className="absolute top-full left-0 right-0 mt-1 bg-background border rounded-md shadow-lg z-50 max-h-40 overflow-y-auto">
                          {room.filteredGuests.map(g => (
                            <button
                              key={g.id}
                              className="w-full text-left px-3 py-2 hover:bg-accent border-b last:border-b-0 text-sm"
                              onMouseDown={(e) => { e.preventDefault(); selectRoomGuest(index, g) }}
                            >
                              <div className="font-medium">{g.name}</div>
                              <div className="text-xs text-muted-foreground">{g.phone}</div>
                            </button>
                          ))}
                        </div>
                      )}
                      {room.guestId && <p className="text-xs text-green-600">Existing guest selected</p>}
                      {!room.guestId && room.guestName.trim() && <p className="text-xs text-amber-600">New guest will be created</p>}
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Phone</Label>
                      <Input
                        placeholder="Phone number"
                        value={room.phone}
                        disabled={!!room.guestId}
                        onChange={(e) => {
                          const updated = [...rooms]
                          updated[index].phone = e.target.value
                          setRooms(updated)
                        }}
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Room Type *</Label>
                      <Select value={room.roomType} onValueChange={(val) => {
                        const updated = [...rooms]
                        updated[index].roomType = val
                        setRooms(updated)
                      }}>
                        <SelectTrigger>
                          <SelectValue placeholder="Select type" />
                        </SelectTrigger>
                        <SelectContent>
                          {ROOM_TYPES.map(rt => (
                            <SelectItem key={rt} value={rt}>{rt}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Number of Rooms</Label>
                      <Input
                        type="number"
                        min={1}
                        max={50}
                        value={room.numberOfRooms}
                        onChange={(e) => {
                          const updated = [...rooms]
                          updated[index].numberOfRooms = Math.max(1, parseInt(e.target.value) || 1)
                          setRooms(updated)
                        }}
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Specific Room No. (optional)</Label>
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
                </div>
              </Card>
            ))}
          </div>

          {/* Summary */}
          <div className="flex items-center justify-between p-3 rounded-lg bg-muted/40 border text-sm">
            <span className="text-muted-foreground">Total room entries:</span>
            <span className="font-semibold">{rooms.reduce((s, r) => s + (r.numberOfRooms || 1), 0)} room(s)</span>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={handleClose} disabled={loading}>Cancel</Button>
            <Button onClick={handleSubmit} disabled={loading}>
              {loading ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Creating...</> : `Create Reservations`}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
