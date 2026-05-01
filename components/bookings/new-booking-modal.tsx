'use client'

// Cache bust marker: 2025-02-25-final-fix
import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { addDays, differenceInCalendarDays } from 'date-fns'
import { X, Users, Building2 } from 'lucide-react'
import { formatNaira } from '@/lib/utils/currency'
import { toast } from 'sonner'
import { isOrganizationMenuRecord, isSelectableLedgerName } from '@/lib/utils/ledger-organization'
import { resolveOrganizationLedgerAccount } from '@/lib/utils/resolve-ledger-account'
import { formatPersonName } from '@/lib/utils/name-format'
import { StayDateRangeFields } from '@/components/shared/stay-date-range-fields'
import { useAuth } from '@/lib/auth-context'

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
  status?: string
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
  const [loading, setLoading] = useState(false)
  const [organizationId, setOrganizationId] = useState('')
  const { userId, role } = useAuth()

  // Guest
  const [fullName, setFullName] = useState('')
  const [phone, setPhone] = useState('')
  const [email, setEmail] = useState('')
  const [address, setAddress] = useState('')
  const [guestId, setGuestId] = useState('')
  const [guestSearchOpen, setGuestSearchOpen] = useState(false)
  const [guests, setGuests] = useState<Guest[]>([])
  const [filteredGuests, setFilteredGuests] = useState<Guest[]>([])

  // Dates
  const [checkInDate, setCheckInDate] = useState<Date>(() => {
    const d = new Date(); d.setHours(0, 0, 0, 0); return d
  })
  const [checkOutDate, setCheckOutDate] = useState<Date | undefined>(() => {
    const d = new Date(); d.setHours(0, 0, 0, 0); return new Date(d.getTime() + 86400000)
  })
  const [nights, setNights] = useState(1)
  const [backdateReason, setBackdateReason] = useState('')

  // Room & Payment
  const [rooms, setRooms] = useState<Room[]>([]) // date-filtered available rooms
  const [allRooms, setAllRooms] = useState<Room[]>([]) // all non-maintenance rooms
  const [allBookingsForRooms, setAllBookingsForRooms] = useState<any[]>([]) // active bookings for date check
  const [selectedRoomType, setSelectedRoomType] = useState('')
  const [selectedRoom, setSelectedRoom] = useState<Room | null>(null)
  const [pricePerNight, setPricePerNight] = useState(0)
  const [customPrice, setCustomPrice] = useState(0)
  const [paymentMethod, setPaymentMethod] = useState('cash')
  const [paymentStatus, setPaymentStatus] = useState<'paid' | 'partial'>('paid')
  const [amountPaid, setAmountPaid] = useState<number | ''>('')

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
        supabase.from('rooms').select('id, room_number, room_type, price_per_night, status').eq('organization_id', orgId).eq('status', 'available').order('room_number'),
        // Active bookings to check date conflicts
        supabase.from('bookings').select('room_id, check_in, check_out').eq('organization_id', orgId).in('status', ['confirmed', 'reserved', 'checked_in']),
        // City ledger accounts — load ALL, split by type client-side
        supabase.from('city_ledger_accounts').select('id, account_name, account_type, contact_phone, balance').eq('organization_id', orgId).order('account_name'),
        // Also load from organizations table as fallback (legacy orgs may live there)
        supabase.from('organizations').select('id, name, phone, email, org_type, created_by').neq('id', orgId).order('name'),
      ])

      // Sanitize rooms — filter out any with empty id, room_type or room_number to prevent SelectItem crashes
      const sanitizedRooms = (roomData || []).filter(
        (r: any) => r.id && r.room_type && String(r.room_type).trim() !== '' && r.room_number && String(r.room_number).trim() !== ''
      )
      setGuests(guestData || [])
      setAllRooms(sanitizedRooms)
      setAllBookingsForRooms(bookingData || [])
      setRooms(sanitizedRooms)

      // Individuals: city_ledger_accounts with type individual/guest
      const individualLedger: LedgerAccount[] = (cityLedgerData || [])
        .filter((a: any) => (a.account_type === 'individual' || a.account_type === 'guest') && isSelectableLedgerName(a.account_name))
        .map((a: any) => ({
          id: a.id,
          account_name: a.account_name,
          account_type: 'individual' as const,
          contact_phone: a.contact_phone || '',
          balance: a.balance || 0,
          source: 'city_ledger',
        }))

      // Organizations must come from the Organizations menu, not generated hotel tenant records.
      const orgNames = new Set<string>()
      const orgFromLedger: LedgerAccount[] = (cityLedgerData || [])
        .filter((a: any) => ['organization', 'corporate'].includes(a.account_type) && isSelectableLedgerName(a.account_name))
        .map((a: any) => {
          orgNames.add(String(a.account_name || '').toLowerCase())
          return {
            id: a.id,
            account_name: a.account_name,
            account_type: 'organization' as const,
            contact_phone: a.contact_phone || '',
            balance: a.balance || 0,
            source: 'city_ledger',
          }
        })
      const orgFromTable: LedgerAccount[] = (orgsData || [])
        .filter((o: any) => isOrganizationMenuRecord(o) && !orgNames.has(o.name.toLowerCase()))
        .map((o: any) => ({
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
      console.error('Error loading booking data:', err)
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
    const allLoaded = ledgerTab === 'individual' ? individualAccounts : organizationAccounts
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
        .select('id, name, phone, org_type, created_by')
        .neq('id', organizationId)
        .ilike('name', `%${value}%`)
        .limit(10),
    ])
    const fromLedger: LedgerAccount[] = (ledgerData || [])
        .filter((a: any) => ledgerTab === 'individual'
          ? (a.account_type === 'individual' || a.account_type === 'guest') && isSelectableLedgerName(a.account_name)
          : ['organization', 'corporate'].includes(a.account_type) && isSelectableLedgerName(a.account_name))
        .map((a: any) => ({
      id: a.id,
      account_name: a.account_name,
      account_type: ledgerTab,
      contact_phone: a.contact_phone || '',
      balance: a.balance || 0,
      source: 'city_ledger' as const,
        }))
    const ledgerNames = new Set(fromLedger.map(a => a.account_name.toLowerCase()))
    const fromOrgs: LedgerAccount[] = (orgSearchData || [])
      .filter((o: any) => ledgerTab === 'organization' && isOrganizationMenuRecord(o) && !ledgerNames.has(o.name.toLowerCase()))
      .map((o: any) => ({
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

  const selectLedgerAccount = async (account: LedgerAccount) => {
    try {
      const supabase = createClient()
      const resolved = ledgerTab === 'organization'
        ? await resolveOrganizationLedgerAccount(supabase, organizationId, account)
        : account
      if (!resolved) return
      setLedgerAccount(resolved.id)
      setLedgerAccountName(resolved.account_name || resolved.name)
      setLedgerSearch(resolved.account_name || resolved.name)
      if (ledgerTab === 'organization' && resolved.source === 'city_ledger') {
        setOrganizationAccounts((prev) => prev.some((item) => item.id === resolved.id)
          ? prev
          : [{ id: resolved.id, account_name: resolved.account_name, account_type: 'organization', contact_phone: resolved.contact_phone || '', balance: resolved.balance || 0, source: 'city_ledger' }, ...prev])
      }
      setLedgerOpen(false)
    } catch (error: any) {
      toast.error(error.message || 'Failed to select ledger account')
    }
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
    setRooms(allRooms.filter(r => r.status === 'available' && !bookedRoomIds.has(r.id) && r.id && r.room_type && String(r.room_type).trim() !== ''))
    // Clear selected room if it's no longer available
    setSelectedRoom(prev => prev && bookedRoomIds.has(prev.id) ? null : prev)
    setSelectedRoomType(prev => {
      if (!prev) return prev
      const stillAvail = allRooms.some(r => r.room_type === prev && !bookedRoomIds.has(r.id))
      return stillAvail ? prev : ''
    })
  }

  const handleStayDatesChange = (from: Date, to: Date | undefined) => {
    setCheckInDate(from)
    if (to) {
      setCheckOutDate(to)
      const n = Math.max(1, differenceInCalendarDays(to, from))
      setNights(n)
      filterRoomsForDates(from, to)
    } else {
      setCheckOutDate(undefined)
      setNights(0)
    }
  }

  const handleNightsChange = (value: number) => {
    const n = Math.max(1, value || 1)
    setNights(n)
    if (checkInDate) {
      const co = addDays(checkInDate, n)
      setCheckOutDate(co)
      filterRoomsForDates(checkInDate, co)
    }
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

  const canSubmitForm = () => {
    if (!(guestId || fullName.trim())) return false
    if (!(checkInDate && checkOutDate && nights > 0)) return false
    if (!selectedRoom) return false
    if (paymentMethod === 'city_ledger' && !ledgerAccount) return false
    return true
  }

  const isSuperadmin = role === 'superadmin'
  const isBackdated = checkInDate ? checkInDate < new Date(new Date().setHours(0, 0, 0, 0)) : false

  const hasApprovedBackdateRequest = async () => {
    if (!checkInDate) return false
    const res = await fetch(`/api/backdate-requests?caller_id=${userId}`, { credentials: 'include' })
    const json = await res.json()
    if (!res.ok) return false
    return (json.requests || []).some((request: any) =>
      request.status === 'approved'
      && request.request_type === 'booking'
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
          caller_id: userId,
          request_type: 'booking',
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

  const handleBackdatedBookingAction = async () => {
    if (await hasApprovedBackdateRequest()) {
      await handleSubmit()
      return
    }
    await handleRequestBackdate()
  }

  const handleSubmit = async () => {
    try {
      setLoading(true)
      if (!checkInDate || !checkOutDate) { toast.error('Dates required'); return }
      if (isBackdated && !isSuperadmin && !(await hasApprovedBackdateRequest())) {
        toast.error('Backdated bookings require superadmin approval. Send a request first.')
        return
      }
      if (!selectedRoom) { toast.error('Room required'); return }
      if (selectedRoom.status && selectedRoom.status !== 'available') { toast.error('Selected room is not available'); return }
      if (paymentMethod === 'city_ledger' && !ledgerAccount) { toast.error('Select a ledger account'); return }

      // Check for date conflicts one final time before submit
      const toStr = (d: Date) => {
        const y = d.getFullYear(), m = String(d.getMonth()+1).padStart(2,'0'), dd = String(d.getDate()).padStart(2,'0')
        return `${y}-${m}-${dd}`
      }
      const ciStr = toStr(checkInDate), coStr = toStr(checkOutDate)
      const hasConflict = allBookingsForRooms.some(
        b => b.room_id === selectedRoom.id && b.check_in < coStr && b.check_out > ciStr && b.status !== 'cancelled'
      )
      if (hasConflict) {
        toast.error('Selected room is already booked for these dates')
        return
      }

      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()

      const formattedGuestName = formatPersonName(fullName)
      let finalGuestId = guestId
      if (!guestId) {
        const { data: newGuest, error: ge } = await supabase
          .from('guests')
          .insert([{ organization_id: organizationId, name: formattedGuestName, phone, email: email || null, address: address || null }])
          .select()
          .single()
        if (ge) throw ge
        finalGuestId = newGuest.id

      }

      const effectiveRate = customPrice > 0 ? customPrice : pricePerNight
      const total = effectiveRate * nights
      const isCityLedger = paymentMethod === 'city_ledger'
      const paidAmount = isCityLedger ? 0 : paymentStatus === 'paid' ? total : Math.min(Number(amountPaid) || 0, total)
      const balanceAmount = total - paidAmount
      if (!isCityLedger && paymentStatus === 'partial' && paidAmount <= 0) {
        toast.error('Please enter the amount paid')
        return
      }
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
          deposit: paidAmount,
          balance: balanceAmount,
          payment_status: isCityLedger ? 'pending' : balanceAmount <= 0 ? 'paid' : 'partial',
          // Future check-in dates are reservations, today/past are confirmed bookings
          status: toLocalDateStr(checkInDate) > new Date().toISOString().split('T')[0] ? 'reserved' : 'confirmed',
          created_by: user?.id,
          // Store payment method in notes (no payment_method column on bookings table)
          notes: paymentMethod === 'city_ledger'
            ? `City Ledger: ${ledgerAccountName}`
            : `payment_method: ${paymentMethod}`,
        }])
        .select()
        .single()
      if (be) throw be

      // If city ledger, increment the ledger account balance + update guest/org profile
      if (paymentMethod === 'city_ledger' && ledgerAccount) {
        const { data: acc } = await supabase
          .from('city_ledger_accounts')
          .select('balance, account_type')
          .eq('id', ledgerAccount)
          .single()
        await supabase
          .from('city_ledger_accounts')
          .update({ balance: (acc?.balance || 0) + total })
          .eq('id', ledgerAccount)

        // Also bump the guest or org profile's outstanding balance
        const acctType = acc?.account_type || (ledgerTab === 'individual' ? 'individual' : 'organization')
        if (acctType === 'individual' || acctType === 'guest') {
          // Bump guests.balance so guest profile shows outstanding debt
          if (finalGuestId) {
            const { data: guestRow } = await supabase
              .from('guests').select('balance').eq('id', finalGuestId).single()
            await supabase
              .from('guests')
              .update({ balance: ((guestRow?.balance as number) || 0) + total })
              .eq('id', finalGuestId)
          }
        } else {
          // Org account — bump organizations.current_balance
          const { data: orgRow } = await supabase
            .from('organizations').select('current_balance').eq('id', ledgerAccount).single()
          if (orgRow) {
            await supabase
              .from('organizations')
              .update({ current_balance: ((orgRow.current_balance as number) || 0) + total })
              .eq('id', ledgerAccount)
          }
        }
      }

      await supabase.from('rooms').update({ status: 'occupied', updated_by: user?.id, updated_at: new Date().toISOString() }).eq('id', selectedRoom.id)

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
        payment_status: balanceAmount <= 0 ? 'paid' : 'unpaid',
        created_by: user?.id,
      }])

      if (paidAmount > 0 && balanceAmount > 0) {
        await supabase.from('folio_charges').insert([{
          booking_id: booking.id,
          organization_id: organizationId,
          description: `Initial payment - ${paymentMethod}`,
          amount: -paidAmount,
          charge_type: 'payment',
          payment_method: paymentMethod,
          payment_status: 'paid',
          created_by: user?.id,
        }])
      }

      // Record in transactions table (legacy)
      await supabase.from('transactions').insert([{
        organization_id: organizationId,
        booking_id: booking.id,
        transaction_id: `TXN-${Date.now().toString(36).toUpperCase()}`,
        guest_name: formattedGuestName,
        room: selectedRoom.room_number,
        amount: paidAmount || total,
        payment_method: paymentMethod,
        status: balanceAmount <= 0 ? 'completed' : 'pending',
        description: `Booking created - Folio ${folioId}`,
        received_by: user?.id || null,
      }])

      if (paidAmount > 0) {
        await supabase.from('payments').insert([{
          organization_id: organizationId,
          booking_id: booking.id,
          guest_id: finalGuestId,
          amount: paidAmount,
          payment_method: paymentMethod,
          payment_date: new Date().toISOString(),
          notes: `Booking payment — Folio ${folioId}`,
        }])
      }

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
    setFullName(''); setPhone(''); setEmail(''); setAddress(''); setGuestId('')
    const d = new Date(); d.setHours(0, 0, 0, 0)
    setCheckInDate(d); setCheckOutDate(new Date(d.getTime() + 86400000)); setNights(1)
    setSelectedRoomType(''); setSelectedRoom(null); setPricePerNight(0); setCustomPrice(0)
    setPaymentMethod('cash'); setPaymentStatus('paid'); setAmountPaid('')
    setLedgerSearch(''); setLedgerAccount(''); setLedgerAccountName('')
    setLedgerTab('individual')
    setNewAccountName(''); setNewAccountPhone(''); setNewAccountEmail('')
    setNewAccountAddress(''); setNewAccountCity(''); setNewAccountType('')
  }

  const activeLedgerSource = ledgerTab === 'individual' ? individualAccounts : organizationAccounts

  // Combined room list: each option shows "Room Type - Room Number"
  const availableRoomOptions = rooms.filter(r => r.id && r.room_type && r.room_number)

  return (
    <>
      <Dialog open={open} onOpenChange={(o) => { if (!o) { setLoading(false); onClose() } }}>
        <DialogContent className="max-w-2xl max-h-[92vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>New Booking</DialogTitle>
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
                {guestId && (
                  <div className="flex items-center justify-between bg-blue-50 border border-blue-200 rounded p-2">
                    <p className="text-xs text-blue-900">Existing guest selected</p>
                    <Button size="sm" variant="ghost" className="h-6" onClick={() => { setGuestId(''); setFullName(''); setPhone(''); setEmail(''); setAddress('') }}>
                      <X className="h-3 w-3" />
                    </Button>
                  </div>
                )}
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label>Phone Number</Label>
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
            <StayDateRangeFields
              layout="card"
              checkIn={checkInDate}
              checkOut={checkOutDate}
              nights={nights}
              onDatesChange={handleStayDatesChange}
              onNightsChange={handleNightsChange}
              showNights
              disableCalendar={(d) => !!(checkInDate && !checkOutDate && d <= checkInDate)}
            />
            {isBackdated && !isSuperadmin && (
              <div className="space-y-2 rounded-md border border-amber-200 bg-amber-50 p-3">
                <Label>Reason for Backdate Request *</Label>
                <Textarea
                  value={backdateReason}
                  onChange={(e) => setBackdateReason(e.target.value)}
                  placeholder="Explain why this booking must be backdated for superadmin approval"
                />
                <p className="text-xs text-amber-700">Only a superadmin can approve or directly create backdated bookings.</p>
              </div>
            )}

            {/* Room Selection — combined type + number in one dropdown */}
            <div className="rounded-lg border p-4 space-y-4">
              <p className="text-sm font-semibold">Room Selection</p>
              <div className="space-y-2">
                <Label>Room *</Label>
                <Select
                  value={selectedRoom?.id ?? ''}
                  onValueChange={(id) => {
                    const room = availableRoomOptions.find(r => r.id === id)
                    if (room) {
                      setSelectedRoom(room)
                      setSelectedRoomType(room.room_type)
                      setPricePerNight(room.price_per_night)
                      setCustomPrice(0)
                    }
                  }}
                >
                  <SelectTrigger>
                    <SelectValue placeholder={availableRoomOptions.length === 0 ? 'No rooms available for selected dates' : 'Select room type and number'} />
                  </SelectTrigger>
                  <SelectContent>
                    {availableRoomOptions.length === 0 ? (
                      <SelectItem value="__none__" disabled>No rooms available</SelectItem>
                    ) : (
                      availableRoomOptions.map(room => (
                        <SelectItem key={room.id} value={room.id}>
                          {room.room_type} — Room {room.room_number}
                        </SelectItem>
                      ))
                    )}
                  </SelectContent>
                </Select>
              </div>

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
                      {nights} night{nights !== 1 ? 's' : ''} × {formatNaira(customPrice || pricePerNight)}{customPrice ? ' (custom rate)' : ''}
                    </p>
                  </div>
                </>
              )}
            </div>

            {/* Payment */}
            <div className="rounded-lg border p-4 space-y-4">
              <p className="text-sm font-semibold">Payment</p>
              {paymentMethod !== 'city_ledger' && (
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label>Payment Status</Label>
                    <Select value={paymentStatus} onValueChange={(v: 'paid' | 'partial') => setPaymentStatus(v)}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="paid">Full Payment</SelectItem>
                        <SelectItem value="partial">Partial Payment</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Amount Paid</Label>
                    <Input
                      type="number"
                      min="0"
                      max={(customPrice || pricePerNight) * nights}
                      value={paymentStatus === 'paid' ? ((customPrice || pricePerNight) * nights) || '' : amountPaid}
                      onChange={(e) => setAmountPaid(e.target.value === '' ? '' : Number(e.target.value))}
                      disabled={paymentStatus === 'paid'}
                      placeholder="Enter paid amount"
                    />
                  </div>
                </div>
              )}
              <div className="space-y-2">
                <Label>Payment Method</Label>
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
                <div className="space-y-3 rounded-lg border border-input p-3">
                  <div className="flex items-center justify-between">
                    <Label className="text-sm font-semibold">City Ledger Account *</Label>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="h-7 text-xs"
                      onClick={() => {
                        setNewAccountName(ledgerTab === 'individual' ? fullName : '')
                        setNewAccountPhone(ledgerTab === 'individual' ? phone : '')
                        setNewAccountEmail(ledgerTab === 'individual' ? email : '')
                        setNewAccountAddress(''); setNewAccountCity(''); setNewAccountType('')
                        setNewAccountDialogOpen(true)
                      }}
                    >
                      {ledgerTab === 'individual' ? '+ New Guest Account' : '+ New Organization Account'}
                    </Button>
                  </div>
                  <Tabs value={ledgerTab} onValueChange={handleLedgerTabChange}>
                    <TabsList className="grid w-full grid-cols-2 h-9">
                      <TabsTrigger value="individual" className="text-xs gap-1.5">
                        <Users className="h-3.5 w-3.5" />Individual Guest
                      </TabsTrigger>
                      <TabsTrigger value="organization" className="text-xs gap-1.5">
                        <Building2 className="h-3.5 w-3.5" />Organization
                      </TabsTrigger>
                    </TabsList>
                  </Tabs>
                  <div className="relative">
                    <Input
                      placeholder={ledgerTab === 'individual' ? 'Search individual guest accounts...' : 'Search organization accounts...'}
                      value={ledgerSearch}
                      onChange={(e) => handleLedgerSearch(e.target.value)}
                      onFocus={() => {
                        setFilteredLedgerAccounts(ledgerSearch.trim() ? activeLedgerSource.filter(a => a.account_name.toLowerCase().includes(ledgerSearch.toLowerCase())) : activeLedgerSource)
                        setLedgerOpen(true)
                      }}
                      onBlur={() => setTimeout(() => setLedgerOpen(false), 150)}
                    />
                    {ledgerAccount && (
                      <button className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground" onMouseDown={(e) => { e.preventDefault(); clearLedgerAccount() }}>
                        <X className="h-4 w-4" />
                      </button>
                    )}
                    {ledgerOpen && (
                      <div className="absolute top-full left-0 right-0 mt-1 bg-background border border-input rounded-md shadow-lg z-50 max-h-52 overflow-y-auto">
                        {filteredLedgerAccounts.length > 0 ? (
                          filteredLedgerAccounts.map(account => (
                            <button key={account.id} className="w-full text-left px-3 py-2.5 hover:bg-accent border-b last:border-b-0 transition-colors text-sm" onMouseDown={(e) => { e.preventDefault(); selectLedgerAccount(account) }}>
                              <div className="font-medium">{account.account_name}</div>
                              <div className="text-xs text-muted-foreground">
                                {account.contact_phone && <span className="mr-3">{account.contact_phone}</span>}
                                Balance: {formatNaira(account.balance || 0)}
                              </div>
                            </button>
                          ))
                        ) : (
                          <div className="px-3 py-3 text-sm text-muted-foreground text-center">
                            {activeLedgerSource.length === 0 ? `No ${ledgerTab} accounts yet. Click "+ New Account".` : 'No matching accounts found'}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                  {ledgerTab === 'organization' && (
                    <p className="text-xs text-muted-foreground">
                      Search organizations from the Organizations menu or city ledger organization accounts. Use + New Account to create one here.
                    </p>
                  )}
                  {ledgerAccount && (
                    <div className="flex items-center gap-2 text-xs text-green-700 bg-green-50 border border-green-200 rounded px-3 py-2">
                      {ledgerTab === 'individual' ? <Users className="h-3.5 w-3.5 flex-shrink-0" /> : <Building2 className="h-3.5 w-3.5 flex-shrink-0" />}
                      <span>Selected: <strong>{ledgerAccountName}</strong></span>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Submit */}
          <div className="flex justify-end gap-2 pt-4 border-t">
            <Button variant="outline" onClick={onClose} disabled={loading}>Cancel</Button>
            <Button
              onClick={isBackdated && !isSuperadmin ? handleBackdatedBookingAction : handleSubmit}
              disabled={!canSubmitForm() || loading}
            >
              {loading ? 'Working...' : isBackdated && !isSuperadmin ? 'Request / Use Superadmin Approval' : 'Create Booking'}
            </Button>
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
