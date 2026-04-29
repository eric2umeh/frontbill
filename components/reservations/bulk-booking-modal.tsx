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
import { isOrganizationMenuRecord, isSelectableLedgerName } from '@/lib/utils/ledger-organization'
import { resolveOrganizationLedgerAccount } from '@/lib/utils/resolve-ledger-account'
import { formatPersonName, normalizeName, normalizeNameKey } from '@/lib/utils/name-format'

const ROOM_TYPES_FALLBACK = ['Deluxe', 'Royal', 'Kings', 'Mini Suite', 'Executive Suite', 'Diplomatic Suite']

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
  const [allRooms, setAllRooms] = useState<any[]>([]) // all non-maintenance rooms from DB
  const [allActiveBookings, setAllActiveBookings] = useState<any[]>([]) // for date overlap checks
  const [availableRooms, setAvailableRooms] = useState<any[]>([])
  const [roomAvailabilityChecked, setRoomAvailabilityChecked] = useState(false)
  // Derived room types from actual DB rooms
  const roomTypes = allRooms.length > 0
    ? Array.from(new Set(allRooms.map((r: any) => r.room_type).filter((t: any) => t && String(t).trim() !== '')))
    : ROOM_TYPES_FALLBACK

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
  const [customRate, setCustomRate] = useState<number | ''>('')
  const [paymentMethod, setPaymentMethod] = useState<'cash' | 'pos' | 'card' | 'transfer' | 'city_ledger'>('cash')
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
    const [{ data: guestData }, { data: roomData }, { data: bookingData }] = await Promise.all([
      supabase.from('guests').select('id, name, phone, email').eq('organization_id', profile.organization_id).order('name'),
      supabase.from('rooms').select('id, room_number, room_type, price_per_night, status').eq('organization_id', profile.organization_id).eq('status', 'available').order('room_number'),
      supabase.from('bookings').select('room_id, check_in, check_out').eq('organization_id', profile.organization_id).in('status', ['confirmed', 'reserved', 'checked_in']),
    ])
    setAllGuests(guestData || [])
    setAllRooms((roomData || []).filter((r: any) => r.id && r.room_type && String(r.room_type).trim() !== '' && r.room_number && String(r.room_number).trim() !== ''))
    setAllActiveBookings(bookingData || [])
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
        .select('id, name, email, phone, address, org_type, created_by')
        .neq('id', orgId)
        .ilike('name', `%${term}%`)
        .order('name')
        .limit(30)
      const results = (data || []).filter((org: any) => isOrganizationMenuRecord(org))
      setOrgResults(results)
      setOrgSearchOpen(results.length > 0)
      if (results.length === 0) setShowNewOrgForm(false)
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
        org_type: newOrgType || 'other',
        email: newOrgEmail.trim() || null,
        phone: newOrgPhone.trim() || null,
        address: newOrgAddress.trim() || null,
        contact_person: newOrgContact.trim() || null,
        current_balance: 0,
        created_by: currentUserId,
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
      const { data, error } = await supabase.from('city_ledger_accounts').insert([{
        organization_id: orgId,
        account_name: newLedgerOrgName.trim(),
        account_type: 'organization',
        contact_email: newLedgerOrgEmail.trim() || null,
        contact_phone: newLedgerOrgPhone.trim() || null,
        balance: 0,
      }]).select().single()
      if (error) throw error
      setSelectedLedger({ id: data.id, name: data.account_name, account_name: data.account_name, phone: data.contact_phone, source: 'city_ledger' })
      setLedgerSearch(data.account_name)
      setShowNewLedgerOrgForm(false)
      setNewLedgerOrgName(''); setNewLedgerOrgEmail(''); setNewLedgerOrgPhone('')
      toast.success(`Organization account "${data.account_name}" created and selected`)
    } catch (err: any) {
      toast.error(err.message || 'Failed to create organization account')
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
      const searchTerm = normalizeNameKey(term)
      const filtered = allGuests.filter(g => normalizeNameKey(g.name).includes(searchTerm) || (g.phone || '').includes(term))
      setLedgerResults(filtered.slice(0, 8))
      setLedgerSearchOpen(filtered.length > 0)
    } else {
      const supabase = createClient()
      const [{ data: orgData }, { data: ledgerData }] = await Promise.all([
        supabase.from('organizations').select('id, name, phone, email, org_type, created_by').neq('id', orgId).ilike('name', `%${term}%`).order('name').limit(30),
        supabase.from('city_ledger_accounts').select('id, account_name, contact_phone, balance, account_type').eq('organization_id', orgId).ilike('account_name', `%${term}%`).order('account_name').limit(30),
      ])
      const fromLedger = (ledgerData || [])
        .filter((d: any) => ['organization', 'corporate'].includes(d.account_type) && isSelectableLedgerName(d.account_name))
        .map((d: any) => ({ ...d, name: d.account_name, phone: d.contact_phone, source: 'city_ledger' }))
      const ledgerNames = new Set(fromLedger.map((d: any) => String(d.name || '').toLowerCase()))
      const fromOrgs = (orgData || [])
        .filter((d: any) => isOrganizationMenuRecord(d) && !ledgerNames.has(String(d.name || '').toLowerCase()))
        .map((d: any) => ({ ...d, source: 'organizations' }))
      const results = [...fromLedger, ...fromOrgs]
      setLedgerResults(results)
      setLedgerSearchOpen(results.length > 0)
    }
  }

  // Check room availability using date-overlap logic (same as booking modal)
  const checkRoomAvailability = () => {
    if (!checkIn || !checkOut || nights <= 0) { toast.error('Select valid check-in and check-out dates'); return }
    const cin = toLocalDateStr(checkIn)
    const cout = toLocalDateStr(checkOut)
    // A room is booked if any existing booking overlaps: existing.check_in < newCheckOut AND existing.check_out > newCheckIn
    const bookedRoomIds = new Set(
      allActiveBookings
        .filter(b => b.check_in < cout && b.check_out > cin)
        .map(b => b.room_id)
    )
    const available = allRooms.filter(r => r.status === 'available' && !bookedRoomIds.has(r.id))
    setAvailableRooms(available)
    setRoomAvailabilityChecked(true)
  }

  // Per-room guest search
  const handleRoomGuestSearch = (index: number, term: string) => {
    const updated = [...entries]
    updated[index].guestSearch = term
    updated[index].guestName = term
    updated[index].guestId = null
    if (term.trim()) {
      const searchTerm = normalizeNameKey(term)
      const selectedOrgKey = normalizeNameKey(selectedOrg?.name || '')
      const filtered = allGuests.filter(g => {
        const guestKey = normalizeNameKey(g.name)
        return guestKey !== selectedOrgKey && (guestKey.includes(searchTerm) || (g.phone || '').includes(term))
      })
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
    updated[index].guestName = formatPersonName(guest.name)
    updated[index].guestId = guest.id
    updated[index].phone = guest.phone || ''
    updated[index].guestSearch = formatPersonName(guest.name)
    updated[index].guestSearchOpen = false
    updated[index].filteredGuests = []
    setEntries(updated)
  }

  const applyQuickFill = () => {
    const count = Number(quickRoomCount)
    if (!count || count < 1) { toast.error('Enter a valid room count'); return }
    if (!quickRoomType) { toast.error('Select a room type'); return }
    // Pre-fill the contact name from step 1 into the first entry
    const contactName = bookingType === 'organization'
      ? (selectedOrg?.name || '')
      : (selectedGroupGuest?.name || '')
    setEntries(Array.from({ length: count }, (_, i) => ({
      ...makeEntry(),
      roomType: quickRoomType,
      guestName: i === 0 ? contactName : '',
      guestSearch: i === 0 ? contactName : '',
    })))
    toast.success(`${count} room entries added`)
  }

  const canGoStep2 = () => {
    if (bookingType === 'organization' && !selectedOrg) return false
    if (bookingType === 'individual' && !selectedGroupGuest) return false
    if (!checkIn || !checkOut || nights <= 0) return false
    return true
  }
  const canSubmit = () => {
    if (!customRate || Number(customRate) <= 0) return false
    if (paymentMethod === 'city_ledger' && !selectedLedger) return false
    if (paymentStatus === 'partial' && (!partialAmount || Number(partialAmount) <= 0)) return false
    return true
  }

  const handleSubmit = async () => {
    if (!checkIn || !checkOut) { toast.error('Dates required'); return }
    if (!customRate || Number(customRate) <= 0) { toast.error('Enter the custom rate per room'); return }
    if (!canSubmit()) { toast.error('Complete payment details'); return }

    // Validate entries — only first entry guest name is required
    if (!fillLater && entries.length > 0 && !entries[0].guestName.trim()) {
      toast.error('First room entry must have a guest name'); return
    }
    // Room type must be set for all entries
    if (!fillLater && entries.some(e => !e.roomType)) {
      toast.error('Select a room type for each entry'); return
    }

    // Pre-submit: never allow partial bulk creation. The requested quantity must be fully available.
    if (!fillLater) {
      const cin = toLocalDateStr(checkIn)
      const cout = toLocalDateStr(checkOut)
      const bookedIds = new Set(
        allActiveBookings
          .filter(b => b.check_in < cout && b.check_out > cin)
          .map(b => b.room_id)
      )
      const requestedByType: Record<string, number> = {}
      entries.forEach((entry) => {
        requestedByType[entry.roomType] = (requestedByType[entry.roomType] || 0) + (entry.numberOfRooms || 1)
      })

      const shortages = Object.entries(requestedByType)
        .map(([roomType, requested]) => {
          const available = allRooms.filter(r => r.room_type === roomType && !bookedIds.has(r.id)).length
          return { roomType, requested, available }
        })
        .filter((item) => item.available < item.requested)

      if (shortages.length > 0) {
        toast.error(
          shortages
            .map((item) => `${item.roomType}: requested ${item.requested}, available ${item.available}`)
            .join(' | ')
        )
        return
      }
    }

    setLoading(true)
    try {
      const supabase = createClient()
      let createdCount = 0
      const totalRooms = fillLater ? (Number(totalRoomsCount) || 1) : entries.length
      const guestCache = new Map<string, string | null>()
      const orgNameKey = normalizeNameKey(selectedOrg?.name || '')

      const findOrCreateGuest = async (name: string, phone?: string | null) => {
        const formattedName = formatPersonName(name)
        const guestKey = normalizeNameKey(formattedName)
        if (!guestKey) return null
        if (bookingType === 'organization' && guestKey === orgNameKey) return null
        if (guestCache.has(guestKey)) return guestCache.get(guestKey) || null

        const localGuest = allGuests.find((guest: any) => normalizeNameKey(guest.name) === guestKey)
        if (localGuest) {
          guestCache.set(guestKey, localGuest.id)
          return localGuest.id
        }

        const { data: existingGuest } = await supabase
          .from('guests')
          .select('id')
          .eq('organization_id', orgId)
          .ilike('name', formattedName)
          .maybeSingle()

        if (existingGuest) {
          guestCache.set(guestKey, existingGuest.id)
          return existingGuest.id
        }

        const { data: newGuest, error } = await supabase
          .from('guests')
          .insert([{ organization_id: orgId, name: formattedName, phone: phone || null }])
          .select('id')
          .single()
        if (error) throw error
        guestCache.set(guestKey, newGuest.id)
        return newGuest.id
      }

      // Resolve step-1 contact as fallback guest for entries with no name
      let fallbackGuestId: string | null = null
      if (!fillLater) {
        const contactName = bookingType === 'organization'
          ? ''
          : (selectedGroupGuest?.name || '')
        const contactPhone = bookingType === 'organization'
          ? (selectedOrg?.phone || null)
          : (selectedGroupGuest?.phone || null)
        fallbackGuestId = contactName ? await findOrCreateGuest(contactName, contactPhone) : null
      }

      const usedRoomIds = new Set<string>()

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
            rate_per_night: Number(customRate),
            total_amount: Number(customRate) * nights,
            deposit: 0,
            balance: Number(customRate) * nights,
            payment_status: 'pending',
            status: 'reserved',
            created_by: currentUserId,
            notes: isCityLedger && selectedLedger
              ? `City Ledger: ${selectedLedger.name || selectedLedger.account_name}`
              : `payment_method: ${paymentMethod}`,
          }])
          createdCount++
        }
      } else {
        for (const entry of entries) {
          const totalRoomSlots = entry.numberOfRooms || 1
          const cin = toLocalDateStr(checkIn)
          const cout = toLocalDateStr(checkOut)
          // Use date-overlap logic — not status='available' — to find truly free rooms
          const bookedIds = new Set(
            allActiveBookings
              .filter(b => b.check_in < cout && b.check_out > cin)
              .map(b => b.room_id)
          )
          const available = allRooms
            .filter(r => r.room_type === entry.roomType && !bookedIds.has(r.id) && !usedRoomIds.has(r.id))
            .slice(0, totalRoomSlots)

          if (!available || available.length === 0) {
            toast.error(`No available ${entry.roomType} rooms — skipped`); continue
          }

          // Resolve guest: use entry's guest if provided, fallback to step-1 contact
          let finalGuestId = entry.guestId
          const entryGuestName = formatPersonName(entry.guestName)
          if (!finalGuestId && entryGuestName) finalGuestId = await findOrCreateGuest(entryGuestName, entry.phone || null)
          // Always ensure a non-null guest_id (use step-1 contact fallback)
          if (!finalGuestId) finalGuestId = fallbackGuestId

          for (const room of available) {
            usedRoomIds.add(room.id)
            const total = Number(customRate) * nights
            const depositAmt = paymentStatus === 'paid' ? total : paymentStatus === 'partial' ? (Number(partialAmount) || 0) : 0
            const balanceAmt = total - depositAmt
            const isCityLedger = paymentMethod === 'city_ledger'
            const folioId = `BLK-${Date.now().toString(36).toUpperCase()}`

            const { data: booking, error: be } = await supabase.from('bookings').insert([{
              organization_id: orgId, guest_id: finalGuestId, room_id: room.id, folio_id: folioId,
              check_in: toLocalDateStr(checkIn), check_out: toLocalDateStr(checkOut),
              number_of_nights: nights, rate_per_night: Number(customRate),
              total_amount: total, deposit: depositAmt, balance: balanceAmt,
              payment_status: paymentStatus === 'paid' ? 'paid' : paymentStatus === 'partial' ? 'partial' : 'pending',
              status: 'reserved', created_by: currentUserId,
              notes: isCityLedger && selectedLedger
                ? `City Ledger: ${selectedLedger.name || selectedLedger.account_name}`
                : `payment_method: ${paymentMethod}`,
            }]).select().single()
            if (be) throw be

            await supabase.from('rooms').update({ status: 'reserved', updated_by: currentUserId, updated_at: new Date().toISOString() }).eq('id', room.id)
            await supabase.from('folio_charges').insert([{
              booking_id: booking.id,
              organization_id: orgId,
              description: `Bulk reservation room charge - ${nights} night${nights !== 1 ? 's' : ''}`,
              amount: total,
              charge_type: 'room_charge',
              payment_method: isCityLedger ? 'city_ledger' : paymentMethod,
              ledger_account_id: isCityLedger && selectedLedger ? selectedLedger.id : null,
              ledger_account_type: isCityLedger ? ledgerType : null,
              payment_status: balanceAmt > 0 ? 'unpaid' : 'paid',
              created_by: currentUserId,
            }])
            await supabase.from('transactions').insert([{
              organization_id: orgId, booking_id: booking.id,
              transaction_id: `TXN-${Date.now().toString(36).toUpperCase()}`,
              guest_name: entryGuestName || selectedOrg?.name || selectedGroupGuest?.name || 'Bulk Guest', room: room.room_number, amount: total,
              payment_method: isCityLedger ? 'city_ledger' : paymentMethod,
              status: paymentStatus === 'paid' ? 'paid' : paymentStatus === 'partial' ? 'partial' : 'pending',
              description: `Bulk reservation — ${bookingType === 'organization' ? selectedOrg?.name : selectedGroupGuest?.name} — ${folioId}`,
              received_by: currentUserId,
            }])
            createdCount++
          }
        }

        if (paymentMethod === 'city_ledger' && selectedLedger?.id) {
          const totalDebt = createdCount * Number(customRate) * nights
          const { data: account } = await supabase
            .from('city_ledger_accounts')
            .select('balance')
            .eq('id', selectedLedger.id)
            .maybeSingle()
          if (account) {
            await supabase
              .from('city_ledger_accounts')
              .update({ balance: Number(account.balance || 0) + totalDebt })
              .eq('id', selectedLedger.id)
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
    setCustomRate(''); setPaymentMethod('cash'); setPaymentStatus('unpaid'); setPartialAmount('')
    setLedgerSearch(''); setLedgerResults([]); setSelectedLedger(null); setLedgerSearchOpen(false)
    setShowNewLedgerOrgForm(false); setNewLedgerOrgName(''); setNewLedgerOrgEmail(''); setNewLedgerOrgPhone('')
    setEntries([makeEntry()]); setQuickRoomCount(''); setQuickRoomType(''); setFillLater(false); setTotalRoomsCount('')
    onClose()
  }

  const stepLabel = step === 1 ? 'Group Contact, Dates & Room Availability' : 'Payment & Room Entries'

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-3xl max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Bulk Reservation — Step {step} of 2</DialogTitle>
          <DialogDescription>{stepLabel}</DialogDescription>
        </DialogHeader>

        <div className="flex items-center gap-2 pb-1">
          {[1,2].map(s => (
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

            {/* Dates + Room Availability — merged into step 1 */}
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
                        {roomTypes.map(rt => {
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

        {/* ── STEP 2: Payment + Room Entries ── */}
        {step === 2 && (
          <div className="space-y-5 py-2">
            {/* Payment section */}
            <div className="space-y-4">
              <p className="text-sm font-semibold">Payment Details</p>
              <div className="space-y-2">
                <Label>Custom Rate Per Room *</Label>
                <Input
                  type="number"
                  min={1}
                  placeholder="Enter agreed room rate"
                  value={customRate}
                  onChange={(e) => setCustomRate(e.target.value === '' ? '' : Number(e.target.value))}
                />
                <p className="text-xs text-muted-foreground">
                  Required for bulk reservations. This rate is used for every selected room.
                </p>
              </div>
              <div className="space-y-2">
                <Label>Payment Method</Label>
                <Select value={paymentMethod} onValueChange={(v: any) => { setPaymentMethod(v); if (v !== 'city_ledger') { setSelectedLedger(null); setShowNewLedgerOrgForm(false) } }}>
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
                            <button key={`${r.source || 'account'}-${r.id}`} className="w-full text-left px-4 py-2 hover:bg-accent border-b last:border-b-0 text-sm"
                              onMouseDown={(e) => { e.preventDefault(); selectLedgerAccount(r) }}>
                              <div className="font-medium">{r.name || r.account_name}</div>
                              <div className="text-xs text-muted-foreground">{r.phone || r.contact_phone}</div>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                    {ledgerType === 'organization' && (
                      <Button type="button" size="sm" variant="outline" className="whitespace-nowrap" onClick={() => setShowNewLedgerOrgForm(v => !v)}>
                        + New Account
                      </Button>
                    )}
                  </div>
                  {ledgerType === 'organization' && (
                    <p className="text-xs text-muted-foreground">
                      Search organizations created from the Organizations menu or city ledger organization accounts. Use New Account to create one here.
                    </p>
                  )}

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
                          {roomTypes.map(rt => <SelectItem key={rt} value={rt}>{rt}</SelectItem>)}
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
                          <span className="text-xs font-medium text-muted-foreground">
                            Room Entry {i + 1}
                            {i === 0 && <span className="ml-1 text-destructive">*</span>}
                            {i > 0 && <span className="ml-1 text-muted-foreground/60">(optional)</span>}
                          </span>
                          {entries.length > 1 && (
                            <button onClick={() => setEntries(entries.filter(r => r.id !== entry.id))} className="text-destructive hover:opacity-80">
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          )}
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                          <div className="relative">
                            <Input
                              placeholder={i === 0 ? "Guest / org name (required)" : "Guest name (optional)"}
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
                            <SelectContent>{roomTypes.map(rt => <SelectItem key={rt} value={rt}>{rt}</SelectItem>)}</SelectContent>
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
          {step < 2 ? (
            <Button onClick={() => setStep(2)} disabled={!canGoStep2()}>
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
