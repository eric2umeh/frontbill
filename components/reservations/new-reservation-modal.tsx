'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { addDays, differenceInDays, format } from 'date-fns'
import { Plus, X, Loader2 } from 'lucide-react'
import { formatNaira } from '@/lib/utils/currency'
import { toast } from 'sonner'
import { isOrganizationMenuRecord, isSelectableLedgerName } from '@/lib/utils/ledger-organization'
import { resolveOrganizationLedgerAccount } from '@/lib/utils/resolve-ledger-account'
import { formatPersonName } from '@/lib/utils/name-format'
import { StayDateRangeFields } from '@/components/shared/stay-date-range-fields'
import { BOOKING_MODAL_ROOMS_LIMIT, isRoomAssignable, normalizeRoomsForBookingPickers } from '@/lib/utils/room-bookability'
import { Checkbox } from '@/components/ui/checkbox'
import { applyPaymentToGuestCityLedger } from '@/lib/utils/guest-city-ledger'

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

interface NewReservationModalProps {
  open: boolean
  onClose: () => void
  onSuccess?: () => void
}

export function NewReservationModal({ open, onClose, onSuccess }: NewReservationModalProps) {
  const [loading, setLoading] = useState(false)
  const [orgId, setOrgId] = useState('')
  const [currentUserId, setCurrentUserId] = useState('')
  const [currentUserRole, setCurrentUserRole] = useState('')

  // Step 1: Guest
  const [fullName, setFullName] = useState('')
  const [phone, setPhone] = useState('')
  const [email, setEmail] = useState('')
  const [address, setAddress] = useState('')
  const [guestId, setGuestId] = useState('')
  const [guests, setGuests] = useState<any[]>([])
  const [filteredGuests, setFilteredGuests] = useState<any[]>([])
  const [guestSearchOpen, setGuestSearchOpen] = useState(false)

  // Step 2: Dates
  const [checkInDate, setCheckInDate] = useState<Date>()
  const [checkOutDate, setCheckOutDate] = useState<Date>()
  const [nights, setNights] = useState(0)
  const [backdateReason, setBackdateReason] = useState('')

  // Step 3: Room & Payment
  const [rooms, setRooms] = useState<any[]>([])
  const [allBookings, setAllBookings] = useState<any[]>([]) // for date-based availability
  const [selectedRoomType, setSelectedRoomType] = useState('')
  const [selectedRoom, setSelectedRoom] = useState<any>(null)
  const [pricePerNight, setPricePerNight] = useState(0)
  const [customPrice, setCustomPrice] = useState<number | ''>('')
  // Payment
  const [paymentMethod, setPaymentMethod] = useState<'cash' | 'pos' | 'card' | 'transfer' | 'city_ledger'>('cash')
  const [paymentStatus, setPaymentStatus] = useState<'paid' | 'partial' | 'unpaid'>('paid')
  const [partialAmount, setPartialAmount] = useState<number | ''>('')
  const [payAboveRoomTotal, setPayAboveRoomTotal] = useState(false)
  // City Ledger sub-fields
  const [ledgerType, setLedgerType] = useState<'individual' | 'organization'>('individual')
  const [ledgerSearch, setLedgerSearch] = useState('')
  const [ledgerResults, setLedgerResults] = useState<any[]>([])
  const [ledgerSearchOpen, setLedgerSearchOpen] = useState(false)
  const [selectedLedger, setSelectedLedger] = useState<any>(null)
  // Inline new org form for city ledger
  const [showNewLedgerOrgForm, setShowNewLedgerOrgForm] = useState(false)
  const [newLedgerOrgName, setNewLedgerOrgName] = useState('')
  const [newLedgerOrgEmail, setNewLedgerOrgEmail] = useState('')
  const [newLedgerOrgPhone, setNewLedgerOrgPhone] = useState('')
  const [newLedgerOrgAddress, setNewLedgerOrgAddress] = useState('')
  const [creatingLedgerOrg, setCreatingLedgerOrg] = useState(false)

  useEffect(() => {
    if (open) {
      loadData()
      // Set default dates: today for check-in, tomorrow for check-out
      const todayDate = today()
      setCheckInDate(todayDate)
      setCheckOutDate(addDays(todayDate, 1))
      setNights(1)
    } else {
      // Reset loading state when modal closes
      setLoading(false)
      resetForm()
    }
  }, [open])

  const loadData = async () => {
    try {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      setCurrentUserId(user.id)
      const { data: profile } = await supabase.from('profiles').select('organization_id, role').eq('id', user.id).single()
      if (!profile?.organization_id) return
      setOrgId(profile.organization_id)
      setCurrentUserRole(profile.role || '')

      const [{ data: guestData }, { data: roomData }, { data: bookingData }] = await Promise.all([
        supabase.from('guests').select('id, name, phone, email, address').eq('organization_id', profile.organization_id).order('name'),
        supabase.from('rooms').select('id, room_number, room_type, price_per_night, status').eq('organization_id', profile.organization_id).order('room_number').limit(BOOKING_MODAL_ROOMS_LIMIT),
        // Fetch active bookings to check date availability
        supabase.from('bookings').select('room_id, check_in, check_out').eq('organization_id', profile.organization_id).in('status', ['confirmed', 'reserved', 'checked_in']).limit(BOOKING_MODAL_ROOMS_LIMIT),
      ])
      setGuests(guestData || [])
      setRooms(normalizeRoomsForBookingPickers(roomData) as any[])
      setAllBookings(bookingData || [])
    } catch {
      toast.error('Failed to load data')
    } finally {
      setLoading(false)
    }
  }

  // Guest search in Step 1
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
    setEmail(guest.email || '')
    setAddress(guest.address || '')
    setGuestSearchOpen(false)
  }

  // City Ledger account search — filtered by type (individual / organization)
  const searchLedger = async (term: string) => {
    setLedgerSearch(term)
    setSelectedLedger(null)
    if (!term.trim()) { setLedgerResults([]); setLedgerSearchOpen(false); return }
    const supabase = createClient()

    // Re-fetch orgId from profile in case state hasn't populated yet
    let effectiveOrgId = orgId
    if (!effectiveOrgId) {
      const { data: { user } } = await supabase.auth.getUser()
      if (user) {
        const { data: profile } = await supabase.from('profiles').select('organization_id').eq('id', user.id).single()
        effectiveOrgId = profile?.organization_id || ''
        if (effectiveOrgId) setOrgId(effectiveOrgId)
      }
    }
    if (!effectiveOrgId) return

    // Query both city_ledger_accounts AND organizations table (same as new-booking-modal)
    const [{ data: ledgerData }, { data: orgTableData }] = await Promise.all([
      supabase
        .from('city_ledger_accounts')
        .select('id, account_name, account_type, contact_phone, balance')
        .eq('organization_id', effectiveOrgId)
        .ilike('account_name', `%${term}%`)
        .limit(10),
      ledgerType === 'organization'
        ? supabase
            .from('organizations')
            .select('id, name, phone, org_type, created_by')
            .neq('id', effectiveOrgId)
            .ilike('name', `%${term}%`)
            .limit(5)
        : Promise.resolve({ data: [] }),
    ])

    const fromLedger = (ledgerData || [])
      .filter((d: any) => ledgerType === 'individual'
        ? ['individual', 'guest'].includes(d.account_type) && isSelectableLedgerName(d.account_name)
        : ['organization', 'corporate'].includes(d.account_type) && isSelectableLedgerName(d.account_name))
      .map((d: any) => ({ ...d, name: d.account_name, source: 'city_ledger' as const }))

    const fromOrgs = ledgerType === 'organization'
      ? (orgTableData || [])
          .filter((o: any) => isOrganizationMenuRecord(o) && !fromLedger.some((l: any) => l.name.toLowerCase() === o.name.toLowerCase()))
          .map((o: any) => ({
            id: o.id,
            name: o.name,
            account_name: o.name,
            account_type: 'organization' as const,
            contact_phone: o.phone || '',
            balance: 0,
            source: 'organizations' as const,
          }))
      : []

    const combined = [...fromLedger, ...fromOrgs]
    setLedgerResults(combined)
    setLedgerSearchOpen(combined.length > 0)
  }

  const createNewLedgerOrg = async () => {
    if (!newLedgerOrgName.trim()) { toast.error('Name required'); return }
    setCreatingLedgerOrg(true)
    try {
      const supabase = createClient()
      const { data, error } = await supabase
        .from('city_ledger_accounts')
        .insert([{
          organization_id: orgId,
          account_name: newLedgerOrgName.trim(),
          account_type: ledgerType === 'individual' ? 'individual' : 'organization',
          contact_phone: newLedgerOrgPhone.trim() || null,
          balance: 0,
        }])
        .select().single()
      if (error) throw error
      setSelectedLedger({ ...data, name: data.account_name, source: 'city_ledger' })
      setLedgerSearch(data.account_name)
      setShowNewLedgerOrgForm(false)
      setNewLedgerOrgName(''); setNewLedgerOrgEmail(''); setNewLedgerOrgPhone(''); setNewLedgerOrgAddress('')
      toast.success(`"${data.account_name}" created and selected`)
    } catch (err: any) {
      toast.error(err.message || 'Failed to create account')
    } finally {
      setCreatingLedgerOrg(false)
    }
  }

  const selectLedgerAccount = async (account: any) => {
    try {
      const supabase = createClient()
      const resolved = ledgerType === 'organization'
        ? await resolveOrganizationLedgerAccount(supabase, orgId, account)
        : account
      setSelectedLedger(resolved)
      setLedgerSearch(resolved.name || resolved.account_name)
      setLedgerSearchOpen(false)
    } catch (err: any) {
      toast.error(err.message || 'Failed to select account')
    }
  }

  // Filter available rooms for selected dates — exclude rooms booked for overlapping dates
  const getAvailableRoomsForType = (roomType: string) => {
    const roomsOfType = rooms.filter(r => r.room_type === roomType)
    if (!checkInDate || !checkOutDate) return roomsOfType
    const cin = toLocalDateStr(checkInDate)
    const cout = toLocalDateStr(checkOutDate)
    // A room is booked if any existing booking overlaps: existing.check_in < newCheckOut AND existing.check_out > newCheckIn
    const bookedRoomIds = new Set(
      allBookings
        .filter(b => b.check_in < cout && b.check_out > cin)
        .map(b => b.room_id)
    )
    return roomsOfType.filter((r) => isRoomAssignable(r.status) && !bookedRoomIds.has(r.id))
  }

  const handleStayDatesChange = (from: Date, to: Date | undefined) => {
    setCheckInDate(from)
    if (to) {
      setCheckOutDate(to)
      setNights(Math.max(0, differenceInDays(to, from)))
      setSelectedRoom(null)
      setSelectedRoomType('')
    } else {
      setCheckOutDate(undefined)
      setNights(0)
      setSelectedRoom(null)
      setSelectedRoomType('')
    }
  }

  const handleNightsChange = (value: number) => {
    const n = Math.max(1, value || 1)
    setNights(n)
    if (checkInDate) {
      setCheckOutDate(addDays(checkInDate, n))
      setSelectedRoom(null)
      setSelectedRoomType('')
    }
  }

  const handleRoomTypeSelect = (roomType: string) => {
    setSelectedRoomType(roomType)
    const room = rooms.find(r => r.room_type === roomType)
    if (room) { setSelectedRoom(room); setPricePerNight(room.price_per_night) }
    else { setSelectedRoom(null); setPricePerNight(0) }
  }

  const canSubmitForm = () => {
    if (!(guestId || fullName.trim())) return false
    if (!(checkInDate && checkOutDate && nights > 0)) return false
    if (!selectedRoom) return false
    if (paymentMethod === 'city_ledger' && !selectedLedger) return false
    return true
  }

  const effectiveRate = (customPrice !== '' ? Number(customPrice) : pricePerNight) || 0
  const totalAmount = effectiveRate * nights
  // For cash/POS/card/transfer: full payment received (deposit = total, balance = 0)
  // For city_ledger: deferred payment (deposit = 0, balance = total)
  const isCityLedgerPayment = paymentMethod === 'city_ledger'
  const rawPaid = Number(partialAmount) || 0
  let depositCalc = 0
  if (!isCityLedgerPayment) {
    if (paymentStatus === 'paid') {
      depositCalc = payAboveRoomTotal ? Math.max(totalAmount, rawPaid || totalAmount) : totalAmount
    } else if (paymentStatus === 'partial') {
      depositCalc = payAboveRoomTotal ? Math.max(0, rawPaid) : Math.min(rawPaid, totalAmount)
    }
  }
  const depositAmount = isCityLedgerPayment ? 0 : depositCalc
  const balanceAmount = Math.max(0, totalAmount - depositAmount)
  const isSuperadmin = currentUserRole === 'superadmin'
  const isBackdated = checkInDate ? checkInDate < today() : false

  const hasApprovedBackdateRequest = async () => {
    if (!checkInDate) return false
    const res = await fetch(`/api/backdate-requests?caller_id=${currentUserId}`, { credentials: 'include' })
    const json = await res.json()
    if (!res.ok) return false
    return (json.requests || []).some((request: any) =>
      request.status === 'approved'
      && request.request_type === 'reservation'
      && request.requested_check_in === toLocalDateStr(checkInDate)
      && (!checkOutDate || request.requested_check_out === toLocalDateStr(checkOutDate))
    )
  }

  const handleRequestBackdate = async () => {
    if (!checkInDate) { toast.error('Select a backdated check-in date'); return }
    if (!backdateReason.trim()) { toast.error('Enter a reason for the superadmin'); return }
    setLoading(true)
    try {
      const res = await fetch('/api/backdate-requests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          caller_id: currentUserId,
          request_type: 'reservation',
          requested_check_in: toLocalDateStr(checkInDate),
          requested_check_out: checkOutDate ? toLocalDateStr(checkOutDate) : null,
          reason: backdateReason,
          metadata: { guest_name: fullName || guestId, room_id: selectedRoom?.id || null },
        }),
      })
      const json = await res.json()
      if (!res.ok) { toast.error(json.error || 'Failed to send backdate request'); return }
      toast.success('Backdate request sent to superadmin')
      setBackdateReason('')
    } catch {
      toast.error('Failed to send backdate request')
    } finally {
      setLoading(false)
    }
  }

  const handleBackdatedReservationAction = async () => {
    if (await hasApprovedBackdateRequest()) {
      await handleSubmit()
      return
    }
    await handleRequestBackdate()
  }

  const handleSubmit = async () => {
    if (!checkInDate || !checkOutDate) { toast.error('Dates required'); return }
    if (isBackdated && !isSuperadmin && !(await hasApprovedBackdateRequest())) {
      toast.error('Backdated reservations require superadmin approval. Send a request first.')
      return
    }
    if (!selectedRoom) { toast.error('Room required'); return }
    if (selectedRoom.status && String(selectedRoom.status).toLowerCase().trim() === 'maintenance') {
      toast.error('Selected room is under maintenance — pick another')
      return
    }
    if (paymentMethod === 'city_ledger' && !selectedLedger) {
      toast.error('Please select a city ledger account')
      return
    }
    if (paymentStatus === 'partial' && depositAmount <= 0) {
      toast.error('Please enter the amount paid')
      return
    }

    try {
      setLoading(true)
      const supabase = createClient()

      const formattedGuestName = formatPersonName(fullName)
      let finalGuestId = guestId
      if (!guestId) {
        const { data: newGuest, error: ge } = await supabase
          .from('guests')
          .insert([{ organization_id: orgId, name: formattedGuestName, phone, email: email || null, address: address || null }])
          .select().single()
        if (ge) throw ge
        finalGuestId = newGuest.id

        // Auto-create city_ledger_account for this guest to prevent duplicates when city ledger is used later
        await supabase.from('city_ledger_accounts').insert([{
          organization_id: orgId,
          account_name: formattedGuestName,
          account_type: 'individual',
          contact_phone: phone || null,
          contact_email: email || null,
          balance: 0,
        }])
      }

      const isCityLedger = paymentMethod === 'city_ledger'
      const folioId = `RES-${Date.now().toString(36).toUpperCase()}`
      const bookingPaymentStatus = isCityLedger ? 'pending' : balanceAmount <= 0 ? 'paid' : depositAmount > 0 ? 'partial' : 'pending'

      const { data: booking, error: be } = await supabase
        .from('bookings')
        .insert([{
          organization_id: orgId,
          guest_id: finalGuestId,
          room_id: selectedRoom.id,
          folio_id: folioId,
          check_in: toLocalDateStr(checkInDate),
          check_out: toLocalDateStr(checkOutDate),
          number_of_nights: nights,
          rate_per_night: effectiveRate,
          total_amount: totalAmount,
          deposit: depositAmount,
          balance: balanceAmount,
          payment_status: bookingPaymentStatus,
          status: 'reserved',
          created_by: currentUserId,
          notes: isCityLedger
            ? `City Ledger: ${selectedLedger?.account_name || selectedLedger?.name}`
            : `payment_method: ${paymentMethod}`,
        }])
        .select().single()
      if (be) throw be

      await supabase.from('rooms').update({ status: 'reserved', updated_by: currentUserId, updated_at: new Date().toISOString() }).eq('id', selectedRoom.id)

      // If city ledger: update account + guest/org profile balance
      if (isCityLedger && selectedLedger?.id) {
        const { data: acc } = await supabase
          .from('city_ledger_accounts').select('balance, account_type').eq('id', selectedLedger.id).single()
        await supabase
          .from('city_ledger_accounts')
          .update({ balance: (acc?.balance || 0) + balanceAmount })
          .eq('id', selectedLedger.id)

        const acctType = acc?.account_type || ledgerType
        if (acctType === 'individual' || acctType === 'guest') {
          if (finalGuestId) {
            const { data: guestRow } = await supabase.from('guests').select('balance').eq('id', finalGuestId).single()
            await supabase.from('guests')
              .update({ balance: ((guestRow?.balance as number) || 0) + balanceAmount })
              .eq('id', finalGuestId)
          }
        } else {
          const { data: orgRow } = await supabase.from('organizations').select('current_balance').eq('id', selectedLedger.id).single()
          if (orgRow) {
            await supabase.from('organizations')
              .update({ current_balance: ((orgRow.current_balance as number) || 0) + balanceAmount })
              .eq('id', selectedLedger.id)
          }
        }
      }

      // Insert folio charge (this is what the Transactions page reads from)
      await supabase.from('folio_charges').insert([{
        booking_id: booking.id,
        organization_id: orgId,
        description: `Reservation charge - ${nights} night${nights !== 1 ? 's' : ''}`,
        amount: totalAmount,
        charge_type: 'reservation',
        payment_method: isCityLedger ? 'city_ledger' : paymentMethod,
        ledger_account_id: isCityLedger && selectedLedger ? selectedLedger.id : null,
        ledger_account_type: isCityLedger ? ledgerType : null,
        payment_status: bookingPaymentStatus === 'paid' ? 'paid' : 'unpaid',
        created_by: currentUserId,
      }])

      if (depositAmount > 0 && balanceAmount > 0) {
        await supabase.from('folio_charges').insert([{
          booking_id: booking.id,
          organization_id: orgId,
          description: `Reservation payment - ${paymentMethod}`,
          amount: -depositAmount,
          charge_type: 'payment',
          payment_method: paymentMethod,
          payment_status: 'paid',
          created_by: currentUserId,
        }])
      }

      // Record in transactions table
      await supabase.from('transactions').insert([{
        organization_id: orgId,
        booking_id: booking.id,
        transaction_id: `TXN-${Date.now().toString(36).toUpperCase()}`,
        guest_name: formattedGuestName,
        room: selectedRoom.room_number,
        amount: totalAmount,
        payment_method: isCityLedger ? 'city_ledger' : paymentMethod,
        status: bookingPaymentStatus,
        description: `Reservation — ${folioId}`,
        received_by: currentUserId,
      }])

      // Always insert into payments table so Transactions page shows ALL transactions
      // This includes both paid and unpaid/pending reservations
      const paidAmount = depositAmount
      if (paidAmount > 0 || isCityLedger) {
        await supabase.from('payments').insert([{
          organization_id: orgId,
          booking_id: booking.id,
          guest_id: finalGuestId,
          amount: paidAmount || totalAmount,
          payment_method: isCityLedger ? 'city_ledger' : paymentMethod,
          payment_date: new Date().toISOString(),
          notes: `Reservation payment — Folio ${folioId}`,
          received_by: currentUserId || null,
        }])
      }

      const prepayExcess = Math.max(0, depositAmount - totalAmount)
      if (!isCityLedger && prepayExcess > 0 && finalGuestId) {
        const { data: gRow } = await supabase.from('guests').select('name').eq('id', finalGuestId).maybeSingle()
        const ledgerName = (gRow?.name || formattedGuestName).trim()
        if (ledgerName) {
          await applyPaymentToGuestCityLedger(supabase, {
            organizationId: orgId,
            guestName: ledgerName,
            paymentAmount: prepayExcess,
            createIfMissingExcess: prepayExcess,
          })
        }
      }

      toast.success(`Reservation created — Ref: ${folioId}`)
      onSuccess?.()
      onClose()
      resetForm()
    } catch (err: any) {
      toast.error(err.message || 'Failed to create reservation')
    } finally {
      setLoading(false)
    }
  }

  const resetForm = () => {
    setFullName(''); setPhone(''); setEmail(''); setAddress(''); setGuestId('')
    const d = new Date(); d.setHours(0, 0, 0, 0)
    setCheckInDate(d); setCheckOutDate(addDays(d, 1)); setNights(1); setBackdateReason('')
    setSelectedRoomType(''); setSelectedRoom(null); setPricePerNight(0); setCustomPrice('')
    setPaymentMethod('cash'); setPaymentStatus('paid'); setPartialAmount(''); setPayAboveRoomTotal(false)
    setLedgerType('individual'); setLedgerSearch(''); setLedgerResults([])
    setSelectedLedger(null); setLedgerSearchOpen(false)
    setShowNewLedgerOrgForm(false); setNewLedgerOrgName(''); setNewLedgerOrgEmail(''); setNewLedgerOrgPhone(''); setNewLedgerOrgAddress('')
  }

  // Combined room dropdown: each item shows "Room Type — Room Number"
  const availableRoomOptions = rooms.filter(r => {
    if (!checkInDate || !checkOutDate) return true
    const cin = toLocalDateStr(checkInDate)
    const cout = toLocalDateStr(checkOutDate)
    const bookedIds = new Set(allBookings.filter(b => b.check_in < cout && b.check_out > cin).map(b => b.room_id))
    return isRoomAssignable(r.status) && !bookedIds.has(r.id)
  })

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) { setLoading(false); onClose() } }}>
      <DialogContent className="max-w-2xl max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>New Reservation</DialogTitle>
          <DialogDescription>Fill in guest details, dates, room and payment</DialogDescription>
        </DialogHeader>

        <div className="space-y-5 py-2">

          {/* Guest Information */}
          <div className="rounded-lg border p-4 space-y-4">
            <p className="text-sm font-semibold">Guest Information</p>
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
                  <div className="absolute top-full left-0 right-0 mt-1 bg-background border rounded-md shadow-lg z-50 max-h-56 overflow-y-auto">
                    {filteredGuests.map(g => (
                      <button key={g.id} className="w-full text-left px-4 py-3 hover:bg-accent border-b last:border-b-0" onMouseDown={(e) => { e.preventDefault(); selectGuest(g) }}>
                        <div className="font-medium text-sm">{g.name}</div>
                        <div className="text-xs text-muted-foreground">{g.phone}</div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
              {guestId && <p className="text-xs text-green-600">Existing guest selected: <strong>{fullName}</strong></p>}
              {!guestId && fullName.trim() && <p className="text-xs text-amber-600">New guest will be created: <strong>{fullName}</strong></p>}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Phone</Label>
                <Input placeholder="Phone number" value={phone} onChange={(e) => setPhone(e.target.value)} disabled={!!guestId} />
              </div>
              <div className="space-y-2">
                <Label>Email</Label>
                <Input type="email" placeholder="Email address" value={email} onChange={(e) => setEmail(e.target.value)} disabled={!!guestId} />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Address</Label>
              <Input placeholder="Street address" value={address} onChange={(e) => setAddress(e.target.value)} disabled={!!guestId} />
            </div>
          </div>

          {/* Dates */}
          <div className="rounded-lg border p-4 space-y-4">
            <p className="text-sm font-semibold">Stay Dates</p>
            <StayDateRangeFields
              layout="inline"
              checkIn={checkInDate}
              checkOut={checkOutDate}
              nights={nights}
              onDatesChange={handleStayDatesChange}
              onNightsChange={handleNightsChange}
              showNights
              disableCalendar={(d) => !!(checkInDate && !checkOutDate && d <= checkInDate)}
            />
            {checkInDate && checkOutDate && nights > 0 && (
              <div className="p-3 rounded-lg bg-muted text-sm">
                <span className="text-muted-foreground">Duration: </span><span className="font-semibold">{nights} night(s) · {format(checkInDate, 'dd MMM')} — {format(checkOutDate, 'dd MMM yyyy')}</span>
              </div>
            )}
            {isBackdated && !isSuperadmin && (
              <div className="space-y-2 rounded-md border border-amber-200 bg-amber-50 p-3">
                <Label>Reason for Backdate Request *</Label>
                <Textarea
                  value={backdateReason}
                  onChange={(e) => setBackdateReason(e.target.value)}
                  placeholder="Explain why this reservation must be backdated for superadmin approval"
                />
                <p className="text-xs text-amber-700">Only a superadmin can approve or directly create backdated reservations.</p>
              </div>
            )}
          </div>

          {/* Room — combined type + number */}
          <div className="rounded-lg border p-4 space-y-4">
            <p className="text-sm font-semibold">Room Selection</p>
            <div className="space-y-2">
              <Label>Room *</Label>
              <Select
                value={selectedRoom?.id ?? ''}
                onValueChange={(id) => {
                  const r = availableRoomOptions.find(x => x.id === id)
                  if (r) { setSelectedRoom(r); setSelectedRoomType(r.room_type); setPricePerNight(r.price_per_night) }
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder={availableRoomOptions.length === 0 ? 'No rooms available for selected dates' : 'Select room type and number'} />
                </SelectTrigger>
                <SelectContent>
                  {availableRoomOptions.length === 0 ? (
                    <SelectItem value="__none__" disabled>No rooms available</SelectItem>
                  ) : (
                    availableRoomOptions.map(r => (
                      <SelectItem key={r.id} value={r.id}>
                        {r.room_type} — Room {r.room_number}
                      </SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Custom Rate (optional — overrides room rate)</Label>
              <Input type="number" placeholder="Leave blank to use room rate" value={customPrice} onChange={(e) => setCustomPrice(e.target.value === '' ? '' : Number(e.target.value))} />
            </div>

            {selectedRoom && nights > 0 && (
              <div className="p-3 rounded-lg bg-muted space-y-1 text-sm border">
                <div className="flex justify-between font-semibold">
                  <span>Total Amount</span>
                  <span>{formatNaira(totalAmount)}</span>
                </div>
                <p className="text-xs text-muted-foreground">{nights} night(s) × {formatNaira(effectiveRate)}/night</p>
              </div>
            )}
          </div>

          {/* Payment */}
          <div className="rounded-lg border p-4 space-y-4">
            <p className="text-sm font-semibold">Payment</p>
            {paymentMethod !== 'city_ledger' && (
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label>Payment Status</Label>
                  <Select value={paymentStatus} onValueChange={(v: 'paid' | 'partial' | 'unpaid') => setPaymentStatus(v)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="paid">Full Payment</SelectItem>
                      <SelectItem value="partial">Partial Payment</SelectItem>
                      <SelectItem value="unpaid">No Payment Yet</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Amount Paid</Label>
                  <Input
                    type="number"
                    min="0"
                    max={paymentStatus === 'partial' && !payAboveRoomTotal ? totalAmount : undefined}
                    value={paymentStatus === 'paid' && !payAboveRoomTotal ? totalAmount || '' : partialAmount}
                    onChange={(e) => setPartialAmount(e.target.value === '' ? '' : Number(e.target.value))}
                    disabled={paymentStatus === 'unpaid' || (paymentStatus === 'paid' && !payAboveRoomTotal)}
                    placeholder="Enter paid amount"
                  />
                </div>
              </div>
            )}
            {paymentMethod !== 'city_ledger' && (
              <div className="flex items-start gap-2 rounded-md border border-input p-3">
                <Checkbox
                  id="res-pay-above-total"
                  checked={payAboveRoomTotal}
                  onCheckedChange={(c) => {
                    const v = Boolean(c)
                    setPayAboveRoomTotal(v)
                    if (v && paymentStatus === 'paid') {
                      setPartialAmount(prev => {
                        const n = typeof prev === 'number' ? prev : 0
                        return n >= totalAmount ? n : totalAmount
                      })
                    }
                  }}
                />
                <Label htmlFor="res-pay-above-total" className="text-sm font-normal leading-snug cursor-pointer">
                  Guest is paying more than the room total — save the excess as city ledger credit for future stays or incidentals.
                </Label>
              </div>
            )}
            <div className="space-y-2">
              <Label>Payment Method</Label>
              <Select value={paymentMethod} onValueChange={(v: any) => {
                setPaymentMethod(v)
                if (v !== 'city_ledger') setSelectedLedger(null)
                else setPayAboveRoomTotal(false)
              }}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="cash">Cash</SelectItem>
                  <SelectItem value="pos">POS</SelectItem>
                  <SelectItem value="card">Card</SelectItem>
                  <SelectItem value="transfer">Transfer</SelectItem>
                  <SelectItem value="city_ledger">City Ledger (bill to account)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {paymentMethod === 'city_ledger' && (
              <div className="space-y-3 p-3 border rounded-lg bg-muted/30">
                <Label className="text-sm font-medium">City Ledger Account</Label>
                <div className="flex gap-2">
                  <Button type="button" size="sm" variant={ledgerType === 'individual' ? 'default' : 'outline'} onClick={() => { setLedgerType('individual'); setLedgerSearch(''); setLedgerResults([]); setSelectedLedger(null); setShowNewLedgerOrgForm(false) }}>Individual</Button>
                  <Button type="button" size="sm" variant={ledgerType === 'organization' ? 'default' : 'outline'} onClick={() => { setLedgerType('organization'); setLedgerSearch(''); setLedgerResults([]); setSelectedLedger(null); setShowNewLedgerOrgForm(false) }}>Organization</Button>
                </div>
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <Input placeholder={ledgerType === 'individual' ? 'Search guest...' : 'Search organization...'} value={ledgerSearch} onChange={(e) => searchLedger(e.target.value)} onBlur={() => setTimeout(() => setLedgerSearchOpen(false), 150)} />
                    {ledgerSearchOpen && ledgerResults.length > 0 && (
                      <div className="absolute top-full left-0 right-0 mt-1 bg-background border rounded-md shadow-lg z-50 max-h-48 overflow-y-auto">
                        {ledgerResults.map((r: any) => (
                          <button key={`${r.source || 'account'}-${r.id}`} className="w-full text-left px-4 py-2 hover:bg-accent border-b last:border-b-0 text-sm" onMouseDown={(e) => { e.preventDefault(); selectLedgerAccount(r) }}>
                            <div className="font-medium">{r.name || r.account_name}</div>
                            <div className="text-xs text-muted-foreground">{r.phone || r.contact_phone}</div>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                  <Button type="button" size="sm" variant="outline" className="gap-1 whitespace-nowrap" onClick={() => setShowNewLedgerOrgForm(v => !v)}>
                      <Plus className="h-3 w-3" /> New
                  </Button>
                </div>
                {ledgerType === 'organization' && (
                  <p className="text-xs text-muted-foreground">
                    Search organizations created from the Organizations menu or city ledger organization accounts. Use New to create one here.
                  </p>
                )}
                {showNewLedgerOrgForm && (
                  <div className="border rounded-md p-3 space-y-2 bg-background">
                    <p className="text-xs font-medium text-muted-foreground">Create new {ledgerType} account</p>
                    <Input placeholder={ledgerType === 'individual' ? 'Individual name' : 'Organization name'} value={newLedgerOrgName} onChange={(e) => setNewLedgerOrgName(e.target.value)} />
                    <Input placeholder="Phone (optional)" value={newLedgerOrgPhone} onChange={(e) => setNewLedgerOrgPhone(e.target.value)} />
                    <div className="flex gap-2">
                      <Button size="sm" onClick={createNewLedgerOrg} disabled={creatingLedgerOrg || !newLedgerOrgName.trim()}>{creatingLedgerOrg ? 'Creating...' : 'Create'}</Button>
                      <Button size="sm" variant="outline" onClick={() => setShowNewLedgerOrgForm(false)}>Cancel</Button>
                    </div>
                  </div>
                )}
                {selectedLedger && (
                  <div className="flex items-center justify-between p-2 rounded border bg-background text-sm">
                    <span className="font-medium">{selectedLedger.name || selectedLedger.account_name}</span>
                    <Button variant="ghost" size="sm" className="text-destructive h-6 text-xs" onClick={() => { setSelectedLedger(null); setLedgerSearch('') }}>Remove</Button>
                  </div>
                )}
              </div>
            )}

            {selectedRoom && nights > 0 && (
              <div className="p-3 rounded-lg bg-muted space-y-1 text-sm border">
                {depositAmount > 0 && <div className="flex justify-between text-green-700"><span>Amount Paid</span><span>{formatNaira(depositAmount)}</span></div>}
                {balanceAmount > 0 && <div className="flex justify-between text-orange-700 font-medium"><span>Balance Due</span><span>{formatNaira(balanceAmount)}</span></div>}
                <div className="flex justify-between items-center pt-1">
                  <span className="text-muted-foreground">Method</span>
                  <Badge variant="outline">{paymentMethod.replace('_', ' ')}</Badge>
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="flex justify-end gap-2 pt-4 border-t">
          <Button variant="outline" onClick={onClose} disabled={loading}>Cancel</Button>
          <Button
            onClick={isBackdated && !isSuperadmin ? handleBackdatedReservationAction : handleSubmit}
            disabled={loading || !canSubmitForm()}
          >
            {loading ? 'Working...' : isBackdated && !isSuperadmin ? 'Request / Use Superadmin Approval' : 'Create Reservation'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
