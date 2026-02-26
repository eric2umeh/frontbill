'use client'

import { useState, useEffect } from 'react'
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
import { Separator } from '@/components/ui/separator'
import { Calendar as CalendarIcon, Plus, Trash2, Loader2, Users, Building2, ChevronLeft, ChevronRight } from 'lucide-react'
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
  guestName: '',
  guestId: null,
  phone: '',
  roomType: '',
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

const today = () => {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  return d
}

export function BulkBookingModal({ open, onClose }: BulkBookingModalProps) {
  const [step, setStep] = useState(1)
  const [loading, setLoading] = useState(false)
  const [orgId, setOrgId] = useState('')
  const [currentUserId, setCurrentUserId] = useState('')

  // Booking type
  const [bookingType, setBookingType] = useState<'organization' | 'individual'>('organization')

  // Organization search — searches city_ledger_accounts (account_type=organization)
  const [orgSearch, setOrgSearch] = useState('')
  const [orgResults, setOrgResults] = useState<any[]>([])
  const [orgSearching, setOrgSearching] = useState(false)
  const [selectedOrg, setSelectedOrg] = useState<any>(null)
  const [orgSearchOpen, setOrgSearchOpen] = useState(false)

  // Individual group contact search — searches guests table
  const [groupGuestSearch, setGroupGuestSearch] = useState('')
  const [groupGuestResults, setGroupGuestResults] = useState<any[]>([])
  const [groupGuestSearchOpen, setGroupGuestSearchOpen] = useState(false)
  const [selectedGroupGuest, setSelectedGroupGuest] = useState<any>(null)

  // Dates
  const [checkIn, setCheckIn] = useState<Date>()
  const [checkOut, setCheckOut] = useState<Date>()

  // Step 2 Payment
  const [paymentMethod, setPaymentMethod] = useState<'cash' | 'pos' | 'card' | 'bank_transfer' | 'city_ledger'>('cash')
  const [paymentStatus, setPaymentStatus] = useState<'paid' | 'partial' | 'unpaid'>('unpaid')
  const [partialAmount, setPartialAmount] = useState<number | ''>('')
  // City ledger for bulk (org type already selected via bookingType, but kept flexible)
  const [ledgerType, setLedgerType] = useState<'individual' | 'organization'>('organization')
  const [ledgerSearch, setLedgerSearch] = useState('')
  const [ledgerResults, setLedgerResults] = useState<any[]>([])
  const [ledgerSearchOpen, setLedgerSearchOpen] = useState(false)
  const [selectedLedger, setSelectedLedger] = useState<any>(null)

  // Room entries
  const [entries, setEntries] = useState<RoomEntry[]>([makeEntry()])

  // All guests cache for per-room search
  const [allGuests, setAllGuests] = useState<any[]>([])

  // Quick-fill: number of rooms
  const [quickRoomCount, setQuickRoomCount] = useState<number | ''>('')
  const [quickRoomType, setQuickRoomType] = useState('')

  useEffect(() => {
    if (open) {
      fetchBootstrap()
    }
  }, [open])

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

  // Search organizations from city_ledger_accounts (account_type=organization)
  const searchOrgs = async (term: string) => {
    setOrgSearch(term)
    setSelectedOrg(null)
    if (!term.trim()) { setOrgResults([]); setOrgSearchOpen(false); return }
    setOrgSearching(true)
    try {
      const supabase = createClient()
      const { data } = await supabase
        .from('city_ledger_accounts')
        .select('id, account_name, contact_phone, balance')
        .eq('organization_id', orgId)
        .eq('account_type', 'organization')
        .ilike('account_name', `%${term}%`)
        .limit(8)
      setOrgResults(data || [])
      setOrgSearchOpen((data || []).length > 0)
      if (!data || data.length === 0) {
        toast.info(`No organization found for "${term}". Create one via the City Ledger Accounts or New Booking flow.`, { duration: 4000 })
      }
    } finally {
      setOrgSearching(false)
    }
  }

  // Search group contact guest
  const searchGroupGuest = (term: string) => {
    setGroupGuestSearch(term)
    setSelectedGroupGuest(null)
    if (!term.trim()) { setGroupGuestResults([]); setGroupGuestSearchOpen(false); return }
    const filtered = allGuests.filter(g => g.name.toLowerCase().includes(term.toLowerCase()) || (g.phone || '').includes(term))
    setGroupGuestResults(filtered.slice(0, 8))
    setGroupGuestSearchOpen(filtered.length > 0)
  }

  // City ledger account search (Step 2)
  const searchLedger = async (term: string) => {
    setLedgerSearch(term)
    setSelectedLedger(null)
    if (!term.trim()) { setLedgerResults([]); setLedgerSearchOpen(false); return }
    const supabase = createClient()
    if (ledgerType === 'individual') {
      const filtered = allGuests.filter(g => g.name.toLowerCase().includes(term.toLowerCase()) || (g.phone || '').includes(term))
      setLedgerResults(filtered.slice(0, 8))
      setLedgerSearchOpen(filtered.length > 0)
    } else {
      const { data } = await supabase
        .from('city_ledger_accounts')
        .select('id, account_name, contact_phone, balance')
        .eq('organization_id', orgId)
        .eq('account_type', 'organization')
        .ilike('account_name', `%${term}%`)
        .limit(8)
      setLedgerResults(data || [])
      setLedgerSearchOpen((data || []).length > 0)
    }
  }

  const selectLedger = (acct: any) => {
    setSelectedLedger(acct)
    setLedgerSearch(acct.account_name || acct.name)
    setLedgerSearchOpen(false)
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

  const addEntry = () => setEntries([...entries, makeEntry()])
  const removeEntry = (id: string) => { if (entries.length > 1) setEntries(entries.filter(r => r.id !== id)) }

  // Quick-fill: generate N entries all of the same type
  const applyQuickFill = () => {
    const count = Number(quickRoomCount)
    if (!count || count < 1) { toast.error('Enter a valid number of rooms'); return }
    if (!quickRoomType) { toast.error('Select a room type to quick-fill'); return }
    const generated: RoomEntry[] = Array.from({ length: count }, () => ({
      ...makeEntry(),
      roomType: quickRoomType,
    }))
    setEntries(generated)
    toast.success(`${count} room entries added for ${quickRoomType}`)
  }

  const nights = checkIn && checkOut ? differenceInDays(checkOut, checkIn) : 0

  const canGoToStep2 = () => {
    if (!checkIn || !checkOut || nights <= 0) return false
    if (bookingType === 'organization' && !selectedOrg) return false
    if (bookingType === 'individual' && !selectedGroupGuest) return false
    return true
  }

  const canGoToStep3 = () => {
    if (paymentMethod === 'city_ledger' && !selectedLedger) return false
    if (paymentStatus === 'partial' && (!partialAmount || Number(partialAmount) <= 0)) return false
    return true
  }

  const canSubmit = () => {
    if (entries.some(r => !r.guestName.trim() || !r.roomType)) return false
    return true
  }

  const handleSubmit = async () => {
    if (!checkIn || !checkOut) { toast.error('Dates required'); return }
    if (!canSubmit()) { toast.error('Fill in guest name and room type for all room entries'); return }

    setLoading(true)
    try {
      const supabase = createClient()
      let createdCount = 0

      for (const entry of entries) {
        const totalRooms = entry.numberOfRooms || 1

        // Get available rooms of that type
        const { data: available } = await supabase
          .from('rooms')
          .select('id, room_number, price_per_night')
          .eq('organization_id', orgId)
          .eq('room_type', entry.roomType)
          .eq('status', 'available')
          .limit(totalRooms)

        if (!available || available.length === 0) {
          toast.error(`No available ${entry.roomType} rooms — skipped`)
          continue
        }

        // Find or create guest
        let finalGuestId = entry.guestId
        if (!finalGuestId) {
          const { data: newGuest, error: ge } = await supabase
            .from('guests')
            .insert([{ organization_id: orgId, name: entry.guestName, phone: entry.phone || null }])
            .select().single()
          if (ge) throw ge
          finalGuestId = newGuest.id
        }

        for (const room of available) {
          const total = room.price_per_night * nights
          const depositAmt = paymentStatus === 'paid' ? total : paymentStatus === 'partial' ? (Number(partialAmount) || 0) : 0
          const balanceAmt = total - depositAmt
          const isCityLedger = paymentMethod === 'city_ledger'
          const folioId = `FOL-${Date.now().toString(36).toUpperCase()}`
          const bookingPaymentStatus = paymentStatus === 'paid' ? 'paid' : paymentStatus === 'partial' ? 'partial' : 'pending'

          const { data: booking, error: be } = await supabase.from('bookings').insert([{
            organization_id: orgId,
            guest_id: finalGuestId,
            room_id: room.id,
            folio_id: folioId,
            check_in: toLocalDateStr(checkIn),
            check_out: toLocalDateStr(checkOut),
            number_of_nights: nights,
            rate_per_night: room.price_per_night,
            total_amount: total,
            deposit: depositAmt,
            balance: balanceAmt,
            payment_status: bookingPaymentStatus,
            status: 'reserved',
            created_by: currentUserId,
            notes: isCityLedger ? `City Ledger: ${selectedLedger?.account_name || selectedLedger?.name}` : null,
          }]).select().single()

          if (be) throw be

          await supabase.from('rooms').update({ status: 'reserved' }).eq('id', room.id)

          await supabase.from('transactions').insert([{
            organization_id: orgId,
            booking_id: booking.id,
            transaction_id: `TXN-${Date.now().toString(36).toUpperCase()}`,
            guest_name: entry.guestName,
            room: room.room_number,
            amount: total,
            payment_method: isCityLedger ? 'city_ledger' : paymentMethod,
            status: bookingPaymentStatus,
            description: `Bulk reservation — ${bookingType === 'organization' ? selectedOrg?.account_name : selectedGroupGuest?.name} — ${folioId}`,
            received_by: currentUserId,
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
    setStep(1)
    setBookingType('organization')
    setOrgSearch(''); setOrgResults([]); setSelectedOrg(null); setOrgSearchOpen(false)
    setGroupGuestSearch(''); setGroupGuestResults([]); setSelectedGroupGuest(null); setGroupGuestSearchOpen(false)
    setCheckIn(undefined); setCheckOut(undefined)
    setPaymentMethod('cash'); setPaymentStatus('unpaid'); setPartialAmount('')
    setLedgerSearch(''); setLedgerResults([]); setSelectedLedger(null)
    setEntries([makeEntry()])
    setQuickRoomCount(''); setQuickRoomType('')
    onClose()
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Bulk Reservation — Step {step} of 3</DialogTitle>
          <DialogDescription>
            {step === 1 ? 'Select booking type, contact, and dates'
              : step === 2 ? 'Set payment method and status'
              : 'Add room entries for each guest'}
          </DialogDescription>
        </DialogHeader>

        {/* Step bar */}
        <div className="flex items-center gap-2 pb-1">
          {[1,2,3].map(s => (
            <div key={s} className={`flex-1 h-1.5 rounded-full transition-colors ${s <= step ? 'bg-primary' : 'bg-muted'}`} />
          ))}
        </div>

        {/* ── STEP 1: Type + Contact + Dates ── */}
        {step === 1 && (
          <div className="space-y-5 py-2">
            <div className="space-y-2">
              <Label>Booking Type</Label>
              <Select value={bookingType} onValueChange={(v: any) => { setBookingType(v); setSelectedOrg(null); setOrgSearch(''); setSelectedGroupGuest(null); setGroupGuestSearch('') }}>
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

            {/* Organization search */}
            {bookingType === 'organization' && (
              <div className="space-y-2">
                <Label>Organization *</Label>
                <p className="text-xs text-muted-foreground">Searches city ledger organization accounts. To add one, use the New Booking → City Ledger flow.</p>
                <div className="relative">
                  <Input
                    placeholder="Search organization name..."
                    value={orgSearch}
                    onChange={(e) => searchOrgs(e.target.value)}
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
                          <div className="text-xs text-muted-foreground">{org.contact_phone} {org.balance !== undefined ? `· Balance: ${formatNaira(org.balance)}` : ''}</div>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                {selectedOrg && (
                  <div className="flex items-center gap-2 p-2 rounded border bg-muted/40 text-sm">
                    <Building2 className="h-4 w-4 text-muted-foreground" />
                    <span className="font-medium">{selectedOrg.account_name}</span>
                    {selectedOrg.contact_phone && <span className="text-muted-foreground">· {selectedOrg.contact_phone}</span>}
                    <button className="ml-auto text-xs text-destructive" onClick={() => { setSelectedOrg(null); setOrgSearch('') }}>Remove</button>
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
                    <Calendar mode="single" selected={checkIn} onSelect={(d) => { setCheckIn(d); setCheckOut(undefined) }} disabled={(d) => d < today()} initialFocus />
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
                    <Calendar mode="single" selected={checkOut} onSelect={setCheckOut} disabled={(d) => checkIn ? d <= checkIn : d < today()} initialFocus />
                  </PopoverContent>
                </Popover>
              </div>
            </div>
            {checkIn && checkOut && nights > 0 && (
              <p className="text-sm text-muted-foreground">{nights} night(s) · {format(checkIn, 'dd MMM')} — {format(checkOut, 'dd MMM yyyy')}</p>
            )}
          </div>
        )}

        {/* ── STEP 2: Payment ── */}
        {step === 2 && (
          <div className="space-y-4 py-2">
            <div className="p-3 bg-muted rounded-lg text-sm">
              <span className="text-muted-foreground">Booking for: </span>
              <span className="font-semibold">{bookingType === 'organization' ? selectedOrg?.account_name : selectedGroupGuest?.name}</span>
              <span className="text-muted-foreground"> · {nights} night(s) · {checkIn && format(checkIn, 'dd MMM')} — {checkOut && format(checkOut, 'dd MMM yyyy')}</span>
            </div>

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

            {/* City Ledger picker */}
            {paymentMethod === 'city_ledger' && (
              <div className="space-y-3 p-3 border rounded-lg bg-muted/30">
                <Label className="text-sm font-medium">City Ledger Account</Label>
                <div className="flex gap-2">
                  <Button type="button" size="sm" variant={ledgerType === 'individual' ? 'default' : 'outline'} onClick={() => { setLedgerType('individual'); setLedgerSearch(''); setLedgerResults([]); setSelectedLedger(null) }}>Individual</Button>
                  <Button type="button" size="sm" variant={ledgerType === 'organization' ? 'default' : 'outline'} onClick={() => { setLedgerType('organization'); setLedgerSearch(''); setLedgerResults([]); setSelectedLedger(null) }}>Organization</Button>
                </div>
                <div className="relative">
                  <Input
                    placeholder={`Search ${ledgerType === 'individual' ? 'guest' : 'organization'}...`}
                    value={ledgerSearch}
                    onChange={(e) => searchLedger(e.target.value)}
                    onBlur={() => setTimeout(() => setLedgerSearchOpen(false), 150)}
                  />
                  {ledgerSearchOpen && ledgerResults.length > 0 && (
                    <div className="absolute top-full left-0 right-0 mt-1 bg-background border rounded-md shadow-lg z-50 max-h-48 overflow-y-auto">
                      {ledgerResults.map((r: any) => (
                        <button key={r.id} className="w-full text-left px-4 py-2 hover:bg-accent border-b last:border-b-0 text-sm" onMouseDown={(e) => { e.preventDefault(); selectLedger(r) }}>
                          <div className="font-medium">{r.account_name || r.name}</div>
                          <div className="text-xs text-muted-foreground">{r.contact_phone || r.phone}</div>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                {selectedLedger && (
                  <div className="flex items-center justify-between p-2 rounded border bg-background text-sm">
                    <span className="font-medium">{selectedLedger.account_name || selectedLedger.name}</span>
                    <Button variant="ghost" size="sm" className="text-destructive h-6 text-xs" onClick={() => { setSelectedLedger(null); setLedgerSearch('') }}>Remove</Button>
                  </div>
                )}
                <p className="text-xs text-orange-600">City Ledger bills are outstanding until the account settles.</p>
              </div>
            )}

            <div className="space-y-2">
              <Label>Payment Status</Label>
              <Select value={paymentStatus} onValueChange={(v: any) => setPaymentStatus(v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="unpaid">Unpaid — pay at check-in</SelectItem>
                  <SelectItem value="partial">Partial payment now</SelectItem>
                  <SelectItem value="paid">Fully paid in advance</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {paymentStatus === 'partial' && (
              <div className="space-y-2">
                <Label>Part Payment Amount (per room)</Label>
                <Input
                  type="number"
                  min={1}
                  placeholder="Enter amount paid now per room"
                  value={partialAmount}
                  onChange={(e) => setPartialAmount(e.target.value === '' ? '' : Number(e.target.value))}
                />
                <p className="text-xs text-muted-foreground">This amount will be applied as deposit per room reservation created.</p>
              </div>
            )}
          </div>
        )}

        {/* ── STEP 3: Room Entries ── */}
        {step === 3 && (
          <div className="space-y-4 py-2">
            {/* Quick-fill panel */}
            <Card className="p-4 bg-muted/30 border-dashed">
              <p className="text-sm font-medium mb-3">Quick Fill — Reserve multiple rooms of the same type</p>
              <div className="grid grid-cols-3 gap-3">
                <div className="col-span-1 space-y-1">
                  <Label className="text-xs">Number of Rooms</Label>
                  <Input
                    type="number"
                    min={1}
                    placeholder="e.g. 50"
                    value={quickRoomCount}
                    onChange={(e) => setQuickRoomCount(e.target.value === '' ? '' : Number(e.target.value))}
                  />
                </div>
                <div className="col-span-1 space-y-1">
                  <Label className="text-xs">Room Type</Label>
                  <Select value={quickRoomType} onValueChange={setQuickRoomType}>
                    <SelectTrigger><SelectValue placeholder="Select type" /></SelectTrigger>
                    <SelectContent>
                      {ROOM_TYPES.map(rt => <SelectItem key={rt} value={rt}>{rt}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="col-span-1 flex items-end">
                  <Button variant="secondary" className="w-full" onClick={applyQuickFill}>Apply</Button>
                </div>
              </div>
              <p className="text-xs text-muted-foreground mt-2">This replaces all current room entries. You can still edit individual entries below.</p>
            </Card>

            <Separator />

            <div className="flex items-center justify-between">
              <Label>Room Entries ({entries.length} total)</Label>
              <Button variant="outline" size="sm" onClick={addEntry}>
                <Plus className="mr-2 h-4 w-4" /> Add Entry
              </Button>
            </div>

            <div className="space-y-3 max-h-[40vh] overflow-y-auto pr-1">
              {entries.map((entry, index) => (
                <Card key={entry.id} className="p-4">
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-sm font-medium text-muted-foreground">Entry #{index + 1}</span>
                    {entries.length > 1 && (
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => removeEntry(entry.id)}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    {/* Guest name with search */}
                    <div className="col-span-2 relative space-y-1">
                      <Label className="text-xs">Guest Name *</Label>
                      <Input
                        placeholder="Type to search existing or enter new guest name"
                        value={entry.guestName}
                        onChange={(e) => handleRoomGuestSearch(index, e.target.value)}
                        onBlur={() => setTimeout(() => {
                          const updated = [...entries]
                          updated[index].guestSearchOpen = false
                          setEntries(updated)
                        }, 150)}
                      />
                      {entry.guestSearchOpen && entry.filteredGuests.length > 0 && (
                        <div className="absolute top-full left-0 right-0 mt-1 bg-background border rounded-md shadow-lg z-50 max-h-40 overflow-y-auto">
                          {entry.filteredGuests.map(g => (
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
                    </div>

                    {/* Phone */}
                    <div className="space-y-1">
                      <Label className="text-xs">Phone</Label>
                      <Input
                        placeholder="Phone"
                        value={entry.phone}
                        disabled={!!entry.guestId}
                        onChange={(e) => {
                          const updated = [...entries]
                          updated[index].phone = e.target.value
                          setEntries(updated)
                        }}
                      />
                    </div>

                    {/* Room type */}
                    <div className="space-y-1">
                      <Label className="text-xs">Room Type *</Label>
                      <Select value={entry.roomType} onValueChange={(val) => {
                        const updated = [...entries]
                        updated[index].roomType = val
                        setEntries(updated)
                      }}>
                        <SelectTrigger><SelectValue placeholder="Select type" /></SelectTrigger>
                        <SelectContent>
                          {ROOM_TYPES.map(rt => <SelectItem key={rt} value={rt}>{rt}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>

                    {/* Number of rooms for this entry */}
                    <div className="space-y-1">
                      <Label className="text-xs">Rooms for this guest</Label>
                      <Input
                        type="number"
                        min={1}
                        value={entry.numberOfRooms}
                        onChange={(e) => {
                          const updated = [...entries]
                          updated[index].numberOfRooms = Math.max(1, parseInt(e.target.value) || 1)
                          setEntries(updated)
                        }}
                      />
                    </div>
                  </div>
                </Card>
              ))}
            </div>

            <div className="text-sm text-muted-foreground p-2 rounded bg-muted">
              Total rooms to reserve: <strong>{entries.reduce((s, e) => s + e.numberOfRooms, 0)}</strong> · {nights} night(s) each
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
              disabled={step === 1 ? !canGoToStep2() : !canGoToStep3()}
            >
              Next <ChevronRight className="ml-2 h-4 w-4" />
            </Button>
          ) : (
            <Button onClick={handleSubmit} disabled={loading || !canSubmit()}>
              {loading ? 'Creating...' : `Create ${entries.reduce((s, e) => s + e.numberOfRooms, 0)} Reservation(s)`}
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
