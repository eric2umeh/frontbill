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
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { Calendar as CalendarIcon, Plus, Trash2, Loader2, Users, Building2, ChevronLeft, ChevronRight, X } from 'lucide-react'
import { format, differenceInDays } from 'date-fns'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'
import { formatNaira } from '@/lib/utils/currency'

const ROOM_TYPES = ['Deluxe', 'Royal', 'Kings', 'Mini Suite', 'Executive Suite', 'Diplomatic Suite']

const toLocalDateStr = (date: Date) => {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

const todayDate = () => { const d = new Date(); d.setHours(0, 0, 0, 0); return d }

interface RoomEntry {
  id: string
  guestName: string
  guestId: string | null
  phone: string
  roomType: string
  numberOfRooms: number
  guestSearch: string
  guestSearchOpen: boolean
  filteredGuests: any[]
}
const makeEntry = (): RoomEntry => ({
  id: Date.now().toString() + Math.random(),
  guestName: '', guestId: null, phone: '',
  roomType: '', numberOfRooms: 1,
  guestSearch: '', guestSearchOpen: false, filteredGuests: [],
})

interface BulkBookingModalProps { open: boolean; onClose: () => void; onSuccess?: () => void }

export function BulkBookingModal({ open, onClose, onSuccess }: BulkBookingModalProps) {
  const [step, setStep] = useState(1)
  const [loading, setLoading] = useState(false)
  const [orgId, setOrgId] = useState('')
  const [currentUserId, setCurrentUserId] = useState('')
  const [allGuests, setAllGuests] = useState<any[]>([])
  const [availableRooms, setAvailableRooms] = useState<any[]>([])
  const [roomAvailabilityChecked, setRoomAvailabilityChecked] = useState(false)

  // Step 1: Booking type + contact
  const [bookingType, setBookingType] = useState<'organization' | 'individual'>('organization')

  // Organization search — from organizations table
  const [orgSearch, setOrgSearch] = useState('')
  const [orgResults, setOrgResults] = useState<any[]>([])
  const [orgSearching, setOrgSearching] = useState(false)
  const [selectedOrg, setSelectedOrg] = useState<any>(null)
  const [orgSearchOpen, setOrgSearchOpen] = useState(false)
  const [showNewOrgForm, setShowNewOrgForm] = useState(false)
  // Inline new org form fields
  const [newOrgName, setNewOrgName] = useState('')
  const [newOrgType, setNewOrgType] = useState('')
  const [newOrgContact, setNewOrgContact] = useState('')
  const [newOrgPhone, setNewOrgPhone] = useState('')
  const [newOrgEmail, setNewOrgEmail] = useState('')
  const [newOrgAddress, setNewOrgAddress] = useState('')
  const [creatingOrg, setCreatingOrg] = useState(false)

  // Individual group contact
  const [groupGuestSearch, setGroupGuestSearch] = useState('')
  const [groupGuestResults, setGroupGuestResults] = useState<any[]>([])
  const [groupGuestSearchOpen, setGroupGuestSearchOpen] = useState(false)
  const [selectedGroupGuest, setSelectedGroupGuest] = useState<any>(null)

  // Step 2: Dates
  const [checkIn, setCheckIn] = useState<Date>()
  const [checkOut, setCheckOut] = useState<Date>()

  // Step 3: Payment
  const [paymentMethod, setPaymentMethod] = useState<'cash' | 'pos' | 'card' | 'bank_transfer' | 'city_ledger'>('cash')
  const [paymentStatus, setPaymentStatus] = useState<'paid' | 'partial' | 'unpaid'>('unpaid')
  const [partialAmount, setPartialAmount] = useState<number | ''>('')
  // City ledger
  const [ledgerType, setLedgerType] = useState<'individual' | 'organization'>('organization')
  const [ledgerSearch, setLedgerSearch] = useState('')
  const [ledgerResults, setLedgerResults] = useState<any[]>([])
  const [ledgerSearchOpen, setLedgerSearchOpen] = useState(false)
  const [selectedLedger, setSelectedLedger] = useState<any>(null)
  const [showNewLedgerOrgForm, setShowNewLedgerOrgForm] = useState(false)
  const [newLedgerOrgName, setNewLedgerOrgName] = useState('')
  const [newLedgerOrgEmail, setNewLedgerOrgEmail] = useState('')
  const [newLedgerOrgPhone, setNewLedgerOrgPhone] = useState('')
  const [creatingLedgerOrg, setCreatingLedgerOrg] = useState(false)

  // Step 3 Room entries
  const [entries, setEntries] = useState<RoomEntry[]>([makeEntry()])
  const [quickRoomCount, setQuickRoomCount] = useState<number | ''>('')
  const [quickRoomType, setQuickRoomType] = useState('')
  const [fillLater, setFillLater] = useState(false)
  const [totalRoomsCount, setTotalRoomsCount] = useState<number | ''>('')

  const nights = checkIn && checkOut ? differenceInDays(checkOut, checkIn) : 0

  useEffect(() => { if (open) fetchBootstrap(); else handleClose() }, [open])

  const fetchBootstrap = async () => {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    setCurrentUserId(user.id)
    const { data: profile } = await supabase.from('profiles').select('organization_id').eq('id', user.id).single()
    if (!profile) return
    setOrgId(profile.organization_id)
    const { data: guestData } = await supabase.from('guests').select('id, name, phone, email').eq('organization_id', profile.organization_id).order('name')
    setAllGuests(guestData || [])
  }

  // Search organizations from organizations table (not city_ledger_accounts)
  const searchOrgs = async (term: string) => {
    setOrgSearch(term)
    setSelectedOrg(null)
    if (!term.trim()) { setOrgResults([]); setOrgSearchOpen(false); return }
    setOrgSearching(true)
    try {
      const supabase = createClient()
      const { data } = await supabase
        .from('organizations')
        .select('id, name, email, phone, address')
        .ilike('name', `%${term}%`)
        .limit(8)
      setOrgResults(data || [])
      setOrgSearchOpen((data || []).length > 0)
      if (!data || data.length === 0) setShowNewOrgForm(false)
    } finally {
      setOrgSearching(false)
    }
  }

  const createNewOrg = async () => {
    if (!newOrgName.trim()) { toast.error('Organization name required'); return }
    if (!newOrgPhone.trim() && !newOrgEmail.trim()) { toast.error('Phone or email required'); return }
    setCreatingOrg(true)
    try {
      const supabase = createClient()
      const { data, error } = await supabase.from('organizations').insert([{
        name: newOrgName.trim(),
        email: newOrgEmail.trim() || null,
        phone: newOrgPhone.trim() || null,
        address: newOrgAddress.trim() || null,
      }]).select().single()
      if (error) throw error
      setSelectedOrg(data)
      setOrgSearch(data.name)
      setShowNewOrgForm(false)
      setNewOrgName(''); setNewOrgType(''); setNewOrgContact(''); setNewOrgPhone(''); setNewOrgEmail(''); setNewOrgAddress('')
      toast.success(`Organization "${data.name}" created`)
    } catch (err: any) {
      toast.error(err.message || 'Failed to create organization')
    } finally {
      setCreatingOrg(false)
    }
  }

  const createNewLedgerOrg = async () => {
    if (!newLedgerOrgName.trim()) { toast.error('Organization name required'); return }
    setCreatingLedgerOrg(true)
    try {
      const supabase = createClient()
      const { data, error } = await supabase.from('organizations').insert([{
        name: newLedgerOrgName.trim(),
        email: newLedgerOrgEmail.trim() || null,
        phone: newLedgerOrgPhone.trim() || null,
      }]).select().single()
      if (error) throw error
      setSelectedLedger({ id: data.id, name: data.name, phone: data.phone, source: 'organizations' })
      setLedgerSearch(data.name)
      setShowNewLedgerOrgForm(false)
      setNewLedgerOrgName(''); setNewLedgerOrgEmail(''); setNewLedgerOrgPhone('')
      toast.success(`Organization "${data.name}" created and selected`)
    } catch (err: any) {
      toast.error(err.message || 'Failed to create organization')
    } finally {
      setCreatingLedgerOrg(false)
    }
  }

  // Individual contact search from guests table
  const searchGroupGuest = (term: string) => {
    setGroupGuestSearch(term)
    setSelectedGroupGuest(null)
    if (!term.trim()) { setGroupGuestResults([]); setGroupGuestSearchOpen(false); return }
    const filtered = allGuests.filter(g => g.name.toLowerCase().includes(term.toLowerCase()) || (g.phone || '').includes(term))
    setGroupGuestResults(filtered.slice(0, 8))
    setGroupGuestSearchOpen(filtered.length > 0)
  }

  // City ledger search: individual → guests table, organization → organizations table
  const searchLedger = async (term: string) => {
    setLedgerSearch(term)
    setSelectedLedger(null)
    if (!term.trim()) { setLedgerResults([]); setLedgerSearchOpen(false); return }
    if (ledgerType === 'individual') {
      const filtered = allGuests.filter(g => g.name.toLowerCase().includes(term.toLowerCase()) || (g.phone || '').includes(term))
      setLedgerResults(filtered.slice(0, 8))
      setLedgerSearchOpen(filtered.length > 0)
    } else {
      const supabase = createClient()
      const { data } = await supabase.from('organizations').select('id, name, phone, email').ilike('name', `%${term}%`).limit(8)
      setLedgerResults((data || []).map(d => ({ ...d, source: 'organizations' })))
      setLedgerSearchOpen((data || []).length > 0)
    }
  }

  // Check room availability for selected dates
  const checkRoomAvailability = async () => {
    if (!checkIn || !checkOut || nights <= 0) { toast.error('Select valid check-in and check-out dates'); return }
    setRoomAvailabilityChecked(false)
    try {
      const supabase = createClient()
      const { data } = await supabase
        .from('rooms')
        .select('id, room_number, room_type, price_per_night, status')
        .eq('organization_id', orgId)
        .in('status', ['available'])
        .order('room_type')
      setAvailableRooms(data || [])
      setRoomAvailabilityChecked(true)
    } catch { toast.error('Failed to check availability') }
  }

  // Per-room guest search
  const handleRoomGuestSearch = (index: number, term: string) => {
    const updated = [...entries]
    updated[index].guestSearch = term
    updated[index].guestName = term
    updated[index].guestId = null
    if (term.trim()) {
      const filtered = allGuests.filter(g => g.name.toLowerCase().includes(term.toLowerCase()) || (g.phone || '').includes(term))
      updated[index].filteredGuests = filtered.slice(0, 6)
      updated[index].guestSearchOpen = filtered.length > 0
    } else {
      updated[index].filteredGuests = []
      updated[index].guestSearchOpen = false
    }
    setEntries(updated)
  }

  const selectRoomGuest = (index: number, guest: any) => {
    const updated = [...entries]
    updated[index].guestName = guest.name
    updated[index].guestId = guest.id
    updated[index].phone = guest.phone || ''
    updated[index].guestSearch = guest.name
    updated[index].guestSearchOpen = false
    updated[index].filteredGuests = []
    setEntries(updated)
  }

  const applyQuickFill = () => {
    const count = Number(quickRoomCount)
    if (!count || count < 1) { toast.error('Enter a valid room count'); return }
    if (!quickRoomType) { toast.error('Select a room type'); return }
    setEntries(Array.from({ length: count }, () => ({ ...makeEntry(), roomType: quickRoomType })))
    toast.success(`${count} room entries added`)
  }

  const canGoStep2 = () => {
    if (bookingType === 'organization' && !selectedOrg) return false
    if (bookingType === 'individual' && !selectedGroupGuest) return false
    return true
  }
  const canGoStep3 = () => checkIn && checkOut && nights > 0
  const canSubmit = () => {
    if (paymentMethod === 'city_ledger' && !selectedLedger) return false
    if (paymentStatus === 'partial' && (!partialAmount || Number(partialAmount) <= 0)) return false
    return true
  }

  const handleSubmit = async () => {
    if (!checkIn || !checkOut) { toast.error('Dates required'); return }
    if (!canSubmit()) { toast.error('Complete payment details'); return }

    // Validate entries only if not filling later
    if (!fillLater && entries.some(e => !e.guestName.trim() || !e.roomType)) {
      toast.error('Fill in all room entries or enable "Fill Room Details Later"'); return
    }

    setLoading(true)
    try {
      const supabase = createClient()
      let createdCount = 0
      const totalRooms = fillLater ? (Number(totalRoomsCount) || 1) : entries.length

      if (fillLater) {
        // Create placeholder reservations — no guest/room assigned yet
        for (let i = 0; i < totalRooms; i++) {
          const folioId = `BLK-${Date.now().toString(36).toUpperCase()}-${i}`
          const isCityLedger = paymentMethod === 'city_ledger'
          await supabase.from('bookings').insert([{
            organization_id: orgId,
            guest_id: null,
            room_id: null,
            folio_id: folioId,
            check_in: toLocalDateStr(checkIn),
            check_out: toLocalDateStr(checkOut),
            number_of_nights: nights,
            rate_per_night: 0,
            total_amount: 0,
            deposit: 0,
            balance: 0,
            payment_status: 'pending',
            status: 'reserved',
            created_by: currentUserId,
            notes: `Bulk reservation (fill later) — ${bookingType === 'organization' ? selectedOrg?.name : selectedGroupGuest?.name}${isCityLedger && selectedLedger ? ` — City Ledger: ${selectedLedger.name || selectedLedger.account_name}` : ''}`,
          }])
          createdCount++
        }
      } else {
        for (const entry of entries) {
          const totalRoomSlots = entry.numberOfRooms || 1
          const { data: available } = await supabase
            .from('rooms').select('id, room_number, price_per_night')
            .eq('organization_id', orgId).eq('room_type', entry.roomType).eq('status', 'available')
            .limit(totalRoomSlots)

          if (!available || available.length === 0) {
            toast.error(`No available ${entry.roomType} rooms — skipped`); continue
          }

          let finalGuestId = entry.guestId
          if (!finalGuestId && entry.guestName.trim()) {
            const { data: ng, error: ge } = await supabase.from('guests')
              .insert([{ organization_id: orgId, name: entry.guestName, phone: entry.phone || null }])
              .select().single()
            if (ge) throw ge
            finalGuestId = ng.id
          }

          for (const room of available) {
            const total = room.price_per_night * nights
            const depositAmt = paymentStatus === 'paid' ? total : paymentStatus === 'partial' ? (Number(partialAmount) || 0) : 0
            const balanceAmt = total - depositAmt
            const isCityLedger = paymentMethod === 'city_ledger'
            const folioId = `BLK-${Date.now().toString(36).toUpperCase()}`

            const { data: booking, error: be } = await supabase.from('bookings').insert([{
              organization_id: orgId, guest_id: finalGuestId, room_id: room.id, folio_id: folioId,
              check_in: toLocalDateStr(checkIn), check_out: toLocalDateStr(checkOut),
              number_of_nights: nights, rate_per_night: room.price_per_night,
              total_amount: total, deposit: depositAmt, balance: balanceAmt,
              payment_status: paymentStatus === 'paid' ? 'paid' : paymentStatus === 'partial' ? 'partial' : 'pending',
              status: 'reserved', created_by: currentUserId,
              notes: isCityLedger && selectedLedger ? `City Ledger: ${selectedLedger.name || selectedLedger.account_name}` : null,
            }]).select().single()
            if (be) throw be

            await supabase.from('rooms').update({ status: 'reserved' }).eq('id', room.id)
            await supabase.from('transactions').insert([{
              organization_id: orgId, booking_id: booking.id,
              transaction_id: `TXN-${Date.now().toString(36).toUpperCase()}`,
              guest_name: entry.guestName, room: room.room_number, amount: total,
              payment_method: isCityLedger ? 'city_ledger' : paymentMethod,
              status: paymentStatus === 'paid' ? 'paid' : paymentStatus === 'partial' ? 'partial' : 'pending',
              description: `Bulk reservation — ${bookingType === 'organization' ? selectedOrg?.name : selectedGroupGuest?.name} — ${folioId}`,
              received_by: currentUserId,
            }])
            createdCount++
          }
        }
      }

      toast.success(`${createdCount} reservation(s) created`)
      onSuccess?.()
      handleClose()
    } catch (err: any) {
      toast.error(err.message || 'Failed to create reservations')
    } finally {
      setLoading(false)
    }
  }

  const handleClose = () => {
    setStep(1); setBookingType('organization')
    setOrgSearch(''); setOrgResults([]); setSelectedOrg(null); setOrgSearchOpen(false); setShowNewOrgForm(false)
    setNewOrgName(''); setNewOrgType(''); setNewOrgContact(''); setNewOrgPhone(''); setNewOrgEmail(''); setNewOrgAddress('')
    setGroupGuestSearch(''); setGroupGuestResults([]); setSelectedGroupGuest(null); setGroupGuestSearchOpen(false)
    setCheckIn(undefined); setCheckOut(undefined); setRoomAvailabilityChecked(false); setAvailableRooms([])
    setPaymentMethod('cash'); setPaymentStatus('unpaid'); setPartialAmount('')
    setLedgerSearch(''); setLedgerResults([]); setSelectedLedger(null); setLedgerSearchOpen(false)
    setShowNewLedgerOrgForm(false); setNewLedgerOrgName(''); setNewLedgerOrgEmail(''); setNewLedgerOrgPhone('')
    setEntries([makeEntry()]); setQuickRoomCount(''); setQuickRoomType(''); setFillLater(false); setTotalRoomsCount('')
    onClose()
  }

  const stepLabel = step === 1 ? 'Group Contact & Type' : step === 2 ? 'Dates & Room Availability' : 'Payment & Room Entries'

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-3xl max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Bulk Reservation — Step {step} of 3</DialogTitle>
          <DialogDescription>{stepLabel}</DialogDescription>
        </DialogHeader>

        <div className="flex items-center gap-2 pb-1">
          {[1,2,3].map(s => (
            <div key={s} className={`flex-1 h-1.5 rounded-full transition-colors ${s <= step ? 'bg-primary' : 'bg-muted'}`} />
          ))}
        </div>

        {/* ── STEP 1: Booking Type + Contact ── */}
        {step === 1 && (
          <div className="space-y-5 py-2">
            <div className="space-y-2">
              <Label>Booking Type</Label>
              <Select value={bookingType} onValueChange={(v: any) => {
                setBookingType(v); setSelectedOrg(null); setOrgSearch(''); setSelectedGroupGuest(null); setGroupGuestSearch(''); setShowNewOrgForm(false)
              }}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="organization">Organization</SelectItem>
                  <SelectItem value="individual">Individual Group</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Organization */}
            {bookingType === 'organization' && (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <Label>Organization *</Label>
                  <Button type="button" size="sm" variant="outline" className="h-7 text-xs gap-1"
                    onClick={() => { setShowNewOrgForm(v => !v); if (!showNewOrgForm) setNewOrgName(orgSearch) }}>
                    <Plus className="h-3 w-3" /> New Organization
                  </Button>
                </div>

                {!showNewOrgForm && (
                  <div className="relative">
                    <Input
                      placeholder="Search from organization database..."
                      value={orgSearch}
                      onChange={(e) => searchOrgs(e.target.value)}
                      onBlur={() => setTimeout(() => setOrgSearchOpen(false), 150)}
                    />
                    {orgSearching && <Loader2 className="absolute right-3 top-3 h-4 w-4 animate-spin text-muted-foreground" />}
                    {orgSearchOpen && orgResults.length > 0 && (
                      <div className="absolute top-full left-0 right-0 mt-1 bg-background border rounded-md shadow-lg z-50 max-h-48 overflow-y-auto">
                        {orgResults.map(org => (
                          <button key={org.id} className="w-full text-left px-4 py-2 hover:bg-accent border-b last:border-b-0 text-sm"
                            onMouseDown={(e) => { e.preventDefault(); setSelectedOrg(org); setOrgSearch(org.name); setOrgSearchOpen(false) }}>
                            <div className="font-medium">{org.name}</div>
                            <div className="text-xs text-muted-foreground">{org.phone} {org.email ? `· ${org.email}` : ''}</div>
                          </button>
                        ))}
                      </div>
                    )}
                    {orgSearch.trim() && !orgSearching && orgResults.length === 0 && (
                      <p className="text-xs text-muted-foreground mt-1">No organization found. Click "New Organization" to create one.</p>
                    )}
                  </div>
                )}

                {/* Inline New Org Form */}
                {showNewOrgForm && (
                  <div className="border rounded-lg p-4 space-y-3 bg-muted/20">
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-medium">Create New Organization</p>
                      <button onClick={() => setShowNewOrgForm(false)}><X className="h-4 w-4 text-muted-foreground" /></button>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="col-span-2 space-y-1">
                        <Label className="text-xs">Organization Name *</Label>
                        <Input value={newOrgName} onChange={(e) => setNewOrgName(e.target.value)} placeholder="e.g. Federal Ministry of Health" />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">Organization Type</Label>
                        <Select value={newOrgType} onValueChange={setNewOrgType}>
                          <SelectTrigger><SelectValue placeholder="Select type" /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="government">Government</SelectItem>
                            <SelectItem value="ngo">NGO / Non-profit</SelectItem>
                            <SelectItem value="private">Private Company</SelectItem>
                            <SelectItem value="other">Other</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">Contact Person</Label>
                        <Input value={newOrgContact} onChange={(e) => setNewOrgContact(e.target.value)} placeholder="Contact name" />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">Phone Number</Label>
                        <Input value={newOrgPhone} onChange={(e) => setNewOrgPhone(e.target.value)} placeholder="Phone" />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">Email Address</Label>
                        <Input type="email" value={newOrgEmail} onChange={(e) => setNewOrgEmail(e.target.value)} placeholder="Email" />
                      </div>
                      <div className="col-span-2 space-y-1">
                        <Label className="text-xs">Address</Label>
                        <Input value={newOrgAddress} onChange={(e) => setNewOrgAddress(e.target.value)} placeholder="Street address" />
                      </div>
                    </div>
                    <Button size="sm" className="w-full" onClick={createNewOrg} disabled={creatingOrg}>
                      {creatingOrg ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                      {creatingOrg ? 'Creating...' : 'Create Organization'}
                    </Button>
                  </div>
                )}

                {selectedOrg && (
                  <div className="flex items-center gap-2 p-2 rounded border bg-muted/40 text-sm">
                    <Building2 className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                    <div className="flex-1">
                      <span className="font-medium">{selectedOrg.name}</span>
                      {selectedOrg.phone && <span className="text-muted-foreground ml-2">· {selectedOrg.phone}</span>}
                    </div>
                    <button className="text-xs text-destructive hover:underline" onClick={() => { setSelectedOrg(null); setOrgSearch('') }}>Remove</button>
                  </div>
                )}
              </div>
            )}

            {/* Individual group contact */}
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
                        <button key={g.id} className="w-full text-left px-4 py-2 hover:bg-accent border-b last:border-b-0 text-sm"
                          onMouseDown={(e) => { e.preventDefault(); setSelectedGroupGuest(g); setGroupGuestSearch(g.name); setGroupGuestSearchOpen(false) }}>
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
          </div>
        )}

        {/* ── STEP 2: Dates + Room Availability Check ── */}
        {step === 2 && (
          <div className="space-y-5 py-2">
            <div className="p-3 bg-muted rounded-lg text-sm">
              <span className="text-muted-foreground">Booking for: </span>
              <span className="font-semibold">{bookingType === 'organization' ? selectedOrg?.name : selectedGroupGuest?.name}</span>
            </div>

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
                    <Calendar mode="single" selected={checkIn} onSelect={(d) => { setCheckIn(d); setCheckOut(undefined); setRoomAvailabilityChecked(false); setAvailableRooms([]) }} disabled={(d) => d < todayDate()} initialFocus />
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
                    <Calendar mode="single" selected={checkOut} onSelect={(d) => { setCheckOut(d); setRoomAvailabilityChecked(false); setAvailableRooms([]) }} disabled={(d) => checkIn ? d <= checkIn : d < todayDate()} initialFocus />
                  </PopoverContent>
                </Popover>
              </div>
            </div>

            {checkIn && checkOut && nights > 0 && (
              <p className="text-sm text-muted-foreground">{nights} night(s) · {format(checkIn, 'dd MMM')} — {format(checkOut, 'dd MMM yyyy')}</p>
            )}

            {/* Check Availability */}
            {checkIn && checkOut && nights > 0 && (
              <div className="space-y-3">
                <Button type="button" variant="outline" className="w-full" onClick={checkRoomAvailability}>
                  Check Room Availability for These Dates
                </Button>
                {roomAvailabilityChecked && (
                  <div className="border rounded-lg p-3 space-y-2">
                    <p className="text-sm font-medium">Available Rooms ({availableRooms.length} total)</p>
                    {ROOM_TYPES.map(rt => {
                      const count = availableRooms.filter(r => r.room_type === rt).length
                      return (
                        <div key={rt} className="flex items-center justify-between text-sm">
                          <span className="text-muted-foreground">{rt}</span>
                          {count > 0
                            ? <Badge variant="secondary" className="text-green-700 bg-green-50 border-green-200">{count} available</Badge>
                            : <Badge variant="secondary" className="text-red-700 bg-red-50 border-red-200">Not available</Badge>
                          }
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* ── STEP 3: Payment + Room Entries ── */}
        {step === 3 && (
          <div className="space-y-5 py-2">
            {/* Payment section */}
            <div className="space-y-4">
              <p className="text-sm font-semibold">Payment Details</p>
              <div className="space-y-2">
                <Label>Payment Method</Label>
                <Select value={paymentMethod} onValueChange={(v: any) => { setPaymentMethod(v); if (v !== 'city_ledger') { setSelectedLedger(null); setShowNewLedgerOrgForm(false) } }}>
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

              {paymentMethod === 'city_ledger' && (
                <div className="space-y-3 p-3 border rounded-lg bg-muted/20">
                  <div className="flex items-center justify-between">
                    <Label className="text-sm font-medium">City Ledger Account</Label>
                  </div>
                  <div className="flex gap-2">
                    <Button type="button" size="sm" variant={ledgerType === 'individual' ? 'default' : 'outline'} onClick={() => { setLedgerType('individual'); setLedgerSearch(''); setLedgerResults([]); setSelectedLedger(null); setShowNewLedgerOrgForm(false) }}>Individual</Button>
                    <Button type="button" size="sm" variant={ledgerType === 'organization' ? 'default' : 'outline'} onClick={() => { setLedgerType('organization'); setLedgerSearch(''); setLedgerResults([]); setSelectedLedger(null); setShowNewLedgerOrgForm(false) }}>Organization</Button>
                  </div>

                  <div className="flex gap-2">
                    <div className="relative flex-1">
                      <Input
                        placeholder={`Search ${ledgerType === 'individual' ? 'guest from database' : 'organization from database'}...`}
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
                              <div className="text-xs text-muted-foreground">{r.phone || r.contact_phone}</div>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                    {ledgerType === 'organization' && (
                      <Button type="button" size="sm" variant="outline" className="gap-1 whitespace-nowrap" onClick={() => setShowNewLedgerOrgForm(v => !v)}>
                        <Plus className="h-3 w-3" /> New
                      </Button>
                    )}
                  </div>

                  {showNewLedgerOrgForm && ledgerType === 'organization' && (
                    <div className="border rounded-md p-3 space-y-2 bg-background">
                      <p className="text-xs font-medium text-muted-foreground">Create new organization for city ledger</p>
                      <Input placeholder="Organization name *" value={newLedgerOrgName} onChange={(e) => setNewLedgerOrgName(e.target.value)} />
                      <Input type="email" placeholder="Email" value={newLedgerOrgEmail} onChange={(e) => setNewLedgerOrgEmail(e.target.value)} />
                      <Input placeholder="Phone" value={newLedgerOrgPhone} onChange={(e) => setNewLedgerOrgPhone(e.target.value)} />
                      <Button size="sm" className="w-full" onClick={createNewLedgerOrg} disabled={creatingLedgerOrg}>
                        {creatingLedgerOrg ? 'Creating...' : 'Create & Select'}
                      </Button>
                    </div>
                  )}

                  {selectedLedger && (
                    <div className="flex items-center justify-between p-2 rounded border bg-background text-sm">
                      <span className="font-medium">{selectedLedger.name || selectedLedger.account_name}</span>
                      <Button variant="ghost" size="sm" className="text-destructive h-6 text-xs" onClick={() => { setSelectedLedger(null); setLedgerSearch('') }}>Remove</Button>
                    </div>
                  )}
                  <p className="text-xs text-orange-600">City Ledger bills this reservation to the account — balance remains outstanding until paid.</p>
                </div>
              )}

              <div className="space-y-2">
                <Label>Payment Status</Label>
                <Select value={paymentStatus} onValueChange={(v: any) => setPaymentStatus(v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="unpaid">Unpaid — pay at check-in</SelectItem>
                    <SelectItem value="partial">Part payment now</SelectItem>
                    <SelectItem value="paid">Fully paid in advance</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {paymentStatus === 'partial' && (
                <div className="space-y-2">
                  <Label>Part Payment Amount (per room)</Label>
                  <Input type="number" min={1} placeholder="Amount paid now per room" value={partialAmount} onChange={(e) => setPartialAmount(e.target.value === '' ? '' : Number(e.target.value))} />
                </div>
              )}
            </div>

            <Separator />

            {/* Room entries */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-sm font-semibold">Room Entries</p>
                <label className="flex items-center gap-2 text-sm cursor-pointer">
                  <input type="checkbox" checked={fillLater} onChange={(e) => setFillLater(e.target.checked)} className="rounded" />
                  Fill room details later
                </label>
              </div>

              {fillLater ? (
                <div className="border rounded-lg p-4 bg-amber-50 border-amber-200 space-y-2">
                  <p className="text-sm text-amber-800 font-medium">Placeholder reservations will be created</p>
                  <p className="text-xs text-amber-700">Guest and room assignments can be completed later from the Reservations menu.</p>
                  <div className="space-y-1 pt-1">
                    <Label className="text-xs">Total Number of Rooms to Reserve</Label>
                    <Input type="number" min={1} placeholder="e.g., 50" value={totalRoomsCount} onChange={(e) => setTotalRoomsCount(e.target.value === '' ? '' : Number(e.target.value))} className="max-w-[160px]" />
                  </div>
                </div>
              ) : (
                <>
                  {/* Quick-fill panel */}
                  <div className="flex items-end gap-2 p-3 bg-muted/30 rounded-lg">
                    <div className="space-y-1">
                      <Label className="text-xs">Number of Rooms</Label>
                      <Input type="number" min={1} placeholder="e.g., 10" value={quickRoomCount} onChange={(e) => setQuickRoomCount(e.target.value === '' ? '' : Number(e.target.value))} className="w-28" />
                    </div>
                    <div className="space-y-1 flex-1">
                      <Label className="text-xs">Room Type</Label>
                      <Select value={quickRoomType} onValueChange={setQuickRoomType}>
                        <SelectTrigger><SelectValue placeholder="Select type" /></SelectTrigger>
                        <SelectContent>
                          {ROOM_TYPES.map(rt => <SelectItem key={rt} value={rt}>{rt}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                    <Button size="sm" variant="secondary" onClick={applyQuickFill}>Apply</Button>
                  </div>

                  {/* Individual entries */}
                  <div className="space-y-3 max-h-64 overflow-y-auto pr-1">
                    {entries.map((entry, i) => (
                      <div key={entry.id} className="border rounded-lg p-3 space-y-2 bg-background">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-medium text-muted-foreground">Room Entry {i + 1}</span>
                          {entries.length > 1 && (
                            <button onClick={() => setEntries(entries.filter(r => r.id !== entry.id))} className="text-destructive hover:opacity-80">
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          )}
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                          <div className="relative">
                            <Input
                              placeholder="Guest name (search or type)"
                              value={entry.guestSearch}
                              onChange={(e) => handleRoomGuestSearch(i, e.target.value)}
                              onBlur={() => setTimeout(() => {
                                const u = [...entries]; u[i].guestSearchOpen = false; setEntries(u)
                              }, 150)}
                            />
                            {entry.guestSearchOpen && entry.filteredGuests.length > 0 && (
                              <div className="absolute top-full left-0 right-0 mt-1 bg-background border rounded-md shadow-lg z-50 max-h-36 overflow-y-auto">
                                {entry.filteredGuests.map((g: any) => (
                                  <button key={g.id} className="w-full text-left px-3 py-2 hover:bg-accent text-sm"
                                    onMouseDown={(e) => { e.preventDefault(); selectRoomGuest(i, g) }}>
                                    {g.name} <span className="text-xs text-muted-foreground">{g.phone}</span>
                                  </button>
                                ))}
                              </div>
                            )}
                          </div>
                          <Select value={entry.roomType} onValueChange={(v) => { const u = [...entries]; u[i].roomType = v; setEntries(u) }}>
                            <SelectTrigger><SelectValue placeholder="Room type" /></SelectTrigger>
                            <SelectContent>{ROOM_TYPES.map(rt => <SelectItem key={rt} value={rt}>{rt}</SelectItem>)}</SelectContent>
                          </Select>
                          <Input placeholder="Phone (optional)" value={entry.phone} onChange={(e) => { const u = [...entries]; u[i].phone = e.target.value; setEntries(u) }} disabled={!!entry.guestId} />
                          <div className="flex items-center gap-2">
                            <Label className="text-xs whitespace-nowrap">Qty:</Label>
                            <Input type="number" min={1} value={entry.numberOfRooms} onChange={(e) => { const u = [...entries]; u[i].numberOfRooms = Number(e.target.value) || 1; setEntries(u) }} className="w-20" />
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                  <Button type="button" variant="outline" size="sm" className="w-full gap-2" onClick={() => setEntries([...entries, makeEntry()])}>
                    <Plus className="h-4 w-4" /> Add Room Entry
                  </Button>
                </>
              )}
            </div>
          </div>
        )}

        {/* Navigation */}
        <div className="flex justify-between pt-4 border-t">
          <Button variant="outline" onClick={() => step > 1 ? setStep(step - 1) : handleClose()} disabled={loading}>
            <ChevronLeft className="mr-2 h-4 w-4" />
            {step > 1 ? 'Back' : 'Cancel'}
          </Button>
          {step < 3 ? (
            <Button
              onClick={() => setStep(step + 1)}
              disabled={step === 1 ? !canGoStep2() : !canGoStep3()}
            >
              Next <ChevronRight className="ml-2 h-4 w-4" />
            </Button>
          ) : (
            <Button onClick={handleSubmit} disabled={loading || !canSubmit()}>
              {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              {loading ? 'Creating...' : 'Confirm Bulk Reservation'}
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
