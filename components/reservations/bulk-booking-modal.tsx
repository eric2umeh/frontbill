'use client'

import { useState, useEffect, useRef, useMemo } from 'react'
import { createClient } from '@/lib/supabase/client'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogScrollableBody,
  DialogScrollableFooter,
  DialogScrollableHeader,
  DialogTitle,
  dialogScrollableContentClass,
} from '@/components/ui/dialog'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { Checkbox } from '@/components/ui/checkbox'
import { Plus, Trash2, Loader2, Users, Building2, ChevronLeft, ChevronRight, X } from 'lucide-react'
import { format, differenceInDays, addDays } from 'date-fns'
import { toast } from 'sonner'
import { formatNaira } from '@/lib/utils/currency'
import { resolveOrganizationLedgerAccount } from '@/lib/utils/resolve-ledger-account'
import { formatPersonName, normalizeName, normalizeNameKey, titleCaseWhileTyping } from '@/lib/utils/name-format'
import { guestOrOrganizationNameTaken } from '@/lib/utils/guest-org-name-uniqueness'
import {
  buildCounterpartyOrganizationRow,
  describeSupabaseError,
  ensureCityLedgerAccountForCounterparty,
} from '@/lib/utils/counterparty-organization'
import { hasPermission } from '@/lib/permissions'
import { useAuth } from '@/lib/auth-context'
import { isStayCheckInConsideredBackdated, formatYMDInTimeZone, resolveHotelTimeZone, minSelectableCheckInYmdHotel, isLateNightCheckInGraceWindow, lateCheckInGraceWindowLabel, defaultStayCheckInYmdHotel, parseHotelYmdToLocalDate } from '@/lib/hotel-date'
import { useNightAuditClosedDates } from '@/hooks/use-night-audit-closed-dates'
import type { CounterpartyOrganizationOption } from '@/lib/utils/search-counterparty-organizations'
import {
  filterCounterpartyOrganizationsClient,
  loadCounterpartyOrganizations,
  searchCounterpartyOrganizations,
} from '@/lib/utils/search-counterparty-organizations'
import { syncLedgerOrgCounterpartiesToOrganizationsTable } from '@/lib/utils/sync-ledger-org-counterparties-to-organizations'
import { appendBulkGroupNote, createBulkGroupId } from '@/lib/utils/bulk-booking'
import { StayDateRangeFields } from '@/components/shared/stay-date-range-fields'
import { BOOKING_MODAL_ROOMS_LIMIT, normalizeRoomsForBookingPickers } from '@/lib/utils/room-bookability'
import { insertFolioCharges } from '@/lib/utils/insert-folio-charges'
import {
  formatReservationPaymentMethodLabel,
  isReservationPendingHold,
  RESERVATION_PAYMENT_METHOD_OPTIONS,
  RESERVATION_PAYMENT_METHOD_PENDING,
  type ReservationPaymentMethod,
} from '@/lib/reservations/reservation-payment-methods'
import { applyPaymentToGuestCityLedger } from '@/lib/utils/guest-city-ledger'
import { buildBackdateDedupeKey } from '@/lib/backdate/dedupe-key'
import { SelectedRoomsStickyBar } from '@/components/shared/selected-rooms-sticky-bar'
import { CashbackPaymentPanel } from '@/components/cashback/cashback-payment-panel'
import { computeCashbackDiscount } from '@/lib/cashback/cashback-payment-math'
import { applyCashbackDiscountAndFolioPayments } from '@/lib/cashback/apply-cashback-folio-payment'
import {
  earnCashbackClient,
  fetchGuestCashbackBalanceClient,
} from '@/lib/cashback/cashback-client'
import { paymentMethodEarnsCashback } from '@/lib/cashback/cashback-config'
import { isGuestBookingCashbackEligible } from '@/lib/cashback/cashback-eligibility'
import { bulkRoomUsesStep1Cashback } from '@/lib/cashback/bulk-cashback-guest'

function sortRoomsByNumber<T extends { room_number?: string | number | null }>(rows: T[]) {
  return [...rows].sort((a, b) =>
    String(a.room_number ?? '').localeCompare(String(b.room_number ?? ''), undefined, {
      numeric: true,
    }),
  )
}

function computeBulkRoomPaymentAmounts(
  total: number,
  opts: {
    pendingHold: boolean
    paymentStatus: 'paid' | 'partial' | 'unpaid'
    payAboveBulkRoomTotal: boolean
    partialAmount: number | ''
  },
): {
  depositAmt: number
  balanceAmt: number
  bookingPaymentStatus: string
  folioChargePaid: boolean
} {
  if (opts.pendingHold) {
    return {
      depositAmt: 0,
      balanceAmt: total,
      bookingPaymentStatus: 'pending',
      folioChargePaid: false,
    }
  }
  let depositAmt = 0
  if (opts.paymentStatus === 'paid') {
    depositAmt = opts.payAboveBulkRoomTotal
      ? Math.max(total, Number(opts.partialAmount) || total)
      : total
  } else if (opts.paymentStatus === 'partial') {
    depositAmt = Number(opts.partialAmount) || 0
  }
  const balanceAmt = Math.max(0, total - depositAmt)
  const bookingPaymentStatus =
    balanceAmt <= 0 ? 'paid' : depositAmt > 0 ? 'partial' : 'pending'
  return {
    depositAmt,
    balanceAmt,
    bookingPaymentStatus,
    folioChargePaid: balanceAmt <= 0,
  }
}

function resolveBulkRoomPayment(
  total: number,
  opts: {
    pendingHold: boolean
    paymentStatus: 'paid' | 'partial' | 'unpaid'
    payAboveBulkRoomTotal: boolean
    partialAmount: number | ''
  },
  cashback?: { balance: number; apply: boolean } | null,
) {
  if (!cashback?.apply || cashback.balance <= 0 || opts.pendingHold) {
    const base = computeBulkRoomPaymentAmounts(total, opts)
    return {
      ...base,
      cashbackDiscount: 0,
      cashToCollect: base.depositAmt,
      cashbackBalanceAfter: cashback?.balance ?? 0,
    }
  }

  let cashPaying = 0
  if (opts.paymentStatus === 'paid') {
    cashPaying = opts.payAboveBulkRoomTotal
      ? Math.max(total, Number(opts.partialAmount) || total)
      : total
  } else if (opts.paymentStatus === 'partial') {
    cashPaying = Number(opts.partialAmount) || 0
  }

  const d = computeCashbackDiscount({
    totalDue: total,
    cashbackBalance: cashback.balance,
    cashPaying,
    applyCashback: true,
  })

  const depositAmt = d.cashbackDiscount + d.cashToCollect
  const balanceAmt = d.balanceRemaining
  const bookingPaymentStatus =
    balanceAmt <= 0 ? 'paid' : depositAmt > 0 ? 'partial' : 'pending'

  return {
    depositAmt,
    balanceAmt,
    bookingPaymentStatus,
    folioChargePaid: balanceAmt <= 0,
    cashbackDiscount: d.cashbackDiscount,
    cashToCollect: d.cashToCollect,
    cashbackBalanceAfter: Math.max(0, cashback.balance - d.cashbackDiscount),
  }
}

const ROOM_TYPES_FALLBACK = ['Deluxe', 'Royal', 'Kings', 'Mini Suite', 'Executive Suite', 'Diplomatic Suite']

const toLocalDateStr = (date: Date) => {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
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
  guestName: '', guestId: null, phone: '',
  roomType: '', numberOfRooms: 1,
  guestSearch: '', guestSearchOpen: false, filteredGuests: [],
})

interface BulkBookingModalProps {
  open: boolean
  onClose: () => void
  onSuccess?: () => void
  /** `reservation` (default): copy for Reservations menu. `booking`: copy when opened from Bookings. */
  wording?: 'reservation' | 'booking'
}

export function BulkBookingModal({ open, onClose, onSuccess, wording = 'reservation' }: BulkBookingModalProps) {
  const { organizationId: authTenantOrgId, userId: authUserId, role: authRole } = useAuth()
  const [step, setStep] = useState(1)
  const [loading, setLoading] = useState(false)
  const [orgId, setOrgId] = useState('')
  const [currentUserId, setCurrentUserId] = useState('')
  const [currentUserRole, setCurrentUserRole] = useState('')
  const [allGuests, setAllGuests] = useState<any[]>([])
  const [allRooms, setAllRooms] = useState<any[]>([]) // all non-maintenance rooms from DB
  const [allActiveBookings, setAllActiveBookings] = useState<any[]>([]) // for date overlap checks
  const [availableRooms, setAvailableRooms] = useState<any[]>([])
  /** Specific rooms locked in Step 1 (optional). When set, submit assigns only these IDs by room type instead of arbitrary auto-pick. */
  const [pickedRoomIds, setPickedRoomIds] = useState<string[]>([])
  const [roomAvailabilityChecked, setRoomAvailabilityChecked] = useState(false)
  // Derived room types from actual DB rooms
  const roomTypes = allRooms.length > 0
    ? Array.from(new Set(allRooms.map((r: any) => r.room_type).filter((t: any) => t && String(t).trim() !== '')))
    : ROOM_TYPES_FALLBACK

  // Step 1: Booking type + contact
  const [bookingType, setBookingType] = useState<'organization' | 'individual'>('organization')

  // Organization search — from organizations table
  const [orgSearch, setOrgSearch] = useState('')
  const [orgResults, setOrgResults] = useState<CounterpartyOrganizationOption[]>([])
  const [allCounterpartyOrgs, setAllCounterpartyOrgs] = useState<CounterpartyOrganizationOption[]>([])
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
  const [showNewGuestForm, setShowNewGuestForm] = useState(false)
  const [newGuestName, setNewGuestName] = useState('')
  const [newGuestPhone, setNewGuestPhone] = useState('')
  const [newGuestEmail, setNewGuestEmail] = useState('')
  const [newGuestAddress, setNewGuestAddress] = useState('')
  const [creatingGuest, setCreatingGuest] = useState(false)
  const [guestCashbackBalance, setGuestCashbackBalance] = useState(0)
  const [applyCashback, setApplyCashback] = useState(false)

  // Step 2: Dates
  const [checkIn, setCheckIn] = useState<Date>()
  const [checkOut, setCheckOut] = useState<Date>()
  const [backdateReason, setBackdateReason] = useState('')

  // Step 3: Payment
  const [customRate, setCustomRate] = useState<number | ''>('')
  const [paymentMethod, setPaymentMethod] = useState<ReservationPaymentMethod>('pos')
  const [paymentStatus, setPaymentStatus] = useState<'paid' | 'partial' | 'unpaid'>('unpaid')
  const [partialAmount, setPartialAmount] = useState<number | ''>('')
  const [payAboveBulkRoomTotal, setPayAboveBulkRoomTotal] = useState(false)
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
  const [fillLater, setFillLater] = useState(true)
  const [totalRoomsCount, setTotalRoomsCount] = useState<number | ''>('')

  const nights = checkIn && checkOut ? differenceInDays(checkOut, checkIn) : 0
  const pendingHold = isReservationPendingHold(paymentMethod)
  const effectiveBulkPaymentStatus = pendingHold ? 'unpaid' : paymentStatus

  const pickedRoomNumbers = useMemo(() => {
    const rows = pickedRoomIds
      .map((id) => allRooms.find((r: { id: string }) => r.id === id))
      .filter(Boolean) as Array<{ room_number?: string | number }>
    return sortRoomsByNumber(rows).map((r) => r.room_number ?? '')
  }, [pickedRoomIds, allRooms])

  const bulkPaymentOpts = {
    pendingHold,
    paymentStatus,
    payAboveBulkRoomTotal,
    partialAmount,
  }

  const bulkCashbackEligible = isGuestBookingCashbackEligible({
    bulkBookingType: bookingType,
    guestName: selectedGroupGuest?.name,
    paymentMethod,
  })

  useEffect(() => {
    if (!open || bookingType !== 'individual' || !selectedGroupGuest?.id) {
      setGuestCashbackBalance(0)
      return
    }
    let cancelled = false
    ;(async () => {
      try {
        const supabase = createClient()
        const b = await fetchGuestCashbackBalanceClient(
          supabase,
          selectedGroupGuest.id,
        )
        if (!cancelled) setGuestCashbackBalance(b.balance)
      } catch {
        if (!cancelled) setGuestCashbackBalance(0)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [open, bookingType, selectedGroupGuest?.id])

  useEffect(() => { if (open) fetchBootstrap(); else handleClose() }, [open])

  const fetchBootstrap = async () => {
    const supabase = createClient()
    const tenantId = authTenantOrgId?.trim()
    if (!tenantId) {
      toast.error('Missing hotel organization — sign in again')
      return
    }
    const userId = authUserId?.trim()
    if (!userId) return

    setCurrentUserId(userId)
    setOrgId(tenantId)
    setCurrentUserRole(authRole || '')

    await syncLedgerOrgCounterpartiesToOrganizationsTable(supabase, {
      hotelTenantOrganizationId: tenantId,
      createdByUserId: userId,
    })

    const [counterpartyOrgs, { data: guestData }, { data: roomData }, { data: bookingData }] = await Promise.all([
      loadCounterpartyOrganizations(supabase, tenantId),
      supabase.from('guests').select('id, name, phone, email').eq('organization_id', tenantId).order('name'),
      supabase
        .from('rooms')
        .select('id, room_number, room_type, price_per_night, status')
        .eq('organization_id', tenantId)
        .order('room_number')
        .limit(BOOKING_MODAL_ROOMS_LIMIT),
      supabase.from('bookings').select('room_id, check_in, check_out').eq('organization_id', tenantId).in('status', ['confirmed', 'reserved', 'checked_in']).limit(BOOKING_MODAL_ROOMS_LIMIT),
    ])
    setAllCounterpartyOrgs(counterpartyOrgs)
    setAllGuests(guestData || [])
    setAllRooms(normalizeRoomsForBookingPickers(roomData) as any[])
    setAllActiveBookings(bookingData || [])
  }

  const refreshCounterpartyOrgCache = async (term?: string): Promise<CounterpartyOrganizationOption[]> => {
    const tenantId = orgId || authTenantOrgId
    if (!tenantId) return []
    try {
      const supabase = createClient()
      const rows = term?.trim()
        ? await searchCounterpartyOrganizations(supabase, {
            hotelTenantOrganizationId: tenantId,
            searchTerm: term,
            limit: 50,
          })
        : await loadCounterpartyOrganizations(supabase, tenantId)
      setAllCounterpartyOrgs(rows)
      return rows
    } catch (err: unknown) {
      console.error('Counterparty org refresh failed:', describeSupabaseError(err), err)
      return []
    }
  }

  // Search organizations — preload cache + client filter (same pattern as guests)
  const searchOrgs = (term: string) => {
    setOrgSearch(term)
    setSelectedOrg(null)
    if (!term.trim()) {
      setOrgResults([])
      setOrgSearchOpen(false)
      return
    }

    const filtered = filterCounterpartyOrganizationsClient(allCounterpartyOrgs, term, 30)
    setOrgResults(filtered)
    setOrgSearchOpen(filtered.length > 0)
    if (filtered.length === 0) setShowNewOrgForm(false)

    if (filtered.length === 0) {
      setOrgSearching(true)
      void refreshCounterpartyOrgCache(term)
        .then((rows) => {
          const refreshed = filterCounterpartyOrganizationsClient(rows, term, 30)
          setOrgResults(refreshed)
          setOrgSearchOpen(refreshed.length > 0)
        })
        .finally(() => setOrgSearching(false))
    }
  }

  const createNewOrg = async () => {
    if (!newOrgName.trim()) { toast.error('Organization name required'); return }
    if (!newOrgPhone.trim() && !newOrgEmail.trim()) { toast.error('Phone or email required'); return }
    setCreatingOrg(true)
    try {
      const supabase = createClient()
      const normalizedOrgName = normalizeNameKey(newOrgName.trim())
      const nameTaken = await guestOrOrganizationNameTaken(supabase, {
        hotelTenantOrganizationId: orgId,
        candidateName: newOrgName.trim(),
      })
      if (nameTaken || allGuests.some((g: any) => normalizeNameKey(g.name) === normalizedOrgName)) {
        toast.error('This name already exists as a guest or organization')
        return
      }
      const row = buildCounterpartyOrganizationRow({
        name: newOrgName.trim(),
        org_type: newOrgType || 'other',
        email: newOrgEmail,
        phone: newOrgPhone,
        address: newOrgAddress,
        contact_person: newOrgContact,
        created_by: currentUserId!,
      })
      const { data, error } = await supabase
        .from('organizations')
        .insert([row])
        .select()
        .single()
      if (error) throw error
      const tenantId = orgId || authTenantOrgId
      if (tenantId) {
        await ensureCityLedgerAccountForCounterparty(supabase, tenantId, data.name, {
          phone: data.phone,
          email: data.email,
        })
      }
      const createdOption: CounterpartyOrganizationOption = {
        id: data.id,
        name: data.name,
        email: data.email,
        phone: data.phone,
        org_type: data.org_type,
        created_by: data.created_by,
        source: 'organizations',
      }
      setAllCounterpartyOrgs((prev) => {
        const key = normalizeNameKey(data.name)
        const rest = prev.filter((o) => normalizeNameKey(o.name) !== key)
        return [...rest, createdOption].sort((a, b) => a.name.localeCompare(b.name))
      })
      setSelectedOrg(createdOption)
      setOrgSearch(data.name)
      setShowNewOrgForm(false)
      setNewOrgName(''); setNewOrgType(''); setNewOrgContact(''); setNewOrgPhone(''); setNewOrgEmail(''); setNewOrgAddress('')
      toast.success(`Organization "${data.name}" created`)
    } catch (err: unknown) {
      toast.error(describeSupabaseError(err) || 'Failed to create organization')
    } finally {
      setCreatingOrg(false)
    }
  }

  const createNewLedgerOrg = async () => {
    if (!newLedgerOrgName.trim()) { toast.error('Organization name required'); return }
    setCreatingLedgerOrg(true)
    try {
      const supabase = createClient()
      const normalizedOrgName = normalizeNameKey(newLedgerOrgName.trim())
      const ledgerOrgTaken = await guestOrOrganizationNameTaken(supabase, {
        hotelTenantOrganizationId: orgId,
        candidateName: newLedgerOrgName.trim(),
      })
      if (ledgerOrgTaken || allGuests.some((g: any) => normalizeNameKey(g.name) === normalizedOrgName)) {
        toast.error('This name already exists as a guest or organization')
        return
      }

      const ledgerRow = buildCounterpartyOrganizationRow({
        name: newLedgerOrgName.trim(),
        org_type: 'other',
        email: newLedgerOrgEmail,
        phone: newLedgerOrgPhone,
        created_by: currentUserId || '',
      })
      const { error: orgInsertError } = await supabase.from('organizations').insert([ledgerRow])
      if (orgInsertError) throw orgInsertError

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
    } catch (err: unknown) {
      toast.error(describeSupabaseError(err) || 'Failed to create organization account')
    } finally {
      setCreatingLedgerOrg(false)
    }
  }

  const selectLedgerAccount = async (account: any) => {
    try {
      const supabase = createClient()
      const resolved = ledgerType === 'organization'
        ? await resolveOrganizationLedgerAccount(supabase, orgId || authTenantOrgId, account)
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
    if (filtered.length === 0) setShowNewGuestForm(false)
  }

  const createNewGuest = async () => {
    if (!newGuestName.trim()) { toast.error('Guest name required'); return }
    if (!newGuestPhone.trim() && !newGuestEmail.trim()) {
      toast.error('Phone or email required')
      return
    }
    setCreatingGuest(true)
    try {
      const supabase = createClient()
      const tenantId = orgId || authTenantOrgId
      if (!tenantId) {
        toast.error('Missing hotel organization — sign in again')
        return
      }
      const formattedName = formatPersonName(newGuestName.trim())
      const normalizedName = normalizeNameKey(formattedName)
      const nameTaken = await guestOrOrganizationNameTaken(supabase, {
        hotelTenantOrganizationId: tenantId,
        candidateName: formattedName,
      })
      if (nameTaken || allGuests.some((g: any) => normalizeNameKey(g.name) === normalizedName)) {
        toast.error('This name already exists as a guest or organization')
        return
      }

      const { data, error } = await supabase
        .from('guests')
        .insert([{
          organization_id: tenantId,
          name: formattedName,
          phone: newGuestPhone.trim() || null,
          email: newGuestEmail.trim() || null,
          address: newGuestAddress.trim() || null,
        }])
        .select('id, name, phone, email')
        .single()
      if (error) throw error

      const { data: existingLedger } = await supabase
        .from('city_ledger_accounts')
        .select('id')
        .eq('organization_id', tenantId)
        .ilike('account_name', formattedName)
        .in('account_type', ['individual', 'guest'])
        .maybeSingle()

      if (!existingLedger) {
        const { error: ledgerErr } = await supabase.from('city_ledger_accounts').insert({
          organization_id: tenantId,
          account_name: formattedName,
          account_type: 'individual',
          contact_phone: newGuestPhone.trim() || null,
          contact_email: newGuestEmail.trim() || null,
          balance: 0,
        })
        if (ledgerErr) {
          console.warn('[bulk-booking] city ledger for new guest:', ledgerErr.message)
        }
      }

      const guestRow = {
        id: data.id,
        name: data.name,
        phone: data.phone,
        email: data.email,
      }
      setAllGuests((prev) => {
        const rest = prev.filter((g) => g.id !== data.id)
        return [...rest, guestRow].sort((a, b) => a.name.localeCompare(b.name))
      })
      setSelectedGroupGuest(guestRow)
      setGroupGuestSearch(data.name)
      setShowNewGuestForm(false)
      setNewGuestName('')
      setNewGuestPhone('')
      setNewGuestEmail('')
      setNewGuestAddress('')
      toast.success(`Guest "${data.name}" created`)
    } catch (err: unknown) {
      toast.error(describeSupabaseError(err) || 'Failed to create guest')
    } finally {
      setCreatingGuest(false)
    }
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
      const mapLedgerRows = (rows: CounterpartyOrganizationOption[]) =>
        rows.map((o) => ({
          ...o,
          account_name: o.name,
          contact_phone: o.phone,
          balance: o.balance ?? 0,
          source: o.source,
        }))

      let rows = filterCounterpartyOrganizationsClient(allCounterpartyOrgs, term, 30)
      if (rows.length > 0) {
        const results = mapLedgerRows(rows)
        setLedgerResults(results)
        setLedgerSearchOpen(true)
        return
      }

      void refreshCounterpartyOrgCache(term).then((refreshed) => {
        const results = mapLedgerRows(filterCounterpartyOrganizationsClient(refreshed, term, 30))
        setLedgerResults(results)
        setLedgerSearchOpen(results.length > 0)
      })
    }
  }

  const togglePickedRoom = (roomId: string) => {
    setPickedRoomIds((prev) => (prev.includes(roomId) ? prev.filter((id) => id !== roomId) : [...prev, roomId]))
  }

  /** Validates picked-room counts cover each requested room type. */
  const pickedRoomsValidationError = (pickIds: string[]): string | null => {
    if (!pickIds.length || fillLater) return null
    const needByType: Record<string, number> = {}
    for (const e of entries) {
      if (!e.roomType.trim()) return 'Assign a room type on every row when using picked rooms.'
      needByType[e.roomType] = (needByType[e.roomType] || 0) + e.numberOfRooms
    }
    const haveByType: Record<string, number> = {}
    for (const id of pickIds) {
      const row = allRooms.find((r: any) => r.id === id)
      if (!row?.room_type) return 'One or more selected rooms are unknown — rerun availability.'
      const t = row.room_type
      haveByType[t] = (haveByType[t] || 0) + 1
    }
    for (const [t, needed] of Object.entries(needByType)) {
      const have = haveByType[t] || 0
      if (have !== needed) {
        return `${t}: picked ${have} room(s), need exactly ${needed} — adjust selection or quantities in Step 2.`
      }
    }
    for (const t of Object.keys(haveByType)) {
      if (!needByType[t]) return `Extra ${t} rooms selected — not required by room entries below. Clear them or add an entry.`
    }
    return null
  }

  /** Nightly rate: custom overrides room master price when set. */
  const resolveRatePerNight = (room: { price_per_night?: number | null }) => {
    const custom = Number(customRate)
    if (customRate !== '' && !Number.isNaN(custom) && custom > 0) return custom
    const fallback = Number(room?.price_per_night ?? 0)
    return fallback > 0 ? fallback : 0
  }

  const medianInventoryRate = () => {
    const raw = [...new Set(allRooms.map((r: any) => Number(r.price_per_night || 0)).filter((p) => p > 0))]
    raw.sort((a, b) => a - b)
    if (!raw.length) return 0
    return raw[Math.floor(raw.length / 2)]
  }

  const bulkRoomNightRates = useMemo((): number[] => {
    if (pickedRoomIds.length > 0) {
      return pickedRoomIds
        .map((id) => allRooms.find((r: { id: string }) => r.id === id))
        .filter(Boolean)
        .map((room) => resolveRatePerNight(room as { price_per_night?: number | null }))
        .filter((r) => r > 0)
    }

    if (!fillLater) {
      const rates: number[] = []
      for (const entry of entries) {
        const qty = Number(entry.numberOfRooms) || 0
        if (!entry.roomType || qty <= 0) continue
        const pool = sortRoomsByNumber(
          allRooms.filter(
            (r: { room_type?: string }) => r.room_type === entry.roomType,
          ),
        )
        if (!pool.length) continue
        const nightly = resolveRatePerNight(pool[0] as { price_per_night?: number | null })
        if (nightly > 0) {
          for (let i = 0; i < qty; i++) rates.push(nightly)
        }
      }
      if (rates.length) return rates
    }

    const quickCount = fillLater ? Number(totalRoomsCount) || 0 : 0
    if (quickCount > 0) {
      const custom = Number(customRate)
      const nightly =
        customRate !== '' && !Number.isNaN(custom) && custom > 0
          ? custom
          : medianInventoryRate()
      if (nightly > 0) return Array.from({ length: quickCount }, () => nightly)
    }

    return []
  }, [pickedRoomIds, allRooms, fillLater, entries, totalRoomsCount, customRate])

  const bulkRoomSlotCount = bulkRoomNightRates.length

  const bulkBlockStayTotal = useMemo(
    () =>
      nights > 0
        ? bulkRoomNightRates.reduce((sum, nightly) => sum + nightly * nights, 0)
        : 0,
    [bulkRoomNightRates, nights],
  )

  const bulkPerRoomStayTotal = useMemo(() => {
    if (!bulkRoomSlotCount || bulkBlockStayTotal <= 0) return 0
    return bulkBlockStayTotal / bulkRoomSlotCount
  }, [bulkBlockStayTotal, bulkRoomSlotCount])

  const bulkCashPayingPerRoom = useMemo(() => {
    if (pendingHold || bulkPerRoomStayTotal <= 0) return 0
    const raw = Number(partialAmount) || 0
    if (paymentStatus === 'paid') {
      return payAboveBulkRoomTotal
        ? Math.max(bulkPerRoomStayTotal, raw || bulkPerRoomStayTotal)
        : bulkPerRoomStayTotal
    }
    if (paymentStatus === 'partial') return raw
    return 0
  }, [
    pendingHold,
    bulkPerRoomStayTotal,
    paymentStatus,
    payAboveBulkRoomTotal,
    partialAmount,
  ])

  const bulkCashPayingBlock = useMemo(
    () => bulkCashPayingPerRoom * bulkRoomSlotCount,
    [bulkCashPayingPerRoom, bulkRoomSlotCount],
  )

  const checkRoomAvailability = () => {
    if (!checkIn || !checkOut || nights <= 0) { toast.error('Select valid check-in and check-out dates'); return }
    const cin = toLocalDateStr(checkIn)
    const cout = toLocalDateStr(checkOut)
    setPickedRoomIds([])
    const bookedRoomIds = new Set(
      allActiveBookings
        .filter(b => b.check_in < cout && b.check_out > cin && b.room_id)
        .map(b => b.room_id),
    )
    const available = allRooms.filter(
      (r: any) => r.status !== 'maintenance' && r.id && !bookedRoomIds.has(r.id),
    )
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
    if (pendingHold) return true
    if (paymentStatus === 'partial' && (!partialAmount || Number(partialAmount) <= 0)) return false
    if (paymentStatus === 'paid' && payAboveBulkRoomTotal && (!partialAmount || Number(partialAmount) <= 0)) return false
    return true
  }

  const canApproveBackdates = hasPermission(currentUserRole, 'backdate:approve')
  const { closedDates: nightAuditClosedDates } = useNightAuditClosedDates(currentUserId, open)
  const isBackdated = checkIn
    ? isStayCheckInConsideredBackdated(toLocalDateStr(checkIn), new Date(), undefined, {
        auditedDates: nightAuditClosedDates,
      })
    : false
  const minCheckInYmd = minSelectableCheckInYmdHotel()
  const minCheckInDate = parseHotelYmdToLocalDate(minCheckInYmd)
  const inLateCheckInGrace = isLateNightCheckInGraceWindow()

  useEffect(() => {
    if (!open) return
    const ymd = defaultStayCheckInYmdHotel(new Date(), undefined, {
      auditedDates: nightAuditClosedDates,
    })
    const ci = parseHotelYmdToLocalDate(ymd)
    setCheckIn(ci)
    setCheckOut(addDays(ci, 1))
    // eslint-disable-next-line react-hooks/exhaustive-deps -- apply once per open
  }, [open])

  const copy =
    wording === 'booking'
      ? {
          title: (step: number) => `Bulk booking — Step ${step} of 2`,
          typeLabel: 'Booking type',
          backdateBlocked: 'Backdated bulk bookings require Night Audit approval. Send a request first.',
          backdatePlaceholder: 'Explain why this bulk booking must be backdated (for Night Audit approval)',
          backdateHelp: 'A Superadmin, Administrator, or Manager can approve or allow an approved backdated bulk booking.',
          confirm: 'Confirm bulk booking',
        }
      : {
          title: (step: number) => `Bulk reservation — Step ${step} of 2`,
          typeLabel: 'Reservation type',
          backdateBlocked: 'Backdated bulk reservations require Night Audit approval. Send a request first.',
          backdatePlaceholder: 'Explain why this bulk reservation must be backdated (for Night Audit approval)',
          backdateHelp: 'A Superadmin, Administrator, or Manager can approve or allow an approved backdated bulk reservation.',
          confirm: 'Confirm bulk reservation',
        }

  const bulkBackdateRequestType =
    wording === 'booking' ? 'bulk_booking' : 'bulk_reservation'

  const buildBulkBackdateFingerprint = () => {
    if (!checkIn || !checkOut || !orgId || !currentUserId) return ''
    const cin = toLocalDateStr(checkIn)
    const cout = toLocalDateStr(checkOut)
    const entryPart = fillLater
      ? `later:${String(totalRoomsCount)}`
      : entries
          .map((e) => `${normalizeNameKey(e.roomType)}:${e.numberOfRooms}:${normalizeNameKey(e.guestName)}`)
          .sort()
          .join('|')
    const roomsPart = pickedRoomIds.slice().sort().join(',')
    return [wording, bookingType, cin, cout, entryPart, String(customRate ?? ''), roomsPart].join('§')
  }

  const hasApprovedBackdateRequest = async () => {
    if (!checkIn || !orgId || !currentUserId) return false
    const fp = buildBulkBackdateFingerprint()
    const dedupe = buildBackdateDedupeKey({
      organizationId: orgId,
      requestedBy: currentUserId,
      requestType: bulkBackdateRequestType,
      requestedCheckIn: toLocalDateStr(checkIn),
      requestedCheckOut: checkOut ? toLocalDateStr(checkOut) : undefined,
      bulkFingerprint: fp,
    })
    const res = await fetch(`/api/backdate-requests?caller_id=${currentUserId}`, { credentials: 'include' })
    const json = await res.json()
    if (!res.ok) return false
    return (json.requests || []).some((request: any) => {
      if (request.status !== 'approved') return false
      const typeOk =
        request.request_type === bulkBackdateRequestType ||
        request.request_type === 'bulk_booking'
      if (!typeOk) return false
      if (request.dedupe_key === dedupe) return true
      return (
        request.requested_check_in === toLocalDateStr(checkIn)
        && (!checkOut || request.requested_check_out === toLocalDateStr(checkOut))
      )
    })
  }

  const handleRequestBackdate = async () => {
    if (!checkIn) { toast.error('Select a backdated check-in date'); return }
    if (!checkOut) { toast.error('Select check-out date'); return }
    if (!backdateReason.trim()) { toast.error('Enter a reason for the approver'); return }
    setLoading(true)
    try {
      const bulk_fingerprint = buildBulkBackdateFingerprint()
      const res = await fetch('/api/backdate-requests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          caller_id: currentUserId,
          request_type: bulkBackdateRequestType,
          requested_check_in: toLocalDateStr(checkIn),
          requested_check_out: checkOut ? toLocalDateStr(checkOut) : null,
          reason: backdateReason,
          metadata: {
            wording,
            booking_type: bookingType,
            organization_name: selectedOrg?.name || null,
            room_count: fillLater ? totalRoomsCount : entries.reduce((sum, entry) => sum + entry.numberOfRooms, 0),
            bulk_fingerprint,
          },
        }),
      })
      const json = await res.json()
      if (res.status === 409) {
        toast.message(json.error || 'This backdate request is already pending')
        return
      }
      if (!res.ok) { toast.error(json.error || 'Failed to send backdate request'); return }
      toast.success('Backdate request submitted for approval')
      if (typeof window !== 'undefined') window.dispatchEvent(new Event('frontbill-backdate-pending-changed'))
      setBackdateReason('')
    } catch {
      toast.error('Failed to send backdate request')
    } finally {
      setLoading(false)
    }
  }

  const handleBackdatedBulkAction = async () => {
    if (await hasApprovedBackdateRequest()) {
      await handleSubmit()
      return
    }
    await handleRequestBackdate()
  }

  const handleSubmit = async () => {
    if (!checkIn || !checkOut) { toast.error('Dates required'); return }
    if (!canSubmit()) { toast.error('Complete payment details'); return }
    if (isBackdated && !canApproveBackdates && !(await hasApprovedBackdateRequest())) {
      toast.error(copy.backdateBlocked)
      return
    }

    const hotelTz = resolveHotelTimeZone()
    const todayYmd = formatYMDInTimeZone(new Date(), hotelTz)
    const checkInYmd = toLocalDateStr(checkIn)
    if (!isBackdated) {
      if (wording === 'booking' && checkInYmd > todayYmd) {
        toast.error('Bulk booking is for guests checking in today. Use Bulk reservation for future dates.')
        return
      }
      if (wording === 'reservation' && checkInYmd <= todayYmd) {
        toast.error('Bulk reservation requires a future check-in date. Use Bulk booking for same-day arrivals.')
        return
      }
    }

    if (!fillLater && entries.length > 0 && !entries[0].guestName.trim()) {
      toast.error('First room entry must have a guest name'); return
    }
    if (!fillLater && entries.some(e => !e.roomType)) {
      toast.error('Select a room type for each entry'); return
    }
    if (!fillLater && entries.some(e => !e.numberOfRooms || e.numberOfRooms < 1)) {
      toast.error('Enter a quantity of at least 1 for each room entry')
      return
    }

    const pickErr = pickedRoomsValidationError(pickedRoomIds)
    if (pickErr) { toast.error(pickErr); return }

    if (!fillLater) {
      const c = Number(customRate)
      const hasCustomRate = customRate !== '' && !Number.isNaN(c) && c > 0
      if (!hasCustomRate && medianInventoryRate() <= 0) {
        toast.error('Add nightly rates on your Rooms list or enter a custom nightly rate in Step 2.')
        return
      }
    }

    if (!fillLater) {
      const cin = toLocalDateStr(checkIn)
      const cout = toLocalDateStr(checkOut)
      const bookedIds = new Set(
        allActiveBookings
          .filter(b => b.check_in < cout && b.check_out > cin && b.room_id)
          .map(b => b.room_id),
      )
      const requestedByType: Record<string, number> = {}
      entries.forEach((entry) => {
        requestedByType[entry.roomType] = (requestedByType[entry.roomType] || 0) + entry.numberOfRooms
      })

      if (pickedRoomIds.length === 0) {
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
              .join(' | '),
          )
          return
        }
      }
    }

    if (!fillLater && pickedRoomIds.length > 0) {
      const cin = toLocalDateStr(checkIn)
      const cout = toLocalDateStr(checkOut)
      const overlapBooked = new Set(
        allActiveBookings
          .filter(b => b.check_in < cout && b.check_out > cin && b.room_id)
          .map(b => b.room_id),
      )
      for (const id of pickedRoomIds) {
        if (overlapBooked.has(id)) {
          toast.error('One or more picked rooms overlap another booking — run availability again.')
          return
        }
      }
    }

    if (fillLater) {
      if (pickedRoomIds.length === 0) {
        const count = Number(totalRoomsCount)
        if (!count || count < 1) {
          toast.error('Enter total number of rooms to reserve')
          return
        }
      }
      if (bulkBlockStayTotal <= 0 || bulkRoomSlotCount === 0) {
        toast.error('Set nightly prices on your room list or enter an optional custom rate above.')
        return
      }
    }

    setLoading(true)
    try {
      const supabase = createClient()
      let createdCount = 0

      /** When Step 1 rooms are locked, dequeue by type in numeric room-number order */
      let pickedQueues: Record<string, any[]> | null = null
      if (!fillLater && pickedRoomIds.length > 0) {
        pickedQueues = {}
        const byType: Record<string, any[]> = {}
        for (const pid of pickedRoomIds) {
          const row = allRooms.find((r: any) => r.id === pid)
          if (!row?.room_type) continue
          if (!byType[row.room_type]) byType[row.room_type] = []
          byType[row.room_type].push(row)
        }
        for (const [rt, rows] of Object.entries(byType)) {
          pickedQueues[rt] = sortRoomsByNumber(rows)
        }
      }

      const totalRooms = fillLater
        ? pickedRoomIds.length > 0
          ? pickedRoomIds.length
          : Number(totalRoomsCount) || 1
        : entries.reduce((s, e) => s + e.numberOfRooms, 0)
      const guestCache = new Map<string, string | null>()
      const orgNameKey = normalizeNameKey(selectedOrg?.name || '')
      const bulkGroupId = createBulkGroupId()
      /** Bulk booking = same-day check-in; bulk reservation = future arrival, stays reserved. */
      const bulkInitialStatus = wording === 'booking' ? 'checked_in' : 'reserved'
      const bulkRoomStatus = bulkInitialStatus === 'checked_in' ? 'occupied' : 'reserved'
      let runningCashbackBalance = bulkCashbackEligible ? guestCashbackBalance : 0

      const postBulkPaymentLines = async (args: {
        bookingId: string
        guestId: string | null
        folioId: string
        roomNumber: string | number
        totalAmt: number
        pay: ReturnType<typeof resolveBulkRoomPayment>
        slotIndex: number
      }) => {
        const { bookingId, guestId, folioId, roomNumber, totalAmt, pay, slotIndex } = args
        if (pendingHold || pay.depositAmt <= 0) return

        const roomCashback = bulkRoomUsesStep1Cashback({
          cashbackEligible: bulkCashbackEligible,
          step1GuestId: selectedGroupGuest?.id,
          roomGuestId: guestId,
        })

        if (roomCashback && guestId) {
          await applyCashbackDiscountAndFolioPayments(supabase, {
            guestId,
            bookingId,
            organizationId: orgId,
            cashbackDiscount: pay.cashbackDiscount,
            cashAmount: pay.cashToCollect,
            cashPaymentMethod: paymentMethod,
            createdBy: currentUserId,
            sourceType: 'bulk_booking_payment',
            sourceId: bookingId,
            cashDescription: `${
              wording === 'booking' ? 'Bulk booking' : 'Bulk reservation'
            } payment - ${paymentMethod}`,
          })
          if (
            paymentMethodEarnsCashback(paymentMethod) &&
            pay.cashToCollect > 0
          ) {
            await earnCashbackClient(supabase, {
              guestId,
              amount: pay.cashToCollect,
              paymentMethod,
              sourceType: 'bulk_booking_payment',
              sourceId: bookingId,
            })
          }
        } else {
          const { error: payFcErr } = await insertFolioCharges(supabase, [
            {
              booking_id: bookingId,
              organization_id: orgId,
              description: `${
                wording === 'booking' ? 'Bulk booking' : 'Bulk reservation'
              } payment - ${paymentMethod}`,
              amount: -pay.depositAmt,
              charge_type: 'payment',
              payment_method: paymentMethod,
              payment_status: 'paid',
              created_by: currentUserId,
            },
          ])
          if (payFcErr) throw payFcErr
        }

        if (guestId) {
          await supabase.from('payments').insert([
            {
              organization_id: orgId,
              booking_id: bookingId,
              guest_id: guestId,
              amount: Math.min(pay.cashToCollect || pay.depositAmt, totalAmt),
              payment_method: paymentMethod,
              payment_date: new Date().toISOString(),
              notes:
                pay.cashbackDiscount > 0
                  ? `Bulk ${wording} payment — ${folioId} (incl. ${formatNaira(pay.cashbackDiscount)} cashback discount)`
                  : `Bulk ${wording} payment — ${folioId}`,
              received_by: currentUserId,
            },
          ])
        }

        await supabase.from('transactions').insert([
          {
            organization_id: orgId,
            booking_id: bookingId,
            transaction_id: `TXN-${Date.now().toString(36).toUpperCase()}-${slotIndex}`,
            guest_name:
              selectedGroupGuest?.name || selectedOrg?.name || 'Bulk Guest',
            room: roomNumber,
            amount: Math.min(pay.cashToCollect || pay.depositAmt, totalAmt),
            payment_method: paymentMethod,
            status:
              pay.bookingPaymentStatus === 'paid'
                ? 'paid'
                : pay.bookingPaymentStatus === 'partial'
                  ? 'partial'
                  : 'pending',
            description: `${
              wording === 'booking' ? 'Bulk booking' : 'Bulk reservation'
            } payment — ${folioId}`,
            received_by: currentUserId,
          },
        ])
      }

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

        const orgNameDup = await guestOrOrganizationNameTaken(supabase, {
          hotelTenantOrganizationId: orgId,
          candidateName: formattedName,
        })
        if (orgNameDup) {
          throw new Error(`Name "${formattedName}" is already used by a guest or organization`)
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
        let fillLaterGuestId: string | null = null
        if (bookingType === 'individual' && selectedGroupGuest?.id) {
          fillLaterGuestId = selectedGroupGuest.id
        } else if (bookingType === 'organization' && selectedOrg?.name) {
          fillLaterGuestId = await findOrCreateGuest(
            `Bulk group — ${selectedOrg.name}`,
            selectedOrg.phone || null,
          )
        }
        if (!fillLaterGuestId) {
          throw new Error(
            'Could not resolve a guest for this bulk group. Select a group contact in Step 1.',
          )
        }

        const cin = toLocalDateStr(checkIn)
        const cout = toLocalDateStr(checkOut)
        const bookedIds = new Set(
          allActiveBookings
            .filter((b) => b.check_in < cout && b.check_out > cin && b.room_id)
            .map((b) => b.room_id),
        )
        const availablePool = sortRoomsByNumber(
          allRooms.filter((r: { id: string }) => !bookedIds.has(r.id)),
        )
        const roomsForBlock =
          pickedRoomIds.length > 0
            ? sortRoomsByNumber(
                pickedRoomIds
                  .map((id) => allRooms.find((r: { id: string }) => r.id === id))
                  .filter(Boolean) as Array<{ id: string; room_number?: string | number }>,
              )
            : availablePool.slice(0, totalRooms)

        if (roomsForBlock.length < totalRooms) {
          throw new Error(
            `Only ${roomsForBlock.length} room${roomsForBlock.length === 1 ? '' : 's'} available for these dates; you requested ${totalRooms}.`,
          )
        }

        for (let i = 0; i < roomsForBlock.length; i++) {
          const room = roomsForBlock[i]
          const folioId = `BLK-${Date.now().toString(36).toUpperCase()}-${i}`
          const notes = appendBulkGroupNote(`payment_method: ${paymentMethod}`, bulkGroupId)
          const ratePn = resolveRatePerNight(room as { price_per_night?: number | null })
          if (ratePn <= 0) {
            throw new Error(
              `Missing nightly price for room ${room.room_number ?? room.id}. Set it under Rooms or enter a custom rate in Step 2.`,
            )
          }
          const totalAmt = ratePn * nights
          const pay = bulkCashbackEligible
            ? resolveBulkRoomPayment(totalAmt, bulkPaymentOpts, {
                balance: runningCashbackBalance,
                apply: applyCashback,
              })
            : {
                ...computeBulkRoomPaymentAmounts(totalAmt, bulkPaymentOpts),
                cashbackDiscount: 0,
                cashToCollect: computeBulkRoomPaymentAmounts(totalAmt, bulkPaymentOpts)
                  .depositAmt,
                cashbackBalanceAfter: runningCashbackBalance,
              }
          if (bulkCashbackEligible) {
            runningCashbackBalance = pay.cashbackBalanceAfter
          }

          const { data: booking, error: insertErr } = await supabase
            .from('bookings')
            .insert([
              {
                organization_id: orgId,
                guest_id: fillLaterGuestId,
                room_id: room.id,
                folio_id: folioId,
                check_in: cin,
                check_out: cout,
                number_of_nights: nights,
                rate_per_night: ratePn,
                total_amount: totalAmt,
                deposit: pay.depositAmt,
                balance: pay.balanceAmt,
                payment_status: pay.bookingPaymentStatus,
                status: bulkInitialStatus,
                created_by: currentUserId,
                notes,
              },
            ])
            .select()
            .single()
          if (insertErr) throw insertErr

          await supabase
            .from('rooms')
            .update({
              status: bulkRoomStatus,
              updated_by: currentUserId,
              updated_at: new Date().toISOString(),
            })
            .eq('id', room.id)

          const { error: fcErr } = await insertFolioCharges(supabase, [
            {
              booking_id: booking.id,
              organization_id: orgId,
              description: `${
                wording === 'booking' ? 'Bulk booking' : 'Bulk reservation'
              } room charge - ${nights} night${nights !== 1 ? 's' : ''}`,
              amount: totalAmt,
              charge_type: 'room_charge',
              payment_method: paymentMethod,
              ledger_account_id: null,
              ledger_account_type: null,
              payment_status: pay.folioChargePaid ? 'paid' : 'unpaid',
              created_by: currentUserId,
            },
          ])
          if (fcErr) throw fcErr

          await postBulkPaymentLines({
            bookingId: booking.id,
            guestId: fillLaterGuestId,
            folioId,
            roomNumber: room.room_number,
            totalAmt,
            pay,
            slotIndex: i,
          })

          createdCount++
        }
      } else {
        for (const entry of entries) {
          const totalRoomSlots = entry.numberOfRooms
          const cin = toLocalDateStr(checkIn)
          const cout = toLocalDateStr(checkOut)
          const bookedIds = new Set(
            allActiveBookings
              .filter(b => b.check_in < cout && b.check_out > cin && b.room_id)
              .map(b => b.room_id),
          )

          let finalGuestId = entry.guestId
          const entryGuestName = formatPersonName(entry.guestName)
          if (!finalGuestId && entryGuestName) finalGuestId = await findOrCreateGuest(entryGuestName, entry.phone || null)
          if (!finalGuestId) finalGuestId = fallbackGuestId

          for (let slot = 0; slot < totalRoomSlots; slot++) {
            let room: any
            if (pickedQueues) {
              const q = pickedQueues[entry.roomType] || []
              room = q.shift()
              if (!room) {
                toast.error(`Not enough picked ${entry.roomType} rooms — adjust Step 2 or room selection in Step 1.`)
                return
              }
            } else {
              const pool = sortRoomsByNumber(
                allRooms.filter(
                  (r: any) => r.room_type === entry.roomType && !bookedIds.has(r.id) && !usedRoomIds.has(r.id),
                ),
              )
              room = pool[0]
              if (!room) {
                throw new Error(`No available ${entry.roomType} rooms for these dates`)
              }
            }

            usedRoomIds.add(room.id)
            const ratePn = resolveRatePerNight(room)
            if (ratePn <= 0) {
              toast.error(`Missing nightly price for room ${room.room_number}. Set it under Rooms or enter a custom rate in Step 2.`)
              return
            }

            const total = ratePn * nights
            const roomCashback = bulkRoomUsesStep1Cashback({
              cashbackEligible: bulkCashbackEligible,
              step1GuestId: selectedGroupGuest?.id,
              roomGuestId: finalGuestId,
            })
            const pay = roomCashback
              ? resolveBulkRoomPayment(total, bulkPaymentOpts, {
                  balance: runningCashbackBalance,
                  apply: applyCashback,
                })
              : {
                  ...computeBulkRoomPaymentAmounts(total, bulkPaymentOpts),
                  cashbackDiscount: 0,
                  cashToCollect: computeBulkRoomPaymentAmounts(total, bulkPaymentOpts)
                    .depositAmt,
                  cashbackBalanceAfter: runningCashbackBalance,
                }
            if (roomCashback) {
              runningCashbackBalance = pay.cashbackBalanceAfter
            }
            const depositAmt = pay.depositAmt
            const balanceAmt = pay.balanceAmt
            const folioId = `BLK-${Date.now().toString(36).toUpperCase()}`
            const bookingBalance = balanceAmt
            const notes = appendBulkGroupNote(`payment_method: ${paymentMethod}`, bulkGroupId)

            const { data: booking, error: be } = await supabase.from('bookings').insert([{
              organization_id: orgId, guest_id: finalGuestId, room_id: room.id, folio_id: folioId,
              check_in: toLocalDateStr(checkIn), check_out: toLocalDateStr(checkOut),
              number_of_nights: nights, rate_per_night: ratePn,
              total_amount: total, deposit: depositAmt, balance: bookingBalance,
              payment_status: pay.bookingPaymentStatus,
              status: bulkInitialStatus, created_by: currentUserId,
              notes,
            }]).select().single()
            if (be) throw be

            await supabase.from('rooms').update({ status: bulkRoomStatus, updated_by: currentUserId, updated_at: new Date().toISOString() }).eq('id', room.id)
            const { error: fcErr } = await insertFolioCharges(supabase, [{
              booking_id: booking.id,
              organization_id: orgId,
              description: `${
                wording === 'booking' ? 'Bulk booking' : 'Bulk reservation'
              } room charge - ${nights} night${nights !== 1 ? 's' : ''}`,
              amount: total,
              charge_type: 'room_charge',
              payment_method: paymentMethod,
              ledger_account_id: null,
              ledger_account_type: null,
              payment_status: pay.folioChargePaid ? 'paid' : 'unpaid',
              created_by: currentUserId,
            }])
            if (fcErr) throw fcErr

            await postBulkPaymentLines({
              bookingId: booking.id,
              guestId: finalGuestId,
              folioId,
              roomNumber: room.room_number,
              totalAmt: total,
              pay,
              slotIndex: createdCount,
            })

            const prepayExcess = Math.max(0, depositAmt - total)
            if (prepayExcess > 0 && finalGuestId) {
              const gn = formatPersonName(entry.guestName) || ''
              const { data: gRow } = await supabase.from('guests').select('name').eq('id', finalGuestId).maybeSingle()
              const ledgerGuestName = (gRow?.name || gn || selectedGroupGuest?.name || '').trim()
              if (ledgerGuestName) {
                await applyPaymentToGuestCityLedger(supabase, {
                  organizationId: orgId,
                  guestName: ledgerGuestName,
                  paymentAmount: prepayExcess,
                  createIfMissingExcess: prepayExcess,
                })
              }
            }
            createdCount++
          }
        }
      }

      if (createdCount <= 0) {
        throw new Error(
          wording === 'booking'
            ? 'No bookings were created — check room availability and try again'
            : 'No reservations were created — check room availability and try again',
        )
      }

      toast.success(
        `${createdCount} ${wording === 'booking' ? 'booking' : 'reservation'}${createdCount === 1 ? '' : 's'} created`,
      )
      onSuccess?.()
      handleClose()
    } catch (err: unknown) {
      toast.error(describeSupabaseError(err) || (wording === 'booking' ? 'Failed to create bookings' : 'Failed to create reservations'))
    } finally {
      setLoading(false)
    }
  }

  const handleClose = () => {
    setStep(1); setBookingType('organization')
    setOrgSearch(''); setOrgResults([]); setAllCounterpartyOrgs([]); setSelectedOrg(null); setOrgSearchOpen(false); setShowNewOrgForm(false)
    setNewOrgName(''); setNewOrgType(''); setNewOrgContact(''); setNewOrgPhone(''); setNewOrgEmail(''); setNewOrgAddress('')
    setGroupGuestSearch(''); setGroupGuestResults([]); setSelectedGroupGuest(null); setGroupGuestSearchOpen(false)
    setShowNewGuestForm(false); setNewGuestName(''); setNewGuestPhone(''); setNewGuestEmail(''); setNewGuestAddress('')
    setCheckIn(undefined); setCheckOut(undefined); setBackdateReason(''); setRoomAvailabilityChecked(false); setAvailableRooms([])
    setCustomRate(''); setPaymentMethod('pos'); setPaymentStatus('unpaid'); setPartialAmount('')
    setPayAboveBulkRoomTotal(false)
    setLedgerSearch(''); setLedgerResults([]); setSelectedLedger(null); setLedgerSearchOpen(false)
    setShowNewLedgerOrgForm(false); setNewLedgerOrgName(''); setNewLedgerOrgEmail(''); setNewLedgerOrgPhone('')
    setEntries([makeEntry()]); setQuickRoomCount(''); setQuickRoomType(''); setFillLater(true); setTotalRoomsCount('')
    setPickedRoomIds([])
    setGuestCashbackBalance(0); setApplyCashback(false)
    onClose()
  }

  const stepLabel = step === 1 ? 'Group Contact, Dates & Room Availability' : 'Payment & Room Entries'

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className={cn(dialogScrollableContentClass, 'max-w-3xl')}>
        <DialogScrollableHeader>
          <DialogTitle>{copy.title(step)}</DialogTitle>
          <DialogDescription>{stepLabel}</DialogDescription>
        </DialogScrollableHeader>

        <SelectedRoomsStickyBar roomNumbers={pickedRoomNumbers} />

        <DialogScrollableBody className="space-y-4">
        <div className="flex items-center gap-2 pb-1">
          {[1,2].map(s => (
            <div key={s} className={`flex-1 h-1.5 rounded-full transition-colors ${s <= step ? 'bg-primary' : 'bg-muted'}`} />
          ))}
        </div>

        {/* ── STEP 1: Booking Type + Contact ── */}
        {step === 1 && (
          <div className="space-y-5 py-2">
            <div className="space-y-2">
              <Label>{copy.typeLabel}</Label>
              <Select value={bookingType} onValueChange={(v: any) => {
                setBookingType(v); setSelectedOrg(null); setOrgSearch(''); setSelectedGroupGuest(null); setGroupGuestSearch(''); setShowNewOrgForm(false); setShowNewGuestForm(false)
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
                      onFocus={() => {
                        if (allCounterpartyOrgs.length === 0) void refreshCounterpartyOrgCache()
                      }}
                      onBlur={() => setTimeout(() => setOrgSearchOpen(false), 150)}
                    />
                    {orgSearching && <Loader2 className="absolute right-3 top-3 h-4 w-4 animate-spin text-muted-foreground" />}
                    {orgSearchOpen && orgResults.length > 0 && (
                      <div className="absolute top-full left-0 right-0 mt-1 bg-background border rounded-md shadow-lg z-50 max-h-48 overflow-y-auto">
                        {orgResults.map((org) => (
                          <button key={`${org.source}-${org.id}`} className="w-full text-left px-4 py-2 hover:bg-accent border-b last:border-b-0 text-sm"
                            onMouseDown={(e) => { e.preventDefault(); setSelectedOrg(org); setOrgSearch(org.name); setOrgSearchOpen(false) }}>
                            <div className="font-medium">{org.name}</div>
                            <div className="text-xs text-muted-foreground">
                              {org.phone || ''}
                              {org.email && !String(org.email).endsWith('@counterparty.invalid') ? ` · ${org.email}` : ''}
                            </div>
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
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <Label>Group Contact (Guest) *</Label>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="h-7 text-xs gap-1"
                    onClick={() => {
                      setShowNewGuestForm((v) => !v)
                      if (!showNewGuestForm) setNewGuestName(groupGuestSearch)
                    }}
                  >
                    <Plus className="h-3 w-3" /> New Individual
                  </Button>
                </div>

                {!showNewGuestForm && (
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
                    {groupGuestSearch.trim() && groupGuestResults.length === 0 && !selectedGroupGuest && (
                      <p className="text-xs text-muted-foreground mt-1">No guest found. Click &quot;New Individual&quot; to create one.</p>
                    )}
                  </div>
                )}

                {showNewGuestForm && (
                  <div className="border rounded-lg p-4 space-y-3 bg-muted/20">
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-medium">Create New Individual</p>
                      <button type="button" onClick={() => setShowNewGuestForm(false)}>
                        <X className="h-4 w-4 text-muted-foreground" />
                      </button>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="col-span-2 space-y-1">
                        <Label className="text-xs">Full Name *</Label>
                        <Input
                          value={newGuestName}
                          onChange={(e) => setNewGuestName(titleCaseWhileTyping(e.target.value))}
                          placeholder="e.g. Ada Okonkwo"
                        />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">Phone Number</Label>
                        <Input value={newGuestPhone} onChange={(e) => setNewGuestPhone(e.target.value)} placeholder="Phone" />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">Email Address</Label>
                        <Input type="email" value={newGuestEmail} onChange={(e) => setNewGuestEmail(e.target.value)} placeholder="Email" />
                      </div>
                      <div className="col-span-2 space-y-1">
                        <Label className="text-xs">Address</Label>
                        <Input value={newGuestAddress} onChange={(e) => setNewGuestAddress(e.target.value)} placeholder="Street address (optional)" />
                      </div>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Phone or email is required. The guest is saved immediately and appears in booking and reservation search.
                    </p>
                    <Button size="sm" className="w-full" onClick={createNewGuest} disabled={creatingGuest}>
                      {creatingGuest ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                      {creatingGuest ? 'Creating...' : 'Create Individual'}
                    </Button>
                  </div>
                )}

                {selectedGroupGuest && (
                  <div className="flex items-center gap-2 p-2 rounded border bg-muted/40 text-sm">
                    <Users className="h-4 w-4 text-muted-foreground" />
                    <span className="font-medium">{selectedGroupGuest.name}</span>
                    {selectedGroupGuest.phone && (
                      <span className="text-muted-foreground">· {selectedGroupGuest.phone}</span>
                    )}
                    <button
                      type="button"
                      className="ml-auto text-xs text-destructive hover:underline"
                      onClick={() => { setSelectedGroupGuest(null); setGroupGuestSearch('') }}
                    >
                      Remove
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* Dates + Room Availability — merged into step 1 */}
            <StayDateRangeFields
              layout="inline"
              checkIn={checkIn}
              checkOut={checkOut}
              nights={checkIn && checkOut ? Math.max(differenceInDays(checkOut, checkIn), 0) : 0}
              onDatesChange={(from, to) => {
                setCheckIn(from)
                setCheckOut(to)
                setRoomAvailabilityChecked(false)
                setAvailableRooms([])
                setPickedRoomIds([])
              }}
              onNightsChange={(n) => {
                if (!checkIn) return
                setCheckOut(addDays(checkIn, n))
                setRoomAvailabilityChecked(false)
                setAvailableRooms([])
                setPickedRoomIds([])
              }}
              showNights
              minCheckIn={minCheckInDate}
              disableCalendar={(d) => {
                if (!checkIn) return false
                if (!checkOut) return d <= checkIn
                return false
              }}
            />

            {!isBackdated &&
              (inLateCheckInGrace || (checkIn && toLocalDateStr(checkIn) === minCheckInYmd)) && (
              <p className="text-xs text-muted-foreground rounded-md border border-dashed px-3 py-2">
                {inLateCheckInGrace
                  ? `Late arrival window (until ${lateCheckInGraceWindowLabel()} hotel time): check-in defaults to yesterday.`
                  : 'Previous-day check-in is allowed.'}{' '}
                No Night Audit approval is needed until that date is closed with Run Night Audit — then manager
                approval is required.
              </p>
            )}

            {checkIn && checkOut && nights > 0 && (
              <p className="text-sm text-muted-foreground">{nights} night(s) · {format(checkIn, 'dd MMM')} — {format(checkOut, 'dd MMM yyyy')}</p>
            )}

            {isBackdated && !canApproveBackdates && (
              <div className="space-y-2 rounded-md border border-amber-200 bg-amber-50 p-3">
                <Label>Reason for Backdate Request *</Label>
                <Textarea
                  value={backdateReason}
                  onChange={(e) => setBackdateReason(e.target.value)}
                  placeholder={copy.backdatePlaceholder}
                />
                <p className="text-xs text-amber-700">{copy.backdateHelp}</p>
              </div>
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
                    <p className="text-xs text-muted-foreground pt-1">
                      Optionally pick exact rooms to hold below — totals per room type must match your Step 2 entries. Leave unchecked to assign automatically by type.
                    </p>
                    {pickedRoomIds.length > 0 ? (
                      <p className="text-xs font-medium">{pickedRoomIds.length} room(s) selected</p>
                    ) : null}
                    <div className="max-h-52 overflow-y-auto rounded-md border bg-background mt-2">
                      {roomTypes.every((rt) => availableRooms.filter((r) => r.room_type === rt).length === 0) ? (
                        <p className="text-sm text-muted-foreground p-3">No vacant rooms overlap these dates.</p>
                      ) : (
                        roomTypes.map((rt) => {
                          const rows = sortRoomsByNumber(
                            availableRooms.filter((r: any) => r.room_type === rt),
                          )
                          if (!rows.length) return null
                          return (
                            <div key={rt} className="border-b last:border-b-0">
                              <div className="sticky top-0 z-[1] bg-muted/70 px-2 py-1.5 text-xs font-medium">{rt}</div>
                              {rows.map((r: any) => (
                                <label
                                  key={r.id}
                                  className="flex items-center gap-3 px-2 py-1.5 text-sm hover:bg-muted/40 cursor-pointer border-t border-muted/60 first:border-t-0"
                                >
                                  <Checkbox
                                    checked={pickedRoomIds.includes(r.id)}
                                    onCheckedChange={() => togglePickedRoom(r.id)}
                                  />
                                  <span className="tabular-nums font-medium w-14">Rm {r.room_number}</span>
                                  <span className="text-muted-foreground text-xs flex-1 truncate">{r.room_type}</span>
                                  {r.price_per_night != null && Number(r.price_per_night) > 0 && (
                                    <span className="text-xs text-muted-foreground whitespace-nowrap">
                                      {formatNaira(Number(r.price_per_night))}/nt
                                    </span>
                                  )}
                                </label>
                              ))}
                  </div>
                          )
                        })
                      )}
                    </div>
                    {pickedRoomIds.length > 0 && (
                      <Button type="button" variant="ghost" size="sm" className="h-8 text-xs" onClick={() => setPickedRoomIds([])}>
                        Clear selection
                      </Button>
                    )}
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
                <Label>Custom Rate Per Room</Label>
                <Input
                  type="number"
                  min={0}
                  placeholder="Uses each room's nightly price when left blank"
                  value={customRate}
                  onChange={(e) => setCustomRate(e.target.value === '' ? '' : Number(e.target.value))}
                />
                <p className="text-xs text-muted-foreground">
                  Optional. Applies to every room when set; otherwise the master room nightly rate is used.
                </p>
              </div>
              <div className="space-y-2">
                <Label>Payment Method</Label>
                <Select
                  value={paymentMethod}
                  onValueChange={(v: ReservationPaymentMethod) => {
                    if (v === RESERVATION_PAYMENT_METHOD_PENDING) {
                      setPaymentMethod(v)
                      setPaymentStatus('unpaid')
                      setPartialAmount('')
                      setPayAboveBulkRoomTotal(false)
                    } else {
                      setPaymentMethod(v)
                    }
                  }}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {RESERVATION_PAYMENT_METHOD_OPTIONS.map((o) => (
                      <SelectItem key={o.value} value={o.value}>
                        {o.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  {pendingHold
                    ? 'Dates are held without payment. Collect later or cancel if the group does not attend.'
                    : 'Payment validates the block. Choose Pay now for full payment per room, Part payment for a deposit, or Unpaid to collect at check-in. Pending holds dates with no payment.'}
                </p>
              </div>

              <div className="space-y-2">
                <Label>Payment Status</Label>
                <Select
                  value={effectiveBulkPaymentStatus}
                  onValueChange={(v: 'paid' | 'partial' | 'unpaid') => {
                    if (v === 'unpaid') {
                      setPaymentStatus(v)
                      setPaymentMethod(RESERVATION_PAYMENT_METHOD_PENDING)
                      setPartialAmount('')
                      setPayAboveBulkRoomTotal(false)
                    } else {
                      setPaymentStatus(v)
                      if (paymentMethod === RESERVATION_PAYMENT_METHOD_PENDING) {
                        setPaymentMethod('pos')
                      }
                      if (v !== 'paid') setPayAboveBulkRoomTotal(false)
                    }
                  }}
                  disabled={pendingHold}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="unpaid">Unpaid — pay at check-in</SelectItem>
                    <SelectItem value="paid">Pay now</SelectItem>
                    <SelectItem value="partial">Part payment now</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {!pendingHold && paymentStatus === 'paid' && (
                <div className="flex items-start gap-2 rounded-md border border-input p-3">
                  <Checkbox
                    id="bulk-pay-above"
                    checked={payAboveBulkRoomTotal}
                    onCheckedChange={(c) => setPayAboveBulkRoomTotal(Boolean(c))}
                  />
                  <Label htmlFor="bulk-pay-above" className="text-sm font-normal leading-snug cursor-pointer">
                    Guest pays above the room total per booking — excess is saved as city ledger credit.
                  </Label>
                </div>
              )}

              {paymentStatus === 'paid' && payAboveBulkRoomTotal && (
                <div className="space-y-2">
                  <Label>Cash received per room (at least each room&apos;s calculated total)</Label>
                  <Input
                    type="number"
                    min={1}
                    placeholder="Enter amount collected per room"
                    value={partialAmount}
                    onChange={(e) => setPartialAmount(e.target.value === '' ? '' : Number(e.target.value))}
                  />
                </div>
              )}

              {!pendingHold && paymentStatus === 'partial' && (
                <div className="space-y-2">
                  <Label>Part Payment Amount (per room)</Label>
                  <Input type="number" min={1} placeholder="Amount paid now per room" value={partialAmount} onChange={(e) => setPartialAmount(e.target.value === '' ? '' : Number(e.target.value))} />
                </div>
              )}

              {bookingType === 'individual' &&
                selectedGroupGuest?.id &&
                !pendingHold &&
                bulkCashbackEligible &&
                bulkPerRoomStayTotal > 0 &&
                bulkRoomSlotCount > 0 && (
                  <CashbackPaymentPanel
                    guestId={selectedGroupGuest.id}
                    totalAmount={bulkBlockStayTotal}
                    cashPaying={bulkCashPayingBlock}
                    paymentMethod={paymentMethod}
                    applyCashback={applyCashback}
                    onApplyCashbackChange={setApplyCashback}
                    roomCount={bulkRoomSlotCount}
                    perRoomStayTotal={bulkPerRoomStayTotal}
                  />
                )}
            </div>

            <Separator />

            {/* Room entries */}
            <div className="space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm font-semibold">Room Entries</p>
                <Label className="flex items-center gap-2 cursor-pointer font-normal">
                  <Checkbox
                    checked={!fillLater}
                    onCheckedChange={(c) => {
                      const fillNow = Boolean(c)
                      setFillLater(!fillNow)
                      if (!fillNow) setPickedRoomIds([])
                    }}
                  />
                  <span className="text-sm">Fill room details now</span>
                </Label>
              </div>

              {fillLater ? (
                <div className="border rounded-lg p-4 bg-amber-50 border-amber-200 space-y-2">
                  <p className="text-sm text-amber-800 font-medium">Quick bulk block — group contact + auto room pick</p>
                  <p className="text-xs text-amber-700">
                    Creates one booking per room using the Step 1 group contact as guest and the next
                    available rooms for your dates. Use &quot;Fill room details now&quot; to name each guest
                    and pick room types yourself.
                  </p>
                  <div className="space-y-1 pt-1">
                    <Label className="text-xs">Total Number of Rooms to Reserve</Label>
                    <Input
                      inputMode="numeric"
                      placeholder="e.g., 50"
                      className="max-w-[160px]"
                      value={totalRoomsCount === '' ? '' : String(totalRoomsCount)}
                      onChange={(e) => {
                        const raw = e.target.value.replace(/\D/g, '')
                        setTotalRoomsCount(raw === '' ? '' : Number(raw))
                      }}
                    />
                  </div>
                </div>
              ) : (
                <>
                  {/* Quick-fill panel */}
                  <div className="flex items-end gap-2 p-3 bg-muted/30 rounded-lg">
                    <div className="space-y-1">
                      <Label className="text-xs">Number of Rooms</Label>
                      <Input
                        inputMode="numeric"
                        placeholder="e.g., 10"
                        className="w-28"
                        value={quickRoomCount === '' ? '' : String(quickRoomCount)}
                        onChange={(e) => {
                          const raw = e.target.value.replace(/\D/g, '')
                          setQuickRoomCount(raw === '' ? '' : Number(raw))
                        }}
                      />
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
                            <Input
                              inputMode="numeric"
                              className="w-20"
                              value={entry.numberOfRooms <= 0 ? '' : String(entry.numberOfRooms)}
                              onChange={(e) => {
                                const raw = e.target.value.replace(/\D/g, '')
                                const u = [...entries]
                                if (raw === '') u[i].numberOfRooms = 0
                                else {
                                  const n = parseInt(raw, 10)
                                  u[i].numberOfRooms = Number.isNaN(n) ? 0 : Math.min(999, n)
                                }
                                setEntries(u)
                              }}
                            />
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
        </DialogScrollableBody>

        <DialogScrollableFooter className="flex justify-between sm:justify-between">
          <Button variant="outline" onClick={() => step > 1 ? setStep(step - 1) : handleClose()} disabled={loading}>
            <ChevronLeft className="mr-2 h-4 w-4" />
            {step > 1 ? 'Back' : 'Cancel'}
          </Button>
          {step < 2 ? (
            <Button onClick={() => setStep(2)} disabled={!canGoStep2()}>
              Next <ChevronRight className="ml-2 h-4 w-4" />
            </Button>
          ) : (
            <Button
              onClick={isBackdated && !canApproveBackdates ? handleBackdatedBulkAction : handleSubmit}
              disabled={loading || !canSubmit()}
            >
              {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              {loading ? 'Working...' : isBackdated && !canApproveBackdates ? 'Request approval' : copy.confirm}
            </Button>
          )}
        </DialogScrollableFooter>
      </DialogContent>
    </Dialog>
  )
}
