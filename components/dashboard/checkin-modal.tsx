'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { addDays, differenceInCalendarDays, format } from 'date-fns'
import { X } from 'lucide-react'
import { formatNaira } from '@/lib/utils/currency'
import { toast } from 'sonner'
import { isOrganizationMenuRecord, isSelectableLedgerName } from '@/lib/utils/ledger-organization'
import { resolveOrganizationLedgerAccount } from '@/lib/utils/resolve-ledger-account'
import { formatPersonName } from '@/lib/utils/name-format'
import { guestOrOrganizationNameTaken } from '@/lib/utils/guest-org-name-uniqueness'
import { insertFolioCharges } from '@/lib/utils/insert-folio-charges'
import { StayDateRangeFields } from '@/components/shared/stay-date-range-fields'
import { BOOKING_MODAL_ROOMS_LIMIT, normalizeRoomsForBookingPickers } from '@/lib/utils/room-bookability'

interface CheckinModalProps {
  open: boolean
  onClose: () => void
  onSuccess?: () => void
}

const toLocalDateStr = (date: Date) => {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

export function CheckinModal({ open, onClose, onSuccess }: CheckinModalProps) {
  const [loading, setLoading] = useState(false)
  const [orgId, setOrgId] = useState('')

  // Guest
  const [fullName, setFullName] = useState('')
  const [phone, setPhone] = useState('')
  const [guestId, setGuestId] = useState('')
  const [guests, setGuests] = useState<any[]>([])
  const [filteredGuests, setFilteredGuests] = useState<any[]>([])
  const [guestSearchOpen, setGuestSearchOpen] = useState(false)

  // Dates
  const [checkInDate, setCheckInDate] = useState<Date>(() => { const d = new Date(); d.setHours(0,0,0,0); return d })
  const [checkOutDate, setCheckOutDate] = useState<Date>(() => { const d = new Date(); d.setHours(0,0,0,0); return addDays(d, 1) })
  const [nights, setNights] = useState(1)

  // Room
  const [rooms, setRooms] = useState<any[]>([])
  const [allRooms, setAllRooms] = useState<any[]>([])
  const [allBookings, setAllBookings] = useState<any[]>([])
  const [selectedRoom, setSelectedRoom] = useState<any>(null)

  // Payment
  const [paymentMethod, setPaymentMethod] = useState('cash')
  const [customPrice, setCustomPrice] = useState<number | ''>('')
  const [ledgerSearch, setLedgerSearch] = useState('')
  const [ledgerResults, setLedgerResults] = useState<any[]>([])
  const [ledgerSearchOpen, setLedgerSearchOpen] = useState(false)
  const [selectedLedger, setSelectedLedger] = useState<any>(null)
  const [showNewLedgerOrgForm, setShowNewLedgerOrgForm] = useState(false)
  const [newLedgerOrgName, setNewLedgerOrgName] = useState('')
  const [newLedgerOrgPhone, setNewLedgerOrgPhone] = useState('')
  const [creatingLedgerOrg, setCreatingLedgerOrg] = useState(false)

  // Driver referral
  const [driverCode, setDriverCode] = useState('')
  const [driverVerified, setDriverVerified] = useState(false)
  const [driverVerifying, setDriverVerifying] = useState(false)
  const [driverName, setDriverName] = useState('')

  useEffect(() => {
    if (open) loadData()
    else resetForm()
  }, [open])

  const loadData = async () => {
    try {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      const { data: profile } = await supabase.from('profiles').select('organization_id').eq('id', user.id).single()
      if (!profile?.organization_id) return
      setOrgId(profile.organization_id)

      const [{ data: guestData }, { data: roomData }, { data: bookingData }] = await Promise.all([
        supabase.from('guests').select('id, name, phone').eq('organization_id', profile.organization_id).order('name'),
        supabase.from('rooms').select('id, room_number, room_type, price_per_night, status').eq('organization_id', profile.organization_id).order('room_number').limit(BOOKING_MODAL_ROOMS_LIMIT),
        supabase.from('bookings').select('room_id, check_in, check_out').eq('organization_id', profile.organization_id).in('status', ['confirmed', 'reserved', 'checked_in']).limit(BOOKING_MODAL_ROOMS_LIMIT),
      ])

      setGuests(guestData || [])
      const sanitized = normalizeRoomsForBookingPickers(roomData) as any[]
      setAllRooms(sanitized)
      setAllBookings(bookingData || [])
      filterRooms(checkInDate, checkOutDate, bookingData || [], sanitized)
    } catch {
      toast.error('Failed to load data')
    }
  }

  const filterRooms = (ci: Date, co: Date, bookings: any[], allRms: any[]) => {
    const ciStr = toLocalDateStr(ci)
    const coStr = toLocalDateStr(co)
    const bookedIds = new Set(bookings.filter(b => b.check_in < coStr && b.check_out > ciStr).map(b => b.room_id))
    const available = allRms.filter(r => !bookedIds.has(r.id))
    setRooms(available)
    setSelectedRoom((prev: any) => prev && bookedIds.has(prev.id) ? null : prev)
  }

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
    setGuestSearchOpen(false)
  }

  const handleStayDatesChange = (from: Date, to: Date | undefined) => {
    setCheckInDate(from)
    if (to) {
      setCheckOutDate(to)
      setNights(Math.max(1, differenceInCalendarDays(to, from)))
      filterRooms(from, to, allBookings, allRooms)
    } else {
      const provisional = addDays(from, 1)
      setCheckOutDate(provisional)
      setNights(1)
      filterRooms(from, provisional, allBookings, allRooms)
    }
  }

  const handleNightsChange = (n: number) => {
    const val = Math.max(1, n || 1)
    setNights(val)
    const co = addDays(checkInDate, val)
    setCheckOutDate(co)
    filterRooms(checkInDate, co, allBookings, allRooms)
  }

  const handleVerifyDriver = async () => {
    if (!driverCode.trim()) return
    setDriverVerifying(true)
    try {
      const supabase = createClient()
      const { data } = await supabase.from('profiles').select('full_name').eq('driver_code', driverCode.trim().toUpperCase()).maybeSingle()
      if (data) {
        setDriverVerified(true)
        setDriverName(data.full_name)
        toast.success(`Driver verified: ${data.full_name}`)
      } else {
        setDriverVerified(false)
        setDriverName('')
        toast.error('Driver code not found')
      }
    } catch {
      toast.error('Failed to verify driver')
    } finally {
      setDriverVerifying(false)
    }
  }

  const canSubmit = () => !!(fullName.trim() && selectedRoom && checkInDate && checkOutDate && nights > 0)

  const searchLedgerOrganizations = async (term: string) => {
    setLedgerSearch(term)
    setSelectedLedger(null)
    if (!term.trim()) {
      setLedgerResults([])
      setLedgerSearchOpen(false)
      return
    }

    const supabase = createClient()
    const [{ data: ledgerData }, { data: orgData }] = await Promise.all([
      supabase
        .from('city_ledger_accounts')
        .select('id, account_name, account_type, contact_phone, balance')
        .eq('organization_id', orgId)
        .ilike('account_name', `%${term}%`)
        .limit(8),
      supabase
        .from('organizations')
        .select('id, name, phone, org_type, created_by')
        .neq('id', orgId)
        .ilike('name', `%${term}%`)
        .limit(8),
    ])

    const fromLedger = (ledgerData || [])
      .filter((account: any) => ['organization', 'corporate'].includes(account.account_type) && isSelectableLedgerName(account.account_name))
      .map((account: any) => ({
        id: account.id,
        name: account.account_name,
        account_name: account.account_name,
        phone: account.contact_phone,
        balance: account.balance || 0,
        source: 'city_ledger',
      }))
    const ledgerNames = new Set(fromLedger.map((account: any) => String(account.name || '').toLowerCase()))
    const fromOrgs = (orgData || [])
      .filter((org: any) => isOrganizationMenuRecord(org, orgId) && !ledgerNames.has(String(org.name || '').toLowerCase()))
      .map((org: any) => ({
        id: org.id,
        name: org.name,
        account_name: org.name,
        phone: org.phone,
        balance: 0,
        source: 'organizations',
      }))

    const results = [...fromLedger, ...fromOrgs]
    setLedgerResults(results)
    setLedgerSearchOpen(results.length > 0)
  }

  const createNewLedgerOrganization = async () => {
    if (!newLedgerOrgName.trim()) {
      toast.error('Organization name required')
      return
    }
    setCreatingLedgerOrg(true)
    try {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()

      const nameTaken = await guestOrOrganizationNameTaken(supabase, {
        hotelTenantOrganizationId: orgId,
        candidateName: newLedgerOrgName.trim(),
      })
      if (nameTaken) {
        toast.error('This name is already used by a guest or organization')
        return
      }

      const { error: orgInsertError } = await supabase.from('organizations').insert([{
        name: newLedgerOrgName.trim(),
        org_type: 'other',
        email: null,
        phone: newLedgerOrgPhone.trim() || null,
        current_balance: 0,
        created_by: user?.id ?? null,
      }])
      if (orgInsertError) throw orgInsertError

      const { data, error } = await supabase
        .from('city_ledger_accounts')
        .insert([{
          organization_id: orgId,
          account_name: newLedgerOrgName.trim(),
          account_type: 'organization',
          contact_phone: newLedgerOrgPhone.trim() || null,
          balance: 0,
        }])
        .select('id, account_name, contact_phone, balance')
        .single()
      if (error) throw error
      const account = {
        id: data.id,
        name: data.account_name,
        account_name: data.account_name,
        phone: data.contact_phone,
        balance: data.balance || 0,
        source: 'city_ledger',
      }
      setSelectedLedger(account)
      setLedgerSearch(account.name)
      setShowNewLedgerOrgForm(false)
      setNewLedgerOrgName('')
      setNewLedgerOrgPhone('')
      toast.success(`Organization account "${account.name}" created and selected`)
    } catch (error: any) {
      toast.error(error.message || 'Failed to create organization account')
    } finally {
      setCreatingLedgerOrg(false)
    }
  }

  const handleSubmit = async () => {
    if (!canSubmit()) { toast.error('Please fill in all required fields'); return }
    if (paymentMethod === 'city_ledger' && !selectedLedger) {
      toast.error('Please select a city ledger organization account')
      return
    }
    try {
      setLoading(true)
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()

      const formattedGuestName = formatPersonName(fullName)
      let finalGuestId = guestId
      if (!guestId) {
        const dupGuest = await guestOrOrganizationNameTaken(supabase, {
          hotelTenantOrganizationId: orgId,
          candidateName: formattedGuestName,
        })
        if (dupGuest) {
          toast.error('This name is already used by a guest or organization')
          return
        }

        const { data: newGuest, error: ge } = await supabase
          .from('guests')
          .insert([{ organization_id: orgId, name: formattedGuestName, phone: phone || null }])
          .select().single()
        if (ge) throw ge
        finalGuestId = newGuest.id

      }

      const rate = customPrice !== '' ? Number(customPrice) : (selectedRoom.price_per_night || 0)
      const total = rate * nights
      const isPaid = paymentMethod !== 'city_ledger'
      const folioId = `FOL-${Date.now().toString(36).toUpperCase()}`

      const { data: booking, error: be } = await supabase.from('bookings').insert([{
        organization_id: orgId,
        guest_id: finalGuestId,
        room_id: selectedRoom.id,
        folio_id: folioId,
        check_in: toLocalDateStr(checkInDate),
        check_out: toLocalDateStr(checkOutDate),
        number_of_nights: nights,
        rate_per_night: rate,
        total_amount: total,
        deposit: isPaid ? total : 0,
        balance: isPaid ? 0 : total,
        payment_status: isPaid ? 'paid' : 'pending',
        status: 'confirmed',
        created_by: user?.id,
        notes: paymentMethod === 'city_ledger'
          ? `City Ledger: ${selectedLedger?.name || selectedLedger?.account_name}${driverVerified ? ` | driver: ${driverCode}` : ''}`
          : `payment_method: ${paymentMethod}${driverVerified ? ` | driver: ${driverCode}` : ''}`,
      }]).select().single()
      if (be) throw be

      if (paymentMethod === 'city_ledger' && selectedLedger?.id) {
        const { data: account } = await supabase
          .from('city_ledger_accounts')
          .select('id, balance')
          .eq('id', selectedLedger.id)
          .maybeSingle()

        if (account) {
          await supabase
            .from('city_ledger_accounts')
            .update({ balance: (Number(account.balance) || 0) + total })
            .eq('id', selectedLedger.id)
        }
      }

      await supabase.from('rooms').update({ status: 'occupied', updated_by: user?.id, updated_at: new Date().toISOString() }).eq('id', selectedRoom.id)

      const { error: folioErr } = await insertFolioCharges(supabase, [{
        booking_id: booking.id,
        organization_id: orgId,
        description: `Check-in charge — ${nights} night${nights !== 1 ? 's' : ''}`,
        amount: total,
        charge_type: 'room_charge',
        payment_method: paymentMethod,
        payment_status: isPaid ? 'paid' : 'unpaid',
        created_by: user?.id,
      }])
      if (folioErr) throw folioErr

      await supabase.from('transactions').insert([{
        organization_id: orgId,
        booking_id: booking.id,
        transaction_id: `TXN-${Date.now().toString(36).toUpperCase()}`,
        guest_name: formattedGuestName,
        room: selectedRoom.room_number,
        amount: total,
        payment_method: paymentMethod,
        status: isPaid ? 'completed' : 'pending',
        description: `Check-in — Folio ${folioId}`,
        received_by: user?.id,
      }])

      await supabase.from('payments').insert([{
        organization_id: orgId,
        booking_id: booking.id,
        guest_id: finalGuestId,
        amount: total,
        payment_method: paymentMethod,
        payment_date: new Date().toISOString(),
        notes: `Check-in payment — Folio ${folioId}`,
        received_by: user?.id,
      }])

      toast.success(`Guest checked in! Ref: ${folioId}`)
      onSuccess?.()
      onClose()
      resetForm()
    } catch (err: any) {
      toast.error(err.message || 'Failed to check in guest')
    } finally {
      setLoading(false)
    }
  }

  const resetForm = () => {
    setFullName(''); setPhone(''); setGuestId('')
    setFilteredGuests([]); setGuestSearchOpen(false)
    const d = new Date(); d.setHours(0,0,0,0)
    setCheckInDate(d); setCheckOutDate(addDays(d, 1)); setNights(1)
    setSelectedRoom(null); setPaymentMethod('cash'); setCustomPrice('')
    setLedgerSearch(''); setLedgerResults([]); setSelectedLedger(null); setLedgerSearchOpen(false)
    setShowNewLedgerOrgForm(false); setNewLedgerOrgName(''); setNewLedgerOrgPhone('')
    setDriverCode(''); setDriverVerified(false); setDriverName('')
  }

  const pricePerNight = selectedRoom?.price_per_night || 0
  const effectiveRate = customPrice !== '' ? Number(customPrice) : pricePerNight
  const totalAmount = effectiveRate * nights

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose() }}>
      <DialogContent className="max-w-2xl max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>New Guest Check-in</DialogTitle>
          <DialogDescription>Fill in details to check in a guest immediately</DialogDescription>
        </DialogHeader>

        <div className="space-y-5 py-2">

          {/* Guest Information */}
          <div className="rounded-lg border p-4 space-y-4">
            <p className="text-sm font-semibold">Guest Information</p>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2 col-span-2 md:col-span-1">
                <Label>Guest Full Name *</Label>
                <div className="relative">
                  <Input
                    placeholder="Type guest name or phone..."
                    value={fullName}
                    onChange={(e) => handleGuestSearch(e.target.value)}
                    onBlur={() => setTimeout(() => setGuestSearchOpen(false), 150)}
                  />
                  {guestSearchOpen && filteredGuests.length > 0 && (
                    <div className="absolute top-full left-0 right-0 mt-1 bg-background border rounded-md shadow-lg z-50 max-h-52 overflow-y-auto">
                      {filteredGuests.map(g => (
                        <button key={g.id} className="w-full text-left px-4 py-3 hover:bg-accent border-b last:border-b-0" onMouseDown={(e) => { e.preventDefault(); selectGuest(g) }}>
                          <div className="font-medium text-sm">{g.name}</div>
                          <div className="text-xs text-muted-foreground">{g.phone}</div>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                {guestId && (
                  <div className="flex items-center justify-between bg-blue-50 border border-blue-200 rounded px-2 py-1">
                    <p className="text-xs text-blue-800">Existing guest selected</p>
                    <Button size="sm" variant="ghost" className="h-5 w-5 p-0" onClick={() => { setGuestId(''); setFullName(''); setPhone('') }}>
                      <X className="h-3 w-3" />
                    </Button>
                  </div>
                )}
                {!guestId && fullName.trim() && <p className="text-xs text-amber-600">New guest will be created</p>}
              </div>
              <div className="space-y-2 col-span-2 md:col-span-1">
                <Label>Phone Number *</Label>
                <Input placeholder="08012345678" value={phone} onChange={(e) => setPhone(e.target.value)} disabled={!!guestId} />
              </div>
            </div>
            <StayDateRangeFields
              layout="inline"
              checkIn={checkInDate}
              checkOut={checkOutDate}
              nights={nights}
              onDatesChange={handleStayDatesChange}
              showNights={false}
              disableCalendar={(d) => d < new Date(new Date().setHours(0, 0, 0, 0))}
            />
            <div className="space-y-2">
              <Label>Room Number *</Label>
              <Select
                value={selectedRoom?.id ?? ''}
                onValueChange={(id) => {
                  const r = rooms.find(x => x.id === id)
                  if (r) setSelectedRoom(r)
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder={rooms.length === 0 ? 'No rooms available for selected dates' : 'Select room...'} />
                </SelectTrigger>
                <SelectContent>
                  {rooms.length === 0 ? (
                    <SelectItem value="__none__" disabled>No rooms available</SelectItem>
                  ) : (
                    rooms.map(r => (
                      <SelectItem key={r.id} value={r.id}>
                        {r.room_type} — Room {r.room_number}
                      </SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Room Payment */}
          <div className="rounded-lg border p-4 space-y-4">
            <div>
              <p className="text-sm font-semibold">Room Payment</p>
              <p className="text-xs text-muted-foreground">Calculated based on room type and stay duration</p>
            </div>
            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label>Room Rate (per night)</Label>
                <div className="flex items-center gap-1 px-3 py-2 bg-muted rounded border text-sm font-medium">
                  <span className="text-muted-foreground">₦</span>
                  <span>{pricePerNight.toLocaleString()}</span>
                </div>
              </div>
              <div className="space-y-2">
                <Label>Total Nights</Label>
                <div className="flex items-center gap-1 px-3 py-2 bg-muted rounded border text-sm">
                  <Input
                    type="number"
                    min={1}
                    value={nights}
                    onChange={(e) => handleNightsChange(parseInt(e.target.value))}
                    className="border-0 bg-transparent p-0 h-auto focus-visible:ring-0 text-sm"
                  />
                  <span className="text-muted-foreground text-xs">night{nights !== 1 ? 's' : ''}</span>
                </div>
              </div>
              <div className="space-y-2">
                <Label>Room Payment *</Label>
                <div className="space-y-1">
                  <div className="flex items-center gap-1 px-3 py-2 bg-muted rounded border text-sm font-medium">
                    <span className="text-muted-foreground">₦</span>
                    <span>{totalAmount.toLocaleString()}</span>
                  </div>
                  <p className="text-xs text-muted-foreground">Auto-calculated: ₦{totalAmount.toLocaleString()}</p>
                </div>
              </div>
            </div>
            <div className="space-y-2">
              <Label>Custom Rate / Night (optional)</Label>
              <Input type="number" placeholder="Leave empty to use room rate" value={customPrice} onChange={(e) => setCustomPrice(e.target.value === '' ? '' : Number(e.target.value))} />
            </div>
          </div>

          {/* Payment Mode */}
          <div className="rounded-lg border p-4 space-y-4">
            <div>
              <p className="text-sm font-semibold">Payment Mode</p>
              <p className="text-xs text-muted-foreground">Select how the guest will pay for their stay</p>
            </div>
            <div className="space-y-2">
              <Label>Payment Mode *</Label>
              <Select value={paymentMethod} onValueChange={setPaymentMethod}>
                <SelectTrigger><SelectValue placeholder="Select payment mode" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="cash">Cash</SelectItem>
                  <SelectItem value="pos">POS</SelectItem>
                  <SelectItem value="transfer">Transfer</SelectItem>
                  <SelectItem value="card">Card</SelectItem>
                  <SelectItem value="city_ledger">City Ledger</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {paymentMethod === 'city_ledger' && (
              <div className="space-y-3 rounded-md border bg-muted/30 p-3">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <Label>Organization Account</Label>
                  <Button type="button" size="sm" variant="outline" onClick={() => setShowNewLedgerOrgForm(true)}>
                    + New Organization Account
                  </Button>
                </div>
                <div className="relative">
                  <Input
                    placeholder="Search organization account..."
                    value={ledgerSearch}
                    onChange={(e) => searchLedgerOrganizations(e.target.value)}
                    onBlur={() => setTimeout(() => setLedgerSearchOpen(false), 150)}
                  />
                  {ledgerSearchOpen && ledgerResults.length > 0 && (
                    <div className="absolute top-full left-0 right-0 mt-1 bg-background border rounded-md shadow-lg z-50 max-h-48 overflow-y-auto">
                      {ledgerResults.map((account: any) => (
                        <button
                          key={`${account.source}-${account.id}`}
                          type="button"
                          className="w-full text-left px-4 py-2 hover:bg-accent border-b last:border-b-0 text-sm"
                          onMouseDown={async (e) => {
                            e.preventDefault()
                            try {
                              const supabase = createClient()
                              const resolved = await resolveOrganizationLedgerAccount(supabase, orgId, account)
                              setSelectedLedger(resolved)
                              setLedgerSearch(resolved.name || resolved.account_name)
                              setLedgerSearchOpen(false)
                            } catch (error: any) {
                              toast.error(error.message || 'Failed to select account')
                            }
                          }}
                        >
                          <div className="font-medium">{account.name || account.account_name}</div>
                          {account.phone && <div className="text-xs text-muted-foreground">{account.phone}</div>}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                {!showNewLedgerOrgForm && (
                  <Button type="button" size="sm" variant="secondary" className="w-full" onClick={() => setShowNewLedgerOrgForm(true)}>
                    + New Organization Account
                  </Button>
                )}
                {showNewLedgerOrgForm && (
                  <div className="rounded-md border bg-background p-3 space-y-2">
                    <Input placeholder="Organization name" value={newLedgerOrgName} onChange={(e) => setNewLedgerOrgName(e.target.value)} />
                    <Input placeholder="Phone optional" value={newLedgerOrgPhone} onChange={(e) => setNewLedgerOrgPhone(e.target.value)} />
                    <div className="flex gap-2 justify-end">
                      <Button type="button" size="sm" variant="outline" onClick={() => setShowNewLedgerOrgForm(false)}>Cancel</Button>
                      <Button type="button" size="sm" onClick={createNewLedgerOrganization} disabled={creatingLedgerOrg || !newLedgerOrgName.trim()}>
                        {creatingLedgerOrg ? 'Creating...' : 'Create & Select'}
                      </Button>
                    </div>
                  </div>
                )}
                {selectedLedger && (
                  <div className="flex items-center justify-between p-2 rounded border bg-background text-sm">
                    <span className="font-medium">{selectedLedger.name || selectedLedger.account_name}</span>
                    <Button type="button" variant="ghost" size="sm" className="text-destructive h-6 text-xs" onClick={() => { setSelectedLedger(null); setLedgerSearch('') }}>Remove</Button>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Driver Referral */}
          <div className="rounded-lg border p-4 space-y-4">
            <div>
              <p className="text-sm font-semibold">Driver Referral (Optional)</p>
              <p className="text-xs text-muted-foreground">Attach a driver referral code to give them commission. Leave empty if no driver.</p>
            </div>
            <div className="space-y-2">
              <Label>Driver Referral Code</Label>
              <div className="flex gap-2">
                <Input
                  placeholder="ENTER DRIVER REFERRAL CODE (E.G., DRV001)"
                  value={driverCode}
                  onChange={(e) => { setDriverCode(e.target.value.toUpperCase()); setDriverVerified(false); setDriverName('') }}
                  className="uppercase"
                />
                <Button type="button" variant="outline" onClick={handleVerifyDriver} disabled={driverVerifying || !driverCode.trim()}>
                  {driverVerifying ? 'Checking...' : 'Verify'}
                </Button>
              </div>
              {driverVerified && <p className="text-xs text-green-600">Driver verified: <strong>{driverName}</strong></p>}
            </div>
          </div>
        </div>

        <div className="flex justify-end gap-2 pt-4 border-t">
          <Button variant="outline" onClick={onClose} disabled={loading}>Cancel</Button>
          <Button onClick={handleSubmit} disabled={loading || !canSubmit()}>
            {loading ? 'Checking in...' : 'Check In Guest'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
