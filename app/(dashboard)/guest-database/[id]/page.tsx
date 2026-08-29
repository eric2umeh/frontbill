'use client'

import { useState, useEffect, use } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
import { Label } from '@/components/ui/label'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { formatNaira } from '@/lib/utils/currency'
import {
  ArrowLeft, User, Phone, Mail, MapPin, Pencil,
  Calendar, CreditCard, TrendingUp, FileText, Building2, Hash,
  Wallet, ArrowDownCircle, ArrowUpCircle, Clock, RefreshCw,
  Trash2, Gift, Printer,
} from 'lucide-react'
import { format, isWithinInterval, parseISO, startOfDay, endOfDay, subYears } from 'date-fns'
import CityLedgerPaymentModal from '@/components/city-ledger/city-ledger-payment-modal'
import { useAuth } from '@/lib/auth-context'
import { hasPermission } from '@/lib/permissions'
import { toast } from 'sonner'
import { folioGuestCreditAmount, folioPositiveOutstandingSum, bookingDisplayBillBalance } from '@/lib/utils/booking-bill-balance'
import { calculateGuestBalancesBatch } from '@/lib/balance'
import {
  impliedGuestPrepaidCredit,
  isGuestCityLedgerCashInDescription,
  pickPreferredGuestLedgerAccount,
  guestCityLedgerDisplayBalance,
  fetchAllGuestCityLedgerAccounts,
} from '@/lib/utils/guest-city-ledger'
import { PageLoadingState } from '@/components/loading-screen'
import { fetchGuestCashbackBalanceClient } from '@/lib/cashback/cashback-client'
import { GuestCashbackPanel } from '@/components/cashback/guest-cashback-panel'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { GuestProfileEditPanel } from '@/components/guests/guest-profile-edit-panel'
import { Input } from '@/components/ui/input'
import { buildGuestAccountStatementHtml } from '@/lib/receipts/guest-account-statement'
import { printHtmlDocument } from '@/lib/receipts/receipt-pdf-print'

interface Guest {
  id: string
  name: string
  phone: string
  email: string
  address: string
  city: string
  country: string
  id_type: string
  id_number: string
  created_at: string
}

interface Booking {
  id: string
  folio_id: string
  check_in: string
  check_out: string
  number_of_nights: number
  total_amount: number
  deposit: number
  balance: number
  payment_status: string
  status: string
  folio_status?: string
  rooms: { room_number: string; room_type: string } | null
}

interface LedgerAccount {
  id: string | null
  balance: number
  account_name: string
  account_type: string
}

interface LedgerTransaction {
  id: string
  transaction_id: string
  amount: number
  payment_method: string
  status: string
  description: string
  created_at: string
}

export default function GuestDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const router = useRouter()
  // Prefer DB profile.role (source of truth) once loaded; matches layout AuthProvider but fixes any drift.
  const [resolvedRole, setResolvedRole] = useState<string | null>(null)
  const { role, userId: currentUserId, name } = useAuth()
  /** Product rule: Manager, Administrator, or Superadmin may edit/delete guest profiles (see hasPermission). */
  const canEditGuest = hasPermission(resolvedRole ?? role, 'guests:edit')
  const canDeleteGuest = hasPermission(resolvedRole ?? role, 'guests:delete')
  const canViewGuests = hasPermission(resolvedRole ?? role, 'guests:view')
  const canRepairBalance =
    hasPermission(resolvedRole ?? role, 'ledger:manage') ||
    hasPermission(resolvedRole ?? role, 'guests:edit')
  const [guest, setGuest] = useState<Guest | null>(null)
  const [bookings, setBookings] = useState<Booking[]>([])
  const [ledgerAccount, setLedgerAccount] = useState<LedgerAccount | null>(null)
  const [ledgerHistory, setLedgerHistory] = useState<LedgerTransaction[]>([])
  const [orgId, setOrgId] = useState<string>('')
  const [loading, setLoading] = useState(true)
  const [paymentModalOpen, setPaymentModalOpen] = useState(false)
  const [repairDialogOpen, setRepairDialogOpen] = useState(false)
  const [repairingBalance, setRepairingBalance] = useState(false)
  const [guestPendingBalance, setGuestPendingBalance] = useState(0)
  const [guestFolioCreditTotal, setGuestFolioCreditTotal] = useState(0)
  /** Same signed balance as Guest Database table (positive = debt, negative = credit). */
  const [guestTableBalance, setGuestTableBalance] = useState(0)
  const [hasPostedToLedger, setHasPostedToLedger] = useState(false)
  const [cashbackEarned, setCashbackEarned] = useState(0)
  const [cashbackAvailable, setCashbackAvailable] = useState(0)
  const [guestTab, setGuestTab] = useState('overview')
  const [statementFrom, setStatementFrom] = useState(() => format(subYears(new Date(), 1), 'yyyy-MM-dd'))
  const [statementTo, setStatementTo] = useState(() => format(new Date(), 'yyyy-MM-dd'))
  const [hotelBranding, setHotelBranding] = useState<{
    name: string
    logoUrl?: string | null
    address?: string | null
    phone?: string | null
  }>({ name: 'Hotel' })
  const [printingStatement, setPrintingStatement] = useState(false)
  const [selectedFolioId, setSelectedFolioId] = useState<string>('')
  const [isCheckingOut, setIsCheckingOut] = useState(false)
  const [isEditingGuest, setIsEditingGuest] = useState(false)
  const [savingGuest, setSavingGuest] = useState(false)
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [deletingGuest, setDeletingGuest] = useState(false)
  const [guestForm, setGuestForm] = useState({
    name: '',
    phone: '',
    email: '',
    address: '',
    city: '',
    country: '',
    id_type: '',
    id_number: '',
  })

  useEffect(() => {
    if (id) loadGuest()

    // Re-fetch whenever the user returns to this tab/page
    // so data is always fresh after actions on the booking detail page
    const handleVisibility = () => {
      if (document.visibilityState === 'visible' && id) loadGuest()
    }
    document.addEventListener('visibilitychange', handleVisibility)
    return () => document.removeEventListener('visibilitychange', handleVisibility)
  }, [id])

  const loadGuest = async () => {
    try {
      setLoading(true)
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/auth/login'); return }

      const { data: profile } = await supabase
        .from('profiles').select('organization_id, role').eq('id', user.id).single()
      if (!profile) return
      setOrgId(profile.organization_id)
      setResolvedRole(profile.role ?? null)

      const { data: orgRow } = await supabase
        .from('organizations')
        .select('name, logo_url, address, phone')
        .eq('id', profile.organization_id)
        .maybeSingle()
      if (orgRow) {
        setHotelBranding({
          name: String(orgRow.name || 'Hotel'),
          logoUrl: orgRow.logo_url,
          address: orgRow.address,
          phone: orgRow.phone,
        })
      }

      const [{ data: guestData }, { data: bookingData }] = await Promise.all([
        supabase.from('guests').select('*').eq('id', id).eq('organization_id', profile.organization_id).single(),
        supabase.from('bookings')
          .select('id, folio_id, check_in, check_out, number_of_nights, total_amount, deposit, balance, payment_status, status, rooms(room_number, room_type)')
          .eq('guest_id', id)
          .order('check_in', { ascending: false }),
      ])

      if (!guestData) { router.push('/guest-database'); return }
      setGuest(guestData)

      const cb = await fetchGuestCashbackBalanceClient(supabase, id)
      setCashbackEarned(cb.earnedTotal)
      setCashbackAvailable(cb.balance)
      setGuestForm({
        name: guestData.name || '',
        phone: guestData.phone || '',
        email: guestData.email || '',
        address: guestData.address || '',
        city: guestData.city || '',
        country: guestData.country || '',
        id_type: guestData.id_type || '',
        id_number: guestData.id_number || '',
      })

      // Fetch all folio charges for this guest's bookings to derive accurate balances
      const rawBookings = bookingData || []
      const bookingIds = rawBookings.map((b: any) => b.id)
      /** booking_id → folio rows (same net rules as booking list/detail) */
      const chargesByBooking: Record<
        string,
        { amount?: unknown; type?: string | null; charge_type?: string | null; payment_status?: string | null; payment_method?: string | null }[]
      > = {}
      if (bookingIds.length > 0) {
        const { data: allFolioCharges } = await supabase
          .from('folio_charges')
          .select('booking_id, amount, payment_status, charge_type, payment_method')
          .in('booking_id', bookingIds)
        for (const c of allFolioCharges || []) {
          const bid = (c as { booking_id?: string }).booking_id
          if (!bid) continue
          if (!chargesByBooking[bid]) chargesByBooking[bid] = []
          const row = c as {
            amount?: unknown
            charge_type?: string | null
            payment_status?: string | null
            payment_method?: string | null
          }
          chargesByBooking[bid].push({
            amount: row.amount,
            type: row.charge_type,
            charge_type: row.charge_type,
            payment_status: row.payment_status,
            payment_method: row.payment_method,
          })
        }
      }

      let pendingTotal = 0
      let creditTotal = 0
      let postedToLedger = false
      const enrichedBookings = rawBookings.map((b: any) => {
        const ch = chargesByBooking[b.id] ?? []
        if (
          ch.some(
            (c) =>
              String(c.payment_status || '').toLowerCase() === 'posted_to_ledger',
          )
        ) {
          postedToLedger = true
        }
        const net = bookingDisplayBillBalance(
          {
            balance: b.balance,
            deposit: b.deposit,
            total_amount: b.total_amount,
            payment_status: b.payment_status,
          },
          ch,
        )
        pendingTotal += Math.max(0, net)
        creditTotal += folioGuestCreditAmount(ch)
        return { ...b, balance: net }
      })
      setBookings(enrichedBookings)
      setGuestPendingBalance(pendingTotal)
      setGuestFolioCreditTotal(creditTotal)
      setHasPostedToLedger(postedToLedger)

      // Same signed balance as Guest Database table Balance column
      let signedTableBalance = 0
      try {
        const tableBalanceMap = await calculateGuestBalancesBatch(
          supabase,
          [{ id: guestData.id, name: guestData.name }],
          profile.organization_id,
        )
        signedTableBalance = Number(tableBalanceMap[guestData.id] ?? 0)
        setGuestTableBalance(signedTableBalance)
      } catch {
        setGuestTableBalance(0)
      }
      const tableCreditAmt =
        signedTableBalance < -0.005 ? Math.abs(signedTableBalance) : 0

      // Set selected folio to most recent booking's folio
      if (enrichedBookings.length > 0) {
        setSelectedFolioId(enrichedBookings[0].folio_id)
      }

      // City ledger — prefer debit when owed, otherwise largest prepaid credit
      const ledgerRows = await fetchAllGuestCityLedgerAccounts(
        supabase,
        profile.organization_id,
        guestData.name,
      )

      type LedgerRow = {
        id: string | null
        balance: number
        account_name: string
        account_type: string
      }
      const mappedLedgerRows: LedgerRow[] = (ledgerRows || []).map(
        (row: {
          id: string
          balance?: number | null
          account_name?: string | null
          account_type?: string | null
        }) => ({
          id: row.id,
          balance: Number(row.balance ?? 0),
          account_name: String(row.account_name || guestData.name),
          account_type: String(row.account_type || 'individual'),
        }),
      )
      let ledgerData = pickPreferredGuestLedgerAccount(mappedLedgerRows)

      const { data: txData } = await supabase
        .from('transactions')
        .select('id, transaction_id, amount, payment_method, status, description, created_at')
        .eq('organization_id', profile.organization_id)
        .ilike('guest_name', guestData.name)
        .order('created_at', { ascending: false })
        .limit(50)

      setLedgerHistory(txData || [])

      // Restore prepaid credit when cash-in > deposits but ledger was zeroed by older bugs
      if (guestData.id && currentUserId) {
        try {
          const res = await fetch(`/api/guests/${guestData.id}/reconcile-credit`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ caller_id: currentUserId }),
          })
          const payload = await res.json().catch(() => ({}))
          if (res.ok && typeof payload.credit === 'number' && payload.credit > 0.005) {
            const creditBal = -Number(payload.credit)
            if (ledgerData) {
              ledgerData = { ...ledgerData, balance: creditBal }
            } else {
              ledgerData = {
                id: null,
                balance: creditBal,
                account_name: guestData.name,
                account_type: 'individual',
              }
            }
            // Keep Outstanding / bookings credit UI in sync when reconcile posts folio credit
            setGuestFolioCreditTotal((prev) =>
              Math.max(prev, Number(payload.credit)),
            )
            if (payload.updated && bookingIds.length > 0) {
              const { data: refreshedFolio } = await supabase
                .from('folio_charges')
                .select('booking_id, amount, payment_status, charge_type, payment_method')
                .in('booking_id', bookingIds)
              const refreshedByBooking: typeof chargesByBooking = {}
              for (const c of refreshedFolio || []) {
                const bid = (c as { booking_id?: string }).booking_id
                if (!bid) continue
                if (!refreshedByBooking[bid]) refreshedByBooking[bid] = []
                refreshedByBooking[bid].push({
                  amount: (c as { amount?: unknown }).amount,
                  type: (c as { charge_type?: string | null }).charge_type,
                  charge_type: (c as { charge_type?: string | null }).charge_type,
                  payment_status: (c as { payment_status?: string | null }).payment_status,
                  payment_method: (c as { payment_method?: string | null }).payment_method,
                })
              }
              let refreshedCredit = 0
              const refreshedBookings = rawBookings.map((b: any) => {
                const ch = refreshedByBooking[b.id] ?? []
                const net = bookingDisplayBillBalance(
                  {
                    balance: b.balance,
                    deposit: b.deposit,
                    total_amount: b.total_amount,
                    payment_status: b.payment_status,
                  },
                  ch,
                )
                refreshedCredit += folioGuestCreditAmount(ch)
                return { ...b, balance: net }
              })
              setBookings(refreshedBookings)
              setGuestFolioCreditTotal(Math.max(refreshedCredit, Number(payload.credit)))
            }
          }
        } catch {
          /* display can still infer credit from transactions below */
        }
      }

      // Client-side fallback when reconcile finds nothing but cash-in / folio credit exists
      {
        const cashIn = (txData || [])
          .filter(
            (t: { status?: string | null; description?: string | null }) =>
              String(t.status || '').toLowerCase() !== 'cancelled' &&
              isGuestCityLedgerCashInDescription(t.description),
          )
          .reduce(
            (s: number, t: { amount?: number | null }) => s + Number(t.amount || 0),
            0,
          )
        const deposits = rawBookings.reduce(
          (s: number, b: { deposit?: number | null }) => s + Number(b.deposit || 0),
          0,
        )
        const clientCredit = impliedGuestPrepaidCredit({
          ledgerBalance: Number(ledgerData?.balance ?? 0),
          folioOutstanding: pendingTotal,
          ledgerCashInTotal: cashIn,
          depositTotal: deposits,
          folioCreditTotal: creditTotal,
        })
        if (
          clientCredit > 0.005 &&
          Number(ledgerData?.balance ?? 0) > -clientCredit + 0.5
        ) {
          const creditBal = -clientCredit
          if (ledgerData) {
            ledgerData = { ...ledgerData, balance: creditBal }
          } else {
            ledgerData = {
              id: null,
              balance: creditBal,
              account_name: guestData.name,
              account_type: 'individual',
            }
          }
          setGuestFolioCreditTotal((prev) => Math.max(prev, clientCredit))
        }
      }

      // Prefer table/ledger credit so the guest page matches the guest list Balance column
      if (
        tableCreditAmt > 0.005 &&
        Number(ledgerData?.balance ?? 0) > -tableCreditAmt + 0.5
      ) {
        const creditBal = -tableCreditAmt
        if (ledgerData) {
          ledgerData = { ...ledgerData, balance: creditBal }
        } else {
          ledgerData = {
            id: null,
            balance: creditBal,
            account_name: guestData.name,
            account_type: 'individual',
          }
        }
      }

      const tableDebt =
        signedTableBalance > 0.005 ? signedTableBalance : 0

      if (ledgerData) {
        setLedgerAccount({
          id: ledgerData.id,
          balance: Number(ledgerData.balance ?? 0),
          account_name: ledgerData.account_name,
          account_type: ledgerData.account_type,
        })
      } else if (pendingTotal > 0.005 || (postedToLedger && tableDebt > 0.005)) {
        setLedgerAccount({
          id: null,
          balance: pendingTotal > 0.005 ? pendingTotal : tableDebt,
          account_name: guestData.name,
          account_type: 'individual',
        })
      } else {
        setLedgerAccount(null)
      }
    } catch {
      router.push('/guest-database')
    } finally {
      setLoading(false)
    }
  }

  const handleCheckoutFolio = async () => {
    if (!selectedFolioId || isCheckingOut) return
    setIsCheckingOut(true)
    try {
      const supabase = createClient()
      const { error } = await supabase
        .from('bookings')
        .update({ folio_status: 'checked_out' })
        .eq('folio_id', selectedFolioId)
      if (error) throw error
      // Update local bookings state to reflect checkout
      setBookings(bookings.map(b => 
        b.folio_id === selectedFolioId 
          ? { ...b, folio_status: 'checked_out' as any } 
          : b
      ))
    } catch (err) {
      console.error('Checkout error:', err)
    } finally {
      setIsCheckingOut(false)
    }
  }

  async function adminGuestApiHeaders(): Promise<Record<string, string>> {
    const supabase = createClient()
    if (!supabase) return {}
    const { data: { session } } = await supabase.auth.getSession()
    if (!session?.access_token) return {}
    return { Authorization: `Bearer ${session.access_token}` }
  }

  const handleSaveGuest = async () => {
    if (!guest) return
    if (!canEditGuest) {
      toast.error('Only Manager, Administrator, or Superadmin can edit guest details')
      return
    }
    if (!guestForm.name.trim()) {
      toast.error('Guest name is required')
      return
    }
    if (!currentUserId) {
      toast.error('Not signed in')
      return
    }
    try {
      setSavingGuest(true)
      const authHeaders = await adminGuestApiHeaders()
      if (!authHeaders.Authorization) {
        toast.error('Your session is not available. Please refresh the page and try again.')
        return
      }
      const res = await fetch(`/api/admin/guests/${guest.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', ...authHeaders },
        body: JSON.stringify({
          caller_id: currentUserId,
          previous_name: guest.name,
          guest: {
            ...guestForm,
            name: guestForm.name.trim(),
            phone: guestForm.phone.trim() || null,
            email: guestForm.email.trim() || null,
            address: guestForm.address.trim() || null,
            city: guestForm.city.trim() || null,
            country: guestForm.country.trim() || null,
            id_type: guestForm.id_type.trim() || null,
            id_number: guestForm.id_number.trim() || null,
          },
        }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) {
        toast.error(json.error || 'Failed to update guest')
        return
      }
      toast.success('Guest details updated')
      setIsEditingGuest(false)
      await loadGuest()
    } catch (error: any) {
      toast.error(error.message || 'Failed to update guest')
    } finally {
      setSavingGuest(false)
    }
  }

  const handleDeleteGuest = async () => {
    if (!guest || !currentUserId) return
    setDeletingGuest(true)
    try {
      const authHeaders = await adminGuestApiHeaders()
      if (!authHeaders.Authorization) {
        toast.error('Your session is not available. Please refresh the page and try again.')
        return
      }
      const res = await fetch(`/api/admin/guests/${guest.id}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json', ...authHeaders },
        body: JSON.stringify({ caller_id: currentUserId }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) {
        toast.error(json.error || 'Failed to delete guest')
        return
      }
      const n = typeof json.deleted_bookings === 'number' ? json.deleted_bookings : 0
      toast.success(n > 0 ? `Guest removed with ${n} booking(s).` : 'Guest removed.')
      setDeleteDialogOpen(false)
      router.push('/guest-database')
    } catch (error: any) {
      toast.error(error.message || 'Failed to delete guest')
    } finally {
      setDeletingGuest(false)
    }
  }

  const cancelGuestEditing = () => {
    setIsEditingGuest(false)
    if (!guest) return
    setGuestForm({
      name: guest.name || '',
      phone: guest.phone || '',
      email: guest.email || '',
      address: guest.address || '',
      city: guest.city || '',
      country: guest.country || '',
      id_type: guest.id_type || '',
      id_number: guest.id_number || '',
    })
  }

  const startGuestEditing = () => {
    if (!guest) return
    setGuestForm({
      name: guest.name || '',
      phone: guest.phone || '',
      email: guest.email || '',
      address: guest.address || '',
      city: guest.city || '',
      country: guest.country || '',
      id_type: guest.id_type || '',
      id_number: guest.id_number || '',
    })
    setGuestTab('overview')
    setIsEditingGuest(true)
  }

  const patchGuestForm = (patch: Partial<typeof guestForm>) => {
    setGuestForm((prev) => ({ ...prev, ...patch }))
  }

  const handlePrintStatement = async () => {
    if (!guest || !orgId) return
    if (statementFrom > statementTo) {
      toast.error('Start date must be on or before end date')
      return
    }
    setPrintingStatement(true)
    try {
      const supabase = createClient()
      const from = startOfDay(parseISO(statementFrom))
      const to = endOfDay(parseISO(statementTo))
      const bookingIds = bookings.map((b) => b.id)
      if (!bookingIds.length) {
        toast.message('No bookings to print for this guest')
        return
      }
      const { data: charges } = await supabase
        .from('folio_charges')
        .select('booking_id, amount, charge_type, description, created_at, bookings(folio_id)')
        .in('booking_id', bookingIds)
        .gte('created_at', from.toISOString())
        .lte('created_at', to.toISOString())
        .order('created_at', { ascending: true })

      let running = 0
      let totalCharges = 0
      let totalPayments = 0
      const lines = (charges || []).map((c: any) => {
        const amt = Number(c.amount || 0)
        const isPayment = String(c.charge_type || '').toLowerCase() === 'payment' || amt < 0
        const charge = isPayment ? 0 : Math.max(0, amt)
        const payment = isPayment ? Math.abs(amt) : 0
        totalCharges += charge
        totalPayments += payment
        running += charge - payment
        const folioId =
          (c.bookings as { folio_id?: string } | null)?.folio_id ||
          bookings.find((b) => b.id === c.booking_id)?.folio_id ||
          '—'
        return {
          date: format(new Date(c.created_at), 'dd MMM yyyy HH:mm'),
          folioId,
          description: String(c.description || c.charge_type || 'Folio line'),
          charge,
          payment,
          balance: running,
        }
      })

      const periodLabel =
        statementFrom === statementTo
          ? format(parseISO(statementFrom), 'dd MMM yyyy')
          : `${format(parseISO(statementFrom), 'dd MMM yyyy')} – ${format(parseISO(statementTo), 'dd MMM yyyy')}`

      const html = buildGuestAccountStatementHtml({
        hotelName: hotelBranding.name,
        logoUrl: hotelBranding.logoUrl,
        address: hotelBranding.address,
        phone: hotelBranding.phone,
        guestName: guest.name,
        guestPhone: guest.phone,
        periodLabel,
        printedAt: format(new Date(), 'dd MMM yyyy HH:mm'),
        printedBy: name || 'Staff',
        openingBalance: 0,
        lines,
        totalCharges,
        totalPayments,
        closingBalance: running,
      })
      printHtmlDocument(html)
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Could not print statement')
    } finally {
      setPrintingStatement(false)
    }
  }

  const statementFilteredBookings = bookings.filter((b) => {
    if (!statementFrom || !statementTo) return true
    try {
      const d = parseISO(b.check_in)
      return isWithinInterval(d, {
        start: startOfDay(parseISO(statementFrom)),
        end: endOfDay(parseISO(statementTo)),
      })
    } catch {
      return true
    }
  })

  if (loading) {
    return <PageLoadingState />
  }

  if (!guest) return null

  // Total Paid = deposits on bookings + prepaid credit still on city ledger
  // (so a ₦400k pay against ₦240k debt with ₦160k credit shows ₦400k, not only deposits).
  const depositPaid = bookings.reduce((s, b) => s + Number(b.deposit || 0), 0)
  const ledgerCashInTotal = ledgerHistory
    .filter(
      (t) =>
        String(t.status || '').toLowerCase() !== 'cancelled' &&
        isGuestCityLedgerCashInDescription(t.description),
    )
    .reduce((s, t) => s + Number(t.amount || 0), 0)
  const guestTableCredit =
    guestTableBalance < -0.005 ? Math.abs(guestTableBalance) : 0
  const lastVisit = bookings.length > 0 ? bookings[0].check_in : null
  const dbLedgerBalance = Number(ledgerAccount?.balance ?? 0)
  const prepaidFromLedgerOrCashIn = impliedGuestPrepaidCredit({
    ledgerBalance: dbLedgerBalance,
    folioOutstanding: guestPendingBalance,
    ledgerCashInTotal,
    depositTotal: depositPaid,
    folioCreditTotal: guestFolioCreditTotal,
  })
  const ledgerDisplayBalance = guestCityLedgerDisplayBalance({
    dbLedgerBalance,
    folioOutstanding: guestPendingBalance,
    ledgerCashInTotal,
    depositTotal: depositPaid,
    folioCreditTotal: guestFolioCreditTotal,
    hasLedgerAccount: Boolean(ledgerAccount),
    hasPostedToLedger,
  })
  const totalBookingBalance = Math.max(
    guestPendingBalance,
    ledgerDisplayBalance > 0.005 ? ledgerDisplayBalance : 0,
  )
  const guestOutstandingBalance = totalBookingBalance

  const ledgerAccountCreditAmount = Math.max(
    prepaidFromLedgerOrCashIn,
    dbLedgerBalance < -0.005 ? Math.abs(dbLedgerBalance) : 0,
  )
  const effectiveGuestCreditAmount = Math.max(
    guestFolioCreditTotal,
    ledgerAccountCreditAmount,
    guestTableCredit,
  )
  const totalSpent = depositPaid + effectiveGuestCreditAmount
  const hasOutstandingDebit = totalBookingBalance > 0.005
  const hasGuestCredit =
    ledgerDisplayBalance < -0.005 || effectiveGuestCreditAmount > 0.005
  const canSettleTopUp = hasOutstandingDebit || hasGuestCredit
  const showLedgerCard =
    Boolean(ledgerAccount) || canSettleTopUp || bookings.length > 0

  const statusColor = (status: string) => {
    switch (status) {
      case 'paid': return 'text-green-700 border-green-200 bg-green-50'
      case 'partial': return 'text-yellow-700 border-yellow-200 bg-yellow-50'
      case 'pending': return 'text-orange-700 border-orange-200 bg-orange-50'
      default: return 'text-gray-700 border-gray-200 bg-gray-50'
    }
  }

  const ledgerStatusBadge = () => {
    if (hasGuestCredit && !hasOutstandingDebit) {
      return { label: 'Credit', color: 'text-blue-700', bg: 'bg-blue-50 border-blue-200' }
    }
    if (hasOutstandingDebit) {
      return { label: 'Debit', color: 'text-red-600', bg: 'bg-red-50 border-red-200' }
    }
    if (!showLedgerCard && !hasGuestCredit) {
      return { label: 'No Account', color: 'text-muted-foreground', bg: 'bg-muted/40 border-border' }
    }
    if (ledgerDisplayBalance > 0) return { label: 'Debit', color: 'text-red-600', bg: 'bg-red-50 border-red-200' }
    if (ledgerDisplayBalance < 0 || hasGuestCredit) {
      return { label: 'Credit', color: 'text-blue-700', bg: 'bg-blue-50 border-blue-200' }
    }
    return { label: 'Settled', color: 'text-muted-foreground', bg: 'bg-muted/40 border-border' }
  }

  const ls = ledgerStatusBadge()
  const cityLedgerShownBalance = hasGuestCredit
    ? effectiveGuestCreditAmount
    : Math.abs(ledgerDisplayBalance)

  const handleRepairStaleBalance = async () => {
    if (!guest || !currentUserId) return
    try {
      setRepairingBalance(true)
      const res = await fetch(`/api/guests/${guest.id}/repair-balance`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ caller_id: currentUserId }),
      })
      const payload = await res.json().catch(() => ({}))
      if (!res.ok) {
        throw new Error(payload?.error || 'Repair failed')
      }
      toast.success(
        payload.folio_after > 0.005
          ? `Repair applied; ₦${Number(payload.folio_after).toLocaleString()} still shows on folio — settle from the booking folio.`
          : 'Stale balance cleared for this guest',
      )
      setRepairDialogOpen(false)
      await loadGuest()
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Repair failed')
    } finally {
      setRepairingBalance(false)
    }
  }

  const txIcon = (desc: string) => {
    if (desc?.toLowerCase().includes('top-up') || desc?.toLowerCase().includes('credit')) {
      return <ArrowUpCircle className="h-4 w-4 text-blue-500 shrink-0" />
    }
    if (desc?.toLowerCase().includes('settlement') || desc?.toLowerCase().includes('payment')) {
      return <ArrowDownCircle className="h-4 w-4 text-green-500 shrink-0" />
    }
    return <CreditCard className="h-4 w-4 text-muted-foreground shrink-0" />
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="sm" onClick={() => router.push('/guest-database')} className="gap-2">
          <ArrowLeft className="h-4 w-4" />
          Back to Guest Database
        </Button>
      </div>

      {canEditGuest && isEditingGuest ? (
        <GuestProfileEditPanel
          values={guestForm}
          onChange={patchGuestForm}
          onCancel={cancelGuestEditing}
          onSave={handleSaveGuest}
          saving={savingGuest}
        />
      ) : (
      <div className="flex items-start justify-between flex-wrap gap-4">
        <div className="flex items-center gap-4 min-w-0">
          <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-primary/10">
            <User className="h-8 w-8 text-primary" />
          </div>
          <div className="min-w-0">
            <h1 className="text-3xl font-bold tracking-tight">{guest.name}</h1>
            <p className="text-muted-foreground">
              Guest since {guest.created_at ? format(new Date(guest.created_at), 'MMMM yyyy') : '-'}
            </p>
            {(guest.phone || guest.email) && (
              <p className="text-sm text-muted-foreground mt-1 truncate">
                {[guest.phone, guest.email].filter(Boolean).join(' · ')}
              </p>
            )}
          </div>
        </div>
        <div className="flex flex-col items-end gap-2 self-start">
          <div className="flex items-center gap-2 flex-wrap justify-end">
            {canEditGuest && (
              <Button
                type="button"
                size="sm"
                className="gap-2"
                onClick={startGuestEditing}
              >
                <Pencil className="h-4 w-4" />
                Edit Guest
              </Button>
            )}
            {canDeleteGuest && (
              <Button
                variant="outline"
                size="sm"
                className="text-destructive border-destructive/40 hover:bg-destructive/10"
                onClick={() => setDeleteDialogOpen(true)}
              >
                <Trash2 className="h-4 w-4 mr-1.5" />
                Delete Guest
              </Button>
            )}
            <Button variant="outline" size="sm" onClick={() => loadGuest()} className="gap-2">
              <RefreshCw className="h-4 w-4" />
              Refresh
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="gap-2 border-violet-200 text-violet-800 hover:bg-violet-50"
              onClick={() => setGuestTab('cashback')}
            >
              <Gift className="h-4 w-4" />
              Cashback
              {cashbackAvailable > 0 ? ` · ${formatNaira(cashbackAvailable)}` : ''}
            </Button>
          </div>
          {canViewGuests && !canEditGuest && (
            <p className="text-xs text-muted-foreground max-w-sm text-right">
              Only Manager, Administrator, or Superadmin can edit or delete guest profiles.
            </p>
          )}
        </div>
      </div>
      )}

      {hasGuestCredit && (
        <div className="rounded-xl border-2 border-blue-300 bg-blue-50 px-4 py-4 sm:px-5 dark:border-blue-800 dark:bg-blue-950/40">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-start gap-3 min-w-0">
              <div className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-blue-100 dark:bg-blue-900/60">
                <Wallet className="h-5 w-5 text-blue-700 dark:text-blue-300" />
              </div>
              <div className="min-w-0">
                <p className="text-sm font-semibold text-blue-900 dark:text-blue-100">
                  Account credit available
                </p>
                <p className="text-xs text-blue-800/80 dark:text-blue-200/80 mt-0.5">
                  Prepaid balance that can be applied to future stays or charges for this guest.
                </p>
              </div>
            </div>
            <div className="text-right shrink-0">
              <p className="text-3xl font-bold tabular-nums text-blue-700 dark:text-blue-300">
                {formatNaira(effectiveGuestCreditAmount)}
              </p>
              <Badge
                variant="outline"
                className="mt-1 border-blue-300 bg-white text-blue-800 dark:bg-blue-950 dark:text-blue-200"
              >
                Credit
              </Badge>
            </div>
          </div>
        </div>
      )}

      <Tabs value={guestTab} onValueChange={setGuestTab} className="w-full">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="cashback" className="gap-1.5">
            <Gift className="h-3.5 w-3.5" />
            Cashback
            {cashbackAvailable > 0 && (
              <Badge variant="secondary" className="ml-1 h-5 px-1.5 text-[10px] tabular-nums">
                {formatNaira(cashbackAvailable)}
              </Badge>
            )}
          </TabsTrigger>
        </TabsList>
      </Tabs>

      {guestTab === 'cashback' ? (
        <GuestCashbackPanel
          guestId={guest.id}
          guestName={guest.name}
          stays={bookings}
          enabled
        />
      ) : (
        <>
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Account statement (past dates)</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap items-end gap-3">
          <div className="space-y-1">
            <Label htmlFor="stmt-from" className="text-xs">From</Label>
            <Input
              id="stmt-from"
              type="date"
              className="h-9 w-[140px]"
              value={statementFrom}
              onChange={(e) => setStatementFrom(e.target.value)}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="stmt-to" className="text-xs">To</Label>
            <Input
              id="stmt-to"
              type="date"
              className="h-9 w-[140px]"
              value={statementTo}
              onChange={(e) => setStatementTo(e.target.value)}
            />
          </div>
          <Button
            variant="outline"
            size="sm"
            className="gap-2"
            disabled={printingStatement}
            onClick={() => void handlePrintStatement()}
          >
            <Printer className="h-4 w-4" />
            {printingStatement ? 'Preparing…' : 'Print statement'}
          </Button>
          <p className="text-xs text-muted-foreground w-full">
            Filters booking history below and prints folio charges/payments for the selected period.
          </p>
        </CardContent>
      </Card>

      {/* Summary cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        <Card>
          <CardContent className="p-5 flex flex-col gap-1">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Calendar className="h-4 w-4" /> Total Bookings
            </div>
            <p className="text-3xl font-bold">{bookings.length}</p>
            {lastVisit && <p className="text-xs text-muted-foreground">Last: {format(new Date(lastVisit), 'dd MMM yyyy')}</p>}
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5 flex flex-col gap-1">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <CreditCard className="h-4 w-4" /> Total Paid
            </div>
            <p className="text-3xl font-bold text-green-600">{formatNaira(totalSpent)}</p>
          </CardContent>
        </Card>
        <Card
          className={
            hasGuestCredit
              ? 'border-blue-300 bg-blue-500/5 ring-1 ring-blue-200'
              : 'border-dashed'
          }
        >
          <CardContent className="p-5 flex flex-col gap-2">
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-center gap-2 text-sm text-muted-foreground min-w-0">
                <Wallet className="h-4 w-4 shrink-0" />
                <span>Account Credit</span>
              </div>
              {hasGuestCredit && (
                <Badge variant="outline" className="shrink-0 text-xs border-blue-200 bg-blue-50 text-blue-700 font-medium">
                  Available
                </Badge>
              )}
            </div>
            {hasGuestCredit ? (
              <>
                <p className="text-3xl font-bold text-blue-600 tabular-nums">
                  {formatNaira(effectiveGuestCreditAmount)}
                </p>
                <p className="text-xs text-muted-foreground leading-snug">
                  Prepaid credit ready for future bookings or folio charges.
                </p>
              </>
            ) : (
              <p className="text-3xl font-bold text-muted-foreground">₦0</p>
            )}
          </CardContent>
        </Card>
        <Card
          className={
            hasOutstandingDebit
              ? 'border-red-200'
              : ''
          }
        >
          <CardContent className="p-5 flex flex-col gap-2">
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-center gap-2 text-sm text-muted-foreground min-w-0">
                <TrendingUp className="h-4 w-4 shrink-0" />
                <span>Outstanding Balance</span>
              </div>
              {hasOutstandingDebit && (
                <Badge variant="outline" className="shrink-0 text-xs border-red-200 bg-red-50 text-red-700 font-medium">
                  Outstanding
                </Badge>
              )}
              {!hasOutstandingDebit && (
                <Badge variant="outline" className="shrink-0 text-xs border-green-200 bg-green-50 text-green-700 font-medium">
                  Settled
                </Badge>
              )}
            </div>
            {hasOutstandingDebit ? (
              <p className="text-3xl font-bold text-red-600">{formatNaira(totalBookingBalance)}</p>
            ) : (
              <p className="text-3xl font-bold text-muted-foreground">Settled</p>
            )}
          </CardContent>
        </Card>
        <Card
          className="border-violet-200 bg-violet-500/5 cursor-pointer transition-colors hover:bg-violet-500/10"
          onClick={() => setGuestTab('cashback')}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault()
              setGuestTab('cashback')
            }
          }}
        >
          <CardContent className="p-5 flex flex-col gap-1">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Gift className="h-4 w-4" /> Cashback
            </div>
            <p className="text-3xl font-bold text-violet-700 tabular-nums">
              {formatNaira(cashbackAvailable)}
            </p>
            <p className="text-xs text-muted-foreground">
              Earned: {formatNaira(cashbackEarned)}
            </p>
            <p className="text-xs text-primary mt-1">View earnings & stays →</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5 flex flex-col gap-1">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <FileText className="h-4 w-4" /> Nights Stayed
            </div>
            <p className="text-3xl font-bold">
              {bookings.reduce((s, b) => s + Number(b.number_of_nights || 0), 0)}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Folio Selector */}
      {bookings.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Folio History</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-4 flex-wrap">
              <div className="flex-1 min-w-xs">
                <label className="text-sm font-medium mb-2 block">Select a folio to view</label>
                <select
                  value={selectedFolioId}
                  onChange={(e) => setSelectedFolioId(e.target.value)}
                  className="w-full px-3 py-2 border rounded-md text-sm bg-background"
                >
                  {bookings.map((b) => {
                    const status = (b as any).folio_status || 'active'
                    return (
                      <option key={b.folio_id} value={b.folio_id}>
                        {b.folio_id} - {format(new Date(b.check_in), 'dd MMM yyyy')} ({status})
                      </option>
                    )
                  })}
                </select>
              </div>
              <div className="flex items-center gap-2">
                {selectedFolioId && bookings.find(b => b.folio_id === selectedFolioId) && (
                  <>
                    <Badge variant="outline" className={
                      ((bookings.find(b => b.folio_id === selectedFolioId) as any)?.folio_status === 'checked_out')
                        ? 'border-gray-300 text-gray-700 bg-gray-100'
                        : 'border-blue-300 text-blue-700 bg-blue-50'
                    }>
                      {((bookings.find(b => b.folio_id === selectedFolioId) as any)?.folio_status || 'active').replace('_', ' ').toUpperCase()}
                    </Badge>
                    {((bookings.find(b => b.folio_id === selectedFolioId) as any)?.folio_status || 'active') === 'active' && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={handleCheckoutFolio}
                        disabled={isCheckingOut}
                      >
                        {isCheckingOut ? 'Checking out...' : 'Check Out Folio'}
                      </Button>
                    )}
                  </>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* City Ledger Account — always shown */}
      <Card className={`border-2 ${hasGuestCredit ? 'border-blue-300 bg-blue-50/40' : ls.bg}`}>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div className="flex items-center gap-2">
              <Wallet className="h-5 w-5 text-primary" />
              <CardTitle className="text-base">City Ledger Account</CardTitle>
              {showLedgerCard ? (
                <Badge variant="outline" className={`text-xs ${ls.color} ${ls.bg} border font-normal`}>
                  {ls.label}
                </Badge>
              ) : (
                <Badge variant="secondary" className="text-xs">No Account</Badge>
              )}
            </div>
            {(canSettleTopUp ||
              (canRepairBalance && dbLedgerBalance > 0.005 && !hasGuestCredit)) && (
              <div className="flex flex-wrap gap-2">
                {canSettleTopUp && (
                  <Button size="sm" onClick={() => setPaymentModalOpen(true)}>
                    Settle / Top Up
                  </Button>
                )}
                {canRepairBalance &&
                  dbLedgerBalance > 0.005 &&
                  !hasGuestCredit && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setRepairDialogOpen(true)}
                    >
                      Repair stale balance
                    </Button>
                  )}
              </div>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {!showLedgerCard ? (
            <p className="text-sm text-muted-foreground">
              No city ledger account linked to this guest. City ledger accounts are created when a booking is made using City Ledger as the payment method.
            </p>
          ) : (
            <div className="flex items-end gap-6 flex-wrap">
              <div>
                <p className="text-xs text-muted-foreground mb-1">
                  {hasGuestCredit ? 'Account credit' : 'Current Balance'}
                </p>
                <p className={`text-4xl font-bold ${hasGuestCredit ? 'text-blue-700' : ls.color}`}>
                  {formatNaira(cityLedgerShownBalance)}
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  {hasOutstandingDebit && !hasGuestCredit
                    ? 'Amount owed to hotel (debit)'
                    : hasGuestCredit
                    ? `Credit of ${formatNaira(effectiveGuestCreditAmount)} available for future charges`
                    : ledgerDisplayBalance > 0
                    ? 'Amount owed to hotel (debit)'
                    : ledgerDisplayBalance < 0
                    ? `Credit of ${formatNaira(Math.abs(ledgerDisplayBalance))} available`
                    : 'Account fully settled'}
                </p>
              </div>
              <div className="text-sm text-muted-foreground space-y-1">
                <p>Account: <span className="font-medium text-foreground">{ledgerAccount?.account_name || guest.name}</span></p>
                <p>Type: <span className="font-medium text-foreground capitalize">{ledgerAccount?.account_type || 'individual'}</span></p>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Guest Info */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Guest Information</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-3">
              <div className="flex items-center gap-3 text-sm">
                <Phone className="h-4 w-4 text-muted-foreground shrink-0" />
                <span>{guest.phone || '—'}</span>
              </div>
              <div className="flex items-center gap-3 text-sm">
                <Mail className="h-4 w-4 text-muted-foreground shrink-0" />
                <span>{guest.email || '—'}</span>
              </div>
              <div className="flex items-start gap-3 text-sm">
                <MapPin className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
                <span>{[guest.address, guest.city, guest.country].filter(Boolean).join(', ') || '—'}</span>
              </div>
            </div>

            {guest.id_type && (
              <>
                <Separator />
                <div className="space-y-2">
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Identity Document</p>
                  <div className="flex items-center gap-3 text-sm">
                    <Hash className="h-4 w-4 text-muted-foreground" />
                    <div>
                      <span className="font-medium capitalize">{guest.id_type}: </span>
                      <span className="text-muted-foreground">{guest.id_number || '—'}</span>
                    </div>
                  </div>
                </div>
              </>
            )}
          </CardContent>
        </Card>

        {/* Booking History */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <div className="space-y-1">
              <CardTitle className="text-base">Booking History ({statementFilteredBookings.length})</CardTitle>
              {hasGuestCredit && (
                <p className="text-xs font-medium text-blue-700">
                  Guest account credit: {formatNaira(effectiveGuestCreditAmount)} available for future charges
                </p>
              )}
            </div>
          </CardHeader>
          <CardContent>
            {bookings.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                <Building2 className="h-12 w-12 mb-3 opacity-30" />
                <p>No bookings found</p>
              </div>
            ) : (
              <div className="space-y-3">
                {statementFilteredBookings.map((b) => (
                  <div
                    key={b.id}
                    className="flex items-center justify-between rounded-lg border p-4 text-sm cursor-pointer hover:bg-accent transition-colors"
                    onClick={() => router.push(`/bookings/${b.id}`)}
                  >
                    <div className="space-y-1">
                      <div className="font-mono text-xs font-semibold text-primary">{b.folio_id}</div>
                      <div className="font-medium">
                        {b.rooms ? `Room ${b.rooms.room_number} — ${b.rooms.room_type}` : '—'}
                      </div>
                      <div className="text-muted-foreground text-xs">
                        {b.check_in ? format(new Date(b.check_in), 'dd MMM yyyy') : '—'}
                        {' '}&rarr;{' '}
                        {b.check_out ? format(new Date(b.check_out), 'dd MMM yyyy') : '—'}
                        {b.number_of_nights ? ` (${b.number_of_nights} night${b.number_of_nights !== 1 ? 's' : ''})` : ''}
                      </div>
                    </div>
                    <div className="text-right space-y-1">
                      <div className="font-semibold">{formatNaira(b.total_amount)}</div>
                      {b.balance > 0 && (
                        <div className="text-xs text-red-600">Balance: {formatNaira(b.balance)}</div>
                      )}
                      {Number(b.balance) < 0 && (
                        <div className="text-xs font-medium text-blue-600">
                          Folio credit: {formatNaira(-Number(b.balance))}
                        </div>
                      )}
                      {hasGuestCredit && Number(b.balance) <= 0 && (
                        <div className="text-xs font-medium text-blue-600">
                          Account credit: {formatNaira(effectiveGuestCreditAmount)}
                        </div>
                      )}
                      <Badge
                        variant="outline"
                        className={`text-xs ${
                          Number(b.balance) < 0 || (hasGuestCredit && Number(b.balance) <= 0)
                            ? 'text-blue-700 border-blue-200 bg-blue-50'
                            : statusColor(b.payment_status)
                        }`}
                      >
                        {Number(b.balance) < 0
                          ? 'credit'
                          : hasGuestCredit && Number(b.balance) <= 0
                            ? 'paid · credit'
                            : b.payment_status}
                      </Badge>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* City Ledger Transaction History */}
      {ledgerHistory.length > 0 && (
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Clock className="h-4 w-4 text-muted-foreground" />
              <CardTitle className="text-base">City Ledger Transaction History</CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {ledgerHistory.map((tx) => (
                <div key={tx.id} className="flex items-center gap-3 rounded-lg border p-3 text-sm">
                  {txIcon(tx.description)}
                  <div className="flex-1 min-w-0">
                    <p className="font-medium truncate">{tx.description || tx.transaction_id}</p>
                    <p className="text-xs text-muted-foreground">
                      {format(new Date(tx.created_at), 'dd MMM yyyy, hh:mm a')}
                      {' · '}
                      <span className="capitalize">{tx.payment_method?.replace('_', ' ')}</span>
                    </p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className={`font-semibold ${tx.description?.toLowerCase().includes('settlement') || tx.description?.toLowerCase().includes('payment') ? 'text-green-600' : 'text-blue-600'}`}>
                      {formatNaira(tx.amount)}
                    </p>
                    <Badge variant="outline" className="text-xs mt-0.5">
                      {tx.status}
                    </Badge>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
        </>
      )}

      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Delete guest profile?</DialogTitle>
            <DialogDescription>
              This permanently removes <strong>{guest.name}</strong> from the guest database and deletes all of their
              bookings (folios, charges, and booking-linked payments). City ledger rows created for this guest name are
              removed. This cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button type="button" variant="outline" onClick={() => setDeleteDialogOpen(false)} disabled={deletingGuest}>
              Cancel
            </Button>
            <Button type="button" variant="destructive" onClick={handleDeleteGuest} disabled={deletingGuest}>
              {deletingGuest ? 'Deleting…' : 'Delete guest'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={repairDialogOpen} onOpenChange={setRepairDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Repair stale balance?</DialogTitle>
            <DialogDescription>
              Use this when <strong>{guest.name}</strong> still shows debt after Settle / Pay Debt
              (often an old checkout folio or a duplicate city ledger name). This marks open folio
              lines paid, syncs all matching city ledger accounts, and zeros the guest balance. It does
              not remove transaction history.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              type="button"
              variant="outline"
              onClick={() => setRepairDialogOpen(false)}
              disabled={repairingBalance}
            >
              Cancel
            </Button>
            <Button
              type="button"
              onClick={handleRepairStaleBalance}
              disabled={repairingBalance}
            >
              {repairingBalance ? 'Repairing…' : 'Clear stale balance'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* City Ledger Payment Modal */}
      {canSettleTopUp && (
        <CityLedgerPaymentModal
          open={paymentModalOpen}
          onClose={() => setPaymentModalOpen(false)}
          onSuccess={loadGuest}
          accountType="guest"
          accountName={guest.name}
          ledgerAccountId={ledgerAccount?.id ?? null}
          currentBalance={
            hasOutstandingDebit
              ? totalBookingBalance
              : ledgerAccount?.id
                ? Number(ledgerAccount.balance ?? 0)
                : -effectiveGuestCreditAmount
          }
          organizationId={orgId}
          guestId={guest.id}
        />
      )}
    </div>
  )
}
