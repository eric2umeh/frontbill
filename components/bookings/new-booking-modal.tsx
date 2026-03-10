'use client'

// Cache bust marker: 2025-02-25-final-fix
import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Calendar } from '@/components/ui/calendar'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { format, addDays } from 'date-fns'
import { Calendar as CalendarIcon, ChevronRight, ChevronLeft, X, Users, Building2 } from 'lucide-react'
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
  account_type: 'individual' | 'organization'
  contact_phone: string
  balance: number
  source: 'city_ledger' | 'organizations'
}

export function NewBookingModal({ open, onClose, onSuccess }: NewBookingModalProps) {
  const [step, setStep] = useState(1)
  const [loading, setLoading] = useState(false)
  const [organizationId, setOrganizationId] = useState('')

  // Step 1: Guest
  const [fullName, setFullName] = useState('')
  const [phone, setPhone] = useState('')
  const [email, setEmail] = useState('')
  const [address, setAddress] = useState('')
  const [guestId, setGuestId] = useState('')
  const [guestSearchOpen, setGuestSearchOpen] = useState(false)
  const [guests, setGuests] = useState<Guest[]>([])
  const [filteredGuests, setFilteredGuests] = useState<Guest[]>([])

  // Step 2: Dates
  const [checkInDate, setCheckInDate] = useState<Date>(() => {
    const d = new Date(); d.setHours(0, 0, 0, 0); return d
  })
  const [checkOutDate, setCheckOutDate] = useState<Date>(() => {
    const d = new Date(); d.setHours(0, 0, 0, 0); return new Date(d.getTime() + 86400000)
  })
  const [nights, setNights] = useState(1)
  const [checkInOpen, setCheckInOpen] = useState(false)
  const [checkOutOpen, setCheckOutOpen] = useState(false)

  // Step 3: Room & Payment
  const [rooms, setRooms] = useState<Room[]>([]) // date-filtered available rooms
  const [allRooms, setAllRooms] = useState<Room[]>([]) // all non-maintenance rooms
  const [allBookingsForRooms, setAllBookingsForRooms] = useState<any[]>([]) // active bookings for date check
  const [selectedRoomType, setSelectedRoomType] = useState('')
  const [selectedRoom, setSelectedRoom] = useState<Room | null>(null)
  const [pricePerNight, setPricePerNight] = useState(0)
  const [customPrice, setCustomPrice] = useState(0)
  const [paymentMethod, setPaymentMethod] = useState('cash')

  // City Ledger — split into individual and organization tabs
  const [ledgerTab, setLedgerTab] = useState<'individual' | 'organization'>('individual')
  const [ledgerSearch, setLedgerSearch] = useState('')
  const [ledgerAccount, setLedgerAccount] = useState('')
  const [ledgerAccountName, setLedgerAccountName] = useState('')
  const [ledgerOpen, setLedgerOpen] = useState(false)
  const [individualAccounts, setIndividualAccounts] = useState<LedgerAccount[]>([])
  const [organizationAccounts, setOrganizationAccounts] = useState<LedgerAccount[]>([])
  const [filteredLedgerAccounts, setFilteredLedgerAccounts] = useState<LedgerAccount[]>([])

  // New ledger account dialog
  const [newAccountDialogOpen, setNewAccountDialogOpen] = useState(false)
  const [newAccountName, setNewAccountName] = useState('')
  const [newAccountPhone, setNewAccountPhone] = useState('')
  const [newAccountEmail, setNewAccountEmail] = useState('')
  // Extra org fields (mirrors the Organization menu form)
  const [newAccountAddress, setNewAccountAddress] = useState('')
  const [newAccountCity, setNewAccountCity] = useState('')
  const [newAccountType, setNewAccountType] = useState('')
  const [newAccountCreating, setNewAccountCreating] = useState(false)

  useEffect(() => {
    if (open) loadData()
    else {
      setLoading(false)
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

      const [
        { data: guestData },
        { data: roomData },
        { data: bookingData },
        { data: cityLedgerData },
        { data: orgsData },
      ] = await Promise.all([
        // Guests table
        supabase.from('guests').select('id, name, phone, email, address').eq('organization_id', orgId).order('name'),
        // All non-maintenance rooms — availability is checked by date range, not status
        supabase.from('rooms').select('id, room_number, room_type, price_per_night').eq('organization_id', orgId).neq('status', 'maintenance').order('room_number'),
        // Active bookings to check date conflicts
        supabase.from('bookings').select('room_id, check_in, check_out').eq('organization_id', orgId).in('status', ['confirmed', 'reserved', 'checked_in']),
        // City ledger accounts — load ALL, split by type client-side
        supabase.from('city_ledger_accounts').select('id, account_name, account_type, contact_phone, balance').eq('organization_id', orgId).order('account_name'),
        // Also load from organizations table as fallback (legacy orgs may live there)
        supabase.from('organizations').select('id, name, phone, email').order('name'),
      ])

      setGuests(guestData || [])
      setAllRooms(roomData || [])
      setAllBookingsForRooms(bookingData || [])
      setRooms(roomData || [])

      // Individuals: city_ledger_accounts with type individual/guest
      const individualLedger: LedgerAccount[] = (cityLedgerData || [])
        .filter(a => a.account_type === 'individual' || a.account_type === 'guest')
        .map(a => ({
          id: a.id,
          account_name: a.account_name,
          account_type: 'individual' as const,
          contact_phone: a.contact_phone || '',
          balance: a.balance || 0,
          source: 'city_ledger',
        }))

      // Organizations: city_ledger_accounts non-individual + organizations table (legacy), deduped by name
      const orgFromLedger: LedgerAccount[] = (cityLedgerData || [])
        .filter(a => a.account_type !== 'individual' && a.account_type !== 'guest')
        .map(a => ({
          id: a.id,
          account_name: a.account_name,
          account_type: 'organization' as const,
          contact_phone: a.contact_phone || '',
          balance: a.balance || 0,
          source: 'city_ledger',
        }))

      const orgNames = new Set(orgFromLedger.map(o => o.account_name.toLowerCase()))
      const orgFromTable: LedgerAccount[] = (orgsData || [])
        .filter(o => !orgNames.has(o.name.toLowerCase()))
        .map(o => ({
          id: o.id,
          account_name: o.name,
          account_type: 'organization' as const,
          contact_phone: o.phone || '',
          balance: 0,
          source: 'organizations',
        }))

      const orgLedger: LedgerAccount[] = [...orgFromLedger, ...orgFromTable]
        .sort((a, b) => a.account_name.localeCompare(b.account_name))

      setIndividualAccounts(individualLedger)
      setOrganizationAccounts(orgLedger)
      setFilteredLedgerAccounts(ledgerTab === 'individual' ? individualLedger : orgLedger)
    } catch (err: any) {
      console.error('[v0] Error loading booking data:', err)
      toast.error('Failed to load booking data')
    } finally {
      setLoading(false)
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

  // Ledger tab switch
  const handleLedgerTabChange = (tab: string) => {
    const t = tab as 'individual' | 'organization'
    setLedgerTab(t)
    setLedgerSearch('')
    setLedgerAccount('')
    setLedgerAccountName('')
    setFilteredLedgerAccounts(t === 'individual' ? individualAccounts : organizationAccounts)
    setLedgerOpen(false)
  }

  // Ledger search — searches all city_ledger_accounts live so nothing is missed
  const handleLedgerSearch = async (value: string) => {
    setLedgerSearch(value)
    setLedgerAccount('')
    setLedgerAccountName('')
    if (!value.trim()) {
      const source = ledgerTab === 'individual' ? individualAccounts : organizationAccounts
      setFilteredLedgerAccounts(source)
      setLedgerOpen(source.length > 0)
      return
    }
    // First filter from preloaded list
    const allLoaded = [...individualAccounts, ...organizationAccounts]
    const fromCache = allLoaded.filter(a =>
      a.account_name.toLowerCase().includes(value.toLowerCase())
    )
    if (fromCache.length > 0) {
      setFilteredLedgerAccounts(fromCache)
      setLedgerOpen(true)
      return
    }
    // Fallback: live search in case account was created after modal opened
    const supabase = createClient()
    const [{ data: ledgerData }, { data: orgSearchData }] = await Promise.all([
      supabase
        .from('city_ledger_accounts')
        .select('id, account_name, account_type, contact_phone, balance')
        .eq('organization_id', organizationId)
        .ilike('account_name', `%${value}%`)
        .limit(10),
      supabase
        .from('organizations')
        .select('id, name, phone')
        .ilike('name', `%${value}%`)
        .limit(10),
    ])
    const fromLedger: LedgerAccount[] = (ledgerData || []).map(a => ({
      id: a.id,
      account_name: a.account_name,
      account_type: (a.account_type === 'individual' || a.account_type === 'guest') ? 'individual' : 'organization',
      contact_phone: a.contact_phone || '',
      balance: a.balance || 0,
      source: 'city_ledger' as const,
    }))
    const ledgerNames = new Set(fromLedger.map(a => a.account_name.toLowerCase()))
    const fromOrgs: LedgerAccount[] = (orgSearchData || [])
      .filter(o => !ledgerNames.has(o.name.toLowerCase()))
      .map(o => ({
        id: o.id,
        account_name: o.name,
        account_type: 'organization' as const,
        contact_phone: o.phone || '',
        balance: 0,
        source: 'organizations' as const,
      }))
    const results = [...fromLedger, ...fromOrgs]
    setFilteredLedgerAccounts(results)
    setLedgerOpen(results.length > 0)
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
    const source = ledgerTab === 'individual' ? individualAccounts : organizationAccounts
    setFilteredLedgerAccounts(source)
    setLedgerOpen(false)
  }

  // Create new ledger account — inserts into city_ledger_accounts
  const handleCreateNewAccount = async () => {
    if (!newAccountName.trim()) {
      toast.error('Please enter a name')
      return
    }
    try {
      setNewAccountCreating(true)
      const supabase = createClient()

      if (ledgerTab === 'individual') {
        // Check if an account with this name already exists in city_ledger_accounts
        const existing = individualAccounts.find(
          a => a.account_name.toLowerCase() === newAccountName.trim().toLowerCase()
        )
        if (existing) {
          toast.success(`Linked to existing account "${existing.account_name}"`)
          setLedgerAccount(existing.id)
          setLedgerAccountName(existing.account_name)
          setLedgerSearch(existing.account_name)
          setNewAccountDialogOpen(false)
          setNewAccountName(''); setNewAccountPhone(''); setNewAccountEmail('')
          return
        }

        // Create new city_ledger_accounts record (individual)
        const { data: newAcct, error } = await supabase
          .from('city_ledger_accounts')
          .insert([{
            organization_id: organizationId,
            account_name: newAccountName.trim(),
            account_type: 'individual',
            contact_phone: newAccountPhone.trim() || null,
            balance: 0,
          }])
          .select()
          .single()
        if (error) throw error

        const acct: LedgerAccount = { id: newAcct.id, account_name: newAcct.account_name, account_type: 'individual', contact_phone: newAcct.contact_phone || '', balance: 0, source: 'city_ledger' }
        setIndividualAccounts(prev => [acct, ...prev])
        setLedgerAccount(newAcct.id)
        setLedgerAccountName(newAcct.account_name)
        setLedgerSearch(newAcct.account_name)
        toast.success(`Account "${newAcct.account_name}" created`)

      } else {
        // Create new city_ledger_accounts record (organization)
        const { data: newOrg, error } = await supabase
          .from('city_ledger_accounts')
          .insert([{
            organization_id: organizationId,
            account_name: newAccountName.trim(),
            account_type: 'organization',
            contact_phone: newAccountPhone.trim() || null,
            balance: 0,
          }])
          .select()
          .single()
        if (error) throw error

        const acct: LedgerAccount = { id: newOrg.id, account_name: newOrg.account_name, account_type: 'organization', contact_phone: newOrg.contact_phone || '', balance: 0, source: 'city_ledger' }
        setOrganizationAccounts(prev => [acct, ...prev])
        setLedgerAccount(newOrg.id)
        setLedgerAccountName(newOrg.account_name)
        setLedgerSearch(newOrg.account_name)
        toast.success(`Organization "${newOrg.account_name}" created`)
      }

      setNewAccountDialogOpen(false)
      setNewAccountName(''); setNewAccountPhone(''); setNewAccountEmail('')
      setNewAccountAddress(''); setNewAccountCity(''); setNewAccountType('')
    } catch (err: any) {
      toast.error(err.message || 'Failed to create account')
    } finally {
      setNewAccountCreating(false)
    }
  }

  // Format a local date as YYYY-MM-DD without timezone conversion
  const toLocalDateStr = (date: Date) => {
    const y = date.getFullYear()
    const m = String(date.getMonth() + 1).padStart(2, '0')
    const d = String(date.getDate()).padStart(2, '0')
    return `${y}-${m}-${d}`
  }
  const filterRoomsForDates = (ci: Date, co: Date) => {
    const toStr = (d: Date) => {
      const y = d.getFullYear(), m = String(d.getMonth()+1).padStart(2,'0'), dd = String(d.getDate()).padStart(2,'0')
      return `${y}-${m}-${dd}`
    }
    const ciStr = toStr(ci), coStr = toStr(co)
    const bookedRoomIds = new Set(
      allBookingsForRooms
        .filter(b => b.check_in < coStr && b.check_out > ciStr)
        .map(b => b.room_id)
    )
    setRooms(allRooms.filter(r => !bookedRoomIds.has(r.id)))
    // Clear selected room if it's no longer available
    setSelectedRoom(prev => prev && bookedRoomIds.has(prev.id) ? null : prev)
    setSelectedRoomType(prev => {
      if (!prev) return prev
      const stillAvail = allRooms.some(r => r.room_type === prev && !bookedRoomIds.has(r.id))
      return stillAvail ? prev : ''
    })
  }

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
    // Re-filter available rooms for the newly selected dates
    filterRoomsForDates(checkInDate, date)
  }

  const handleNightsChange = (value: number) => {
    const n = Math.max(1, value || 1)
    setNights(n)
    if (checkInDate) setCheckOutDate(addDays(checkInDate, n))
  }

  // Room selection — rooms list is already filtered for the selected dates
  const handleRoomTypeSelect = (roomType: string) => {
    setSelectedRoomType(roomType)
    const room = rooms.find(r => r.room_type === roomType)
    if (room) {
      setSelectedRoom(room)
      setPricePerNight(room.price_per_night)
    } else {
      setSelectedRoom(null)
      setPricePerNight(0)
    }
  }

  const canGoToNextStep = () => {
    if (step === 1) return !!(guestId || fullName.trim())
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
          check_in: toLocalDateStr(checkInDate),
          check_out: toLocalDateStr(checkOutDate),
          number_of_nights: nights,
          rate_per_night: effectiveRate,
          total_amount: total,
          deposit: isPaid ? total : 0,
          balance: isPaid ? 0 : total,
          payment_status: isPaid ? 'paid' : 'pending',
          status: 'confirmed',
          created_by: user?.id,
          // Store payment method in notes (no payment_method column on bookings table)
          notes: paymentMethod === 'city_ledger'
            ? `City Ledger: ${ledgerAccountName}`
            : `payment_method: ${paymentMethod}`,
        }])
        .select()
        .single()
      if (be) throw be

      // If city ledger, increment the ledger account balance
      if (paymentMethod === 'city_ledger' && ledgerAccount) {
        const { data: acc } = await supabase
          .from('city_ledger_accounts')
          .select('balance')
          .eq('id', ledgerAccount)
          .single()
        await supabase
          .from('city_ledger_accounts')
          .update({ balance: (acc?.balance || 0) + total })
          .eq('id', ledgerAccount)
      }

      await supabase.from('rooms').update({ status: 'occupied' }).eq('id', selectedRoom.id)

      // Insert folio charge (this is what the Transactions page reads from)
      await supabase.from('folio_charges').insert([{
        booking_id: booking.id,
        organization_id: organizationId,
        description: `Initial booking charge - ${nights} night${nights !== 1 ? 's' : ''}`,
        amount: total,
        charge_type: 'room_charge',
        payment_method: paymentMethod,
        ledger_account_id: ledgerAccount || null,
        ledger_account_type: paymentMethod === 'city_ledger' ? 'organization' : null,
        payment_status: isPaid ? 'paid' : 'unpaid',
        created_by: user?.id,
      }])

      // Record in transactions table (legacy)
      await supabase.from('transactions').insert([{
        organization_id: organizationId,
        booking_id: booking.id,
        transaction_id: `TXN-${Date.now().toString(36).toUpperCase()}`,
        guest_name: fullName,
        room: selectedRoom.room_number,
        amount: total,
        payment_method: paymentMethod,
        status: isPaid ? 'completed' : 'pending',
        description: `Booking created - Folio ${folioId}`,
      }])

      // Also record in payments table so Transactions page shows it
      // Record for ALL bookings, regardless of payment status (city_ledger charges still need to appear)
      await supabase.from('payments').insert([{
        organization_id: organizationId,
        booking_id: booking.id,
        guest_id: finalGuestId,
        amount: total,
        payment_method: paymentMethod,
        payment_date: new Date().toISOString(),
        notes: `Booking payment — Folio ${folioId}`,
      }])

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
    const d = new Date(); d.setHours(0, 0, 0, 0)
    setCheckInDate(d); setCheckOutDate(new Date(d.getTime() + 86400000)); setNights(1)
    setSelectedRoomType(''); setSelectedRoom(null); setPricePerNight(0); setCustomPrice(0)
    setPaymentMethod('cash')
    setLedgerSearch(''); setLedgerAccount(''); setLedgerAccountName('')
    setLedgerTab('individual')
    setNewAccountName(''); setNewAccountPhone(''); setNewAccountEmail('')
    setNewAccountAddress(''); setNewAccountCity(''); setNewAccountType('')
  }

  const activeLedgerSource = ledgerTab === 'individual' ? individualAccounts : organizationAccounts

  return (
    <>
      <Dialog open={open} onOpenChange={(o) => { if (!o) { setLoading(false); onClose() } }}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>New Booking — Step {step} of 3</DialogTitle>
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
                    placeholder="Type guest name — existing guests will appear"
                    value={fullName}
                    onChange={(e) => handleGuestSearch(e.target.value)}
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
                {!guestId && fullName.trim() && (
                  <p className="text-xs text-amber-600">New guest will be created: <strong>{fullName}</strong></p>
                )}
              </div>

              <div className="space-y-2">
                <Label>Phone Number</Label>
                <Input placeholder="Phone number (optional)" value={phone} onChange={(e) => setPhone(e.target.value)} disabled={!!guestId} />
              </div>

              <div className="space-y-2">
                <Label>Email</Label>
                <Input type="email" placeholder="Email address" value={email} onChange={(e) => setEmail(e.target.value)} disabled={!!guestId} />
              </div>

              <div className="space-y-2">
                <Label>Address</Label>
                <Input placeholder="Street address" value={address} onChange={(e) => setAddress(e.target.value)} disabled={!!guestId} />
              </div>

              {guestId && (
                <div className="flex items-center justify-between bg-blue-50 border border-blue-200 rounded p-3">
                  <p className="text-sm text-blue-900">Details populated from existing guest record</p>
                  <Button size="sm" variant="ghost" onClick={() => { setGuestId(''); setFullName(''); setPhone(''); setEmail(''); setAddress('') }}>
                    <X className="h-4 w-4" />
                  </Button>
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
                      <Calendar mode="single" selected={checkInDate} onSelect={handleCheckInChange} disabled={(d) => d < new Date(new Date().setHours(0,0,0,0))} />
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
                      <Calendar mode="single" selected={checkOutDate} onSelect={handleCheckOutChange} disabled={(d) => !checkInDate || d <= checkInDate} />
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
                    const n = parseInt(e.target.value)
                    if (!isNaN(n) && n >= 1) handleNightsChange(n)
                  }}
                />
                <p className="text-xs text-muted-foreground">Changing nights will update checkout date automatically</p>
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
                    {Array.from(new Set(rooms.map(r => r.room_type))).length === 0 ? (
                      <SelectItem value="__none__" disabled>No rooms available for selected dates</SelectItem>
                    ) : (
                      Array.from(new Set(rooms.map(r => r.room_type))).map(type => (
                        <SelectItem key={type} value={type}>{type}</SelectItem>
                      ))
                    )}
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
                      <Label>Standard Rate / Night</Label>
                      <div className="px-3 py-2 bg-muted rounded border border-input text-sm font-medium">
                        {formatNaira(pricePerNight)}
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label>Custom Rate / Night (optional)</Label>
                      <Input
                        type="number"
                        placeholder="Leave empty for standard"
                        value={customPrice || ''}
                        onChange={(e) => setCustomPrice(parseFloat(e.target.value) || 0)}
                      />
                    </div>
                  </div>
                  <div className="bg-blue-50 border border-blue-200 p-3 rounded-lg">
                    <p className="text-sm font-medium text-blue-900">Total: {formatNaira((customPrice || pricePerNight) * nights)}</p>
                    <p className="text-xs text-blue-700 mt-1">
                      {nights} nights × {formatNaira(customPrice || pricePerNight)}{customPrice ? ' (custom rate)' : ''}
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
                <div className="space-y-3 rounded-lg border border-input p-4">
                  <div className="flex items-center justify-between">
                    <Label className="text-sm font-semibold">City Ledger Account *</Label>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="h-7 text-xs"
                      onClick={() => {
                        // Pre-populate with Step 1 data for individual, empty for org
                        if (ledgerTab === 'individual') {
                          setNewAccountName(fullName)
                          setNewAccountPhone(phone)
                          setNewAccountEmail(email)
                        } else {
                          setNewAccountName('')
                          setNewAccountPhone('')
                          setNewAccountEmail('')
                        }
                        setNewAccountAddress('')
                        setNewAccountCity('')
                        setNewAccountType('')
                        setNewAccountDialogOpen(true)
                      }}
                    >
                      + New Account
                    </Button>
                  </div>

                  {/* Individual / Organization tabs */}
                  <Tabs value={ledgerTab} onValueChange={handleLedgerTabChange}>
                    <TabsList className="grid w-full grid-cols-2 h-9">
                      <TabsTrigger value="individual" className="text-xs gap-1.5">
                        <Users className="h-3.5 w-3.5" />
                        Individual Guest
                      </TabsTrigger>
                      <TabsTrigger value="organization" className="text-xs gap-1.5">
                        <Building2 className="h-3.5 w-3.5" />
                        Organization
                      </TabsTrigger>
                    </TabsList>
                  </Tabs>

                  {/* Search input */}
                  <div className="relative">
                    <Input
                      placeholder={
                        ledgerTab === 'individual'
                          ? 'Search individual guest accounts...'
                          : 'Search organization accounts...'
                      }
                      value={ledgerSearch}
                      onChange={(e) => handleLedgerSearch(e.target.value)}
                      onFocus={() => {
                        setFilteredLedgerAccounts(
                          ledgerSearch.trim()
                            ? activeLedgerSource.filter(a => a.account_name.toLowerCase().includes(ledgerSearch.toLowerCase()))
                            : activeLedgerSource
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
                      <div className="absolute top-full left-0 right-0 mt-1 bg-background border border-input rounded-md shadow-lg z-50 max-h-52 overflow-y-auto">
                        {filteredLedgerAccounts.length > 0 ? (
                          filteredLedgerAccounts.map(account => (
                            <button
                              key={account.id}
                              className="w-full text-left px-3 py-2.5 hover:bg-accent border-b last:border-b-0 transition-colors text-sm"
                              onMouseDown={(e) => { e.preventDefault(); selectLedgerAccount(account) }}
                            >
                              <div className="font-medium">{account.account_name}</div>
                              <div className="text-xs text-muted-foreground">
                                {account.contact_phone && <span className="mr-3">{account.contact_phone}</span>}
                                Balance: {formatNaira(account.balance || 0)}
                              </div>
                            </button>
                          ))
                        ) : (
                          <div className="px-3 py-3 text-sm text-muted-foreground text-center">
                            {activeLedgerSource.length === 0
                              ? `No ${ledgerTab} accounts yet. Click "+ New Account" to create one.`
                              : 'No matching accounts found'}
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  {ledgerAccount && (
                    <div className="flex items-center gap-2 text-xs text-green-700 bg-green-50 border border-green-200 rounded px-3 py-2">
                      {ledgerTab === 'individual' ? <Users className="h-3.5 w-3.5 flex-shrink-0" /> : <Building2 className="h-3.5 w-3.5 flex-shrink-0" />}
                      <span>Selected: <strong>{ledgerAccountName}</strong></span>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Navigation */}
          <div className="flex justify-between gap-2 pt-4 border-t">
            <Button variant="outline" onClick={() => setStep(s => s - 1)} disabled={step === 1 || loading}>
              <ChevronLeft className="mr-2 h-4 w-4" />
              Previous
            </Button>
            {step < 3 ? (
              <Button onClick={() => setStep(s => s + 1)} disabled={!canGoToNextStep() || loading}>
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
            <DialogTitle>
              {ledgerTab === 'individual' ? 'New Guest Ledger Account' : 'New Organization Ledger Account'}
            </DialogTitle>
            <DialogDescription>
              {ledgerTab === 'individual'
                ? 'Creates a new guest record (same as the guest database). Pre-filled from Step 1 if available.'
                : 'Creates a new organization (same as the Organization menu). Fill in the details below.'}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">

            {/* Individual: same fields as Step 1 guest form */}
            {ledgerTab === 'individual' && (
              <>
                {fullName && newAccountName === fullName && (
                  <div className="bg-blue-50 border border-blue-200 text-blue-800 text-xs rounded px-3 py-2">
                    Pre-filled from Step 1. If this is the same guest, just click Create.
                  </div>
                )}
                <div className="space-y-2">
                  <Label>Full Name *</Label>
                  <Input placeholder="Guest full name" value={newAccountName} onChange={(e) => setNewAccountName(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label>Phone Number *</Label>
                  <Input placeholder="Phone number" value={newAccountPhone} onChange={(e) => setNewAccountPhone(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label>Email (optional)</Label>
                  <Input type="email" placeholder="Email address" value={newAccountEmail} onChange={(e) => setNewAccountEmail(e.target.value)} />
                </div>
              </>
            )}

            {/* Organization: same fields as Organization menu */}
            {ledgerTab === 'organization' && (
              <>
                <div className="space-y-2">
                  <Label>Organization Name *</Label>
                  <Input placeholder="e.g. Federal Ministry of Health" value={newAccountName} onChange={(e) => setNewAccountName(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label>Email *</Label>
                  <Input type="email" placeholder="organization@email.com" value={newAccountEmail} onChange={(e) => setNewAccountEmail(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label>Phone (optional)</Label>
                  <Input placeholder="Phone number" value={newAccountPhone} onChange={(e) => setNewAccountPhone(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label>Address (optional)</Label>
                  <Input placeholder="Street address" value={newAccountAddress} onChange={(e) => setNewAccountAddress(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label>City (optional)</Label>
                  <Input placeholder="City" value={newAccountCity} onChange={(e) => setNewAccountCity(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label>Organization Type (optional)</Label>
                  <Select value={newAccountType} onValueChange={setNewAccountType}>
                    <SelectTrigger><SelectValue placeholder="Select type" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="government">Government</SelectItem>
                      <SelectItem value="ngo">NGO / Non-profit</SelectItem>
                      <SelectItem value="private">Private Company</SelectItem>
                      <SelectItem value="other">Other</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </>
            )}

            <div className="flex gap-3 justify-end pt-2">
              <Button variant="outline" onClick={() => setNewAccountDialogOpen(false)}>Cancel</Button>
              <Button onClick={handleCreateNewAccount} disabled={newAccountCreating}>
                {newAccountCreating ? 'Creating...' : 'Create Account'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}
