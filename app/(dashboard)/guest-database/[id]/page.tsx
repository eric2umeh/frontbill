'use client'

import { useState, useEffect, use } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
import { Label } from '@/components/ui/label'
import { formatNaira } from '@/lib/utils/currency'
import {
  Loader2, ArrowLeft, User, Phone, Mail, MapPin,
  Calendar, CreditCard, TrendingUp, FileText, Building2, Hash,
  Wallet, ArrowDownCircle, ArrowUpCircle, Clock, RefreshCw,
} from 'lucide-react'
import { format } from 'date-fns'
import CityLedgerPaymentModal from '@/components/city-ledger/city-ledger-payment-modal'
import { useAuth } from '@/lib/auth-context'
import { hasPermission } from '@/lib/permissions'
import { toast } from 'sonner'

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
  id: string
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
  const { role } = useAuth()
  /** Product rule: only Administrator / Superadmin edit guest profiles (see hasPermission hard gate). */
  const canEditGuest = hasPermission(resolvedRole ?? role, 'guests:edit')
  const canViewGuests = hasPermission(resolvedRole ?? role, 'guests:view')
  const [guest, setGuest] = useState<Guest | null>(null)
  const [bookings, setBookings] = useState<Booking[]>([])
  const [ledgerAccount, setLedgerAccount] = useState<LedgerAccount | null>(null)
  const [ledgerHistory, setLedgerHistory] = useState<LedgerTransaction[]>([])
  const [orgId, setOrgId] = useState<string>('')
  const [loading, setLoading] = useState(true)
  const [paymentModalOpen, setPaymentModalOpen] = useState(false)
  const [folioPaymentsSum, setFolioPaymentsSum] = useState(0)
  const [guestPendingBalance, setGuestPendingBalance] = useState(0)
  const [selectedFolioId, setSelectedFolioId] = useState<string>('')
  const [isCheckingOut, setIsCheckingOut] = useState(false)
  const [isEditingGuest, setIsEditingGuest] = useState(false)
  const [savingGuest, setSavingGuest] = useState(false)
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

      const [{ data: guestData }, { data: bookingData }] = await Promise.all([
        supabase.from('guests').select('*').eq('id', id).eq('organization_id', profile.organization_id).single(),
        supabase.from('bookings')
          .select('id, folio_id, check_in, check_out, number_of_nights, total_amount, deposit, balance, payment_status, status, rooms(room_number, room_type)')
          .eq('guest_id', id)
          .order('check_in', { ascending: false }),
      ])

      if (!guestData) { router.push('/guest-database'); return }
      setGuest(guestData)
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
      let folioPaymentsTotal = 0
      let folioPendingByBooking: { [id: string]: number } = {}
      if (bookingIds.length > 0) {
        const { data: allFolioCharges } = await supabase
          .from('folio_charges')
          .select('booking_id, amount, payment_status, charge_type')
          .in('booking_id', bookingIds)
        if (allFolioCharges) {
          allFolioCharges.forEach((c: any) => {
            if ((c.payment_status === 'pending' || c.payment_status === 'unpaid') && Number(c.amount) > 0) {
              folioPendingByBooking[c.booking_id] = (folioPendingByBooking[c.booking_id] || 0) + Number(c.amount)
            }
            if (c.charge_type === 'payment' && Number(c.amount) < 0) {
              folioPaymentsTotal += Math.abs(Number(c.amount))
            }
          })
        }
      }

      // Build a NEW array with folio-derived balances (never mutate Supabase frozen objects)
      const enrichedBookings = rawBookings.map((b: any) => ({
        ...b,
        balance: folioPendingByBooking[b.id] ?? 0,
      }))
      setBookings(enrichedBookings)
      setFolioPaymentsSum(folioPaymentsTotal)

      // Set selected folio to most recent booking's folio
      if (enrichedBookings.length > 0) {
        setSelectedFolioId(enrichedBookings[0].folio_id)
      }

      // City ledger outstanding = sum of all pending folio charges across all bookings
      // This is the authoritative value — avoids stale guests.balance DB writes
      const pendingTotal = Object.values(folioPendingByBooking).reduce((s, v) => s + v, 0)
      setGuestPendingBalance(pendingTotal)

      // City ledger account — fetch if exists for display
      const { data: ledgerData } = await supabase
        .from('city_ledger_accounts')
        .select('id, balance, account_name, account_type')
        .eq('organization_id', profile.organization_id)
        .ilike('account_name', guestData.name)
        .in('account_type', ['individual', 'guest'])
        .maybeSingle()

      if (pendingTotal > 0) {
        setLedgerAccount(ledgerData || { id: null, balance: pendingTotal, account_name: guestData.name, account_type: 'individual' })
      } else {
        setLedgerAccount(null)
      }

      // Fetch city ledger transaction history for this guest
      const { data: txData } = await supabase
        .from('transactions')
        .select('id, transaction_id, amount, payment_method, status, description, created_at')
        .eq('organization_id', profile.organization_id)
        .ilike('guest_name', guestData.name)
        .order('created_at', { ascending: false })
        .limit(20)

      setLedgerHistory(txData || [])
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

  const handleSaveGuest = async () => {
    if (!guest) return
    if (!canEditGuest) {
      toast.error('Only superadmin and admin can edit guest details')
      return
    }
    if (!guestForm.name.trim()) {
      toast.error('Guest name is required')
      return
    }
    try {
      setSavingGuest(true)
      const supabase = createClient()
      const { error } = await supabase
        .from('guests')
        .update({
          name: guestForm.name.trim(),
          phone: guestForm.phone.trim() || null,
          email: guestForm.email.trim() || null,
          address: guestForm.address.trim() || null,
          city: guestForm.city.trim() || null,
          country: guestForm.country.trim() || null,
          id_type: guestForm.id_type.trim() || null,
          id_number: guestForm.id_number.trim() || null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', guest.id)
      if (error) throw error
      toast.success('Guest details updated')
      setIsEditingGuest(false)
      await loadGuest()
    } catch (error: any) {
      toast.error(error.message || 'Failed to update guest')
    } finally {
      setSavingGuest(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    )
  }

  if (!guest) return null

  // Total Paid = sum of bookings.deposit (includes initial payment + all record-payment increments)
  // folioPaymentsSum is NOT added here — booking.deposit is already bumped when a payment is recorded,
  // so adding folio payments would double-count them.
  const totalSpent = bookings.reduce((s, b) => s + Number(b.deposit || 0), 0)
  // Clamp to 0 — negative means overpaid, show as settled
  // Booking Balance (Outstanding) — use folio-derived pending total, same source as city ledger section
  // Do NOT use bookings.reduce(b.balance) — that can lag by one render cycle after setBookings
  const totalBookingBalance = guestPendingBalance
  const lastVisit = bookings.length > 0 ? bookings[0].check_in : null
  // Use folio-derived pending total as authoritative outstanding balance
  const guestOutstandingBalance = guestPendingBalance
  const ledgerBalance = ledgerAccount ? guestOutstandingBalance : 0

  const statusColor = (status: string) => {
    switch (status) {
      case 'paid': return 'text-green-700 border-green-200 bg-green-50'
      case 'partial': return 'text-yellow-700 border-yellow-200 bg-yellow-50'
      case 'pending': return 'text-orange-700 border-orange-200 bg-orange-50'
      default: return 'text-gray-700 border-gray-200 bg-gray-50'
    }
  }

  const ledgerStatusBadge = () => {
    if (!ledgerAccount) return { label: 'No Account', color: 'text-muted-foreground', bg: 'bg-muted/40 border-border' }
    if (ledgerBalance > 0) return { label: 'Debit', color: 'text-red-600', bg: 'bg-red-50 border-red-200' }
    return { label: 'Settled', color: 'text-muted-foreground', bg: 'bg-muted/40 border-border' }
  }

  const ls = ledgerStatusBadge()

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

      <div className="flex items-start justify-between flex-wrap gap-4">
        <div className="flex items-center gap-4">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-primary/10">
            <User className="h-8 w-8 text-primary" />
          </div>
          <div>
            <h1 className="text-3xl font-bold tracking-tight">{guest.name}</h1>
            <p className="text-muted-foreground">Guest since {guest.created_at ? format(new Date(guest.created_at), 'MMMM yyyy') : '-'}</p>
          </div>
        </div>
        <div className="flex flex-col items-end gap-2 self-start">
          <div className="flex items-center gap-2">
            {canEditGuest && (
              <>
                {isEditingGuest ? (
                  <>
                    <Button size="sm" variant="outline" onClick={() => { setIsEditingGuest(false); loadGuest() }} disabled={savingGuest}>
                      Cancel
                    </Button>
                    <Button size="sm" onClick={handleSaveGuest} disabled={savingGuest}>
                      {savingGuest ? 'Saving...' : 'Save Guest'}
                    </Button>
                  </>
                ) : (
                  <Button variant="outline" size="sm" onClick={() => setIsEditingGuest(true)}>
                    Edit Guest
                  </Button>
                )}
              </>
            )}
            <Button variant="outline" size="sm" onClick={() => loadGuest()} className="gap-2">
              <RefreshCw className="h-4 w-4" />
              Refresh
            </Button>
          </div>
          {canViewGuests && !canEditGuest && (
            <p className="text-xs text-muted-foreground max-w-sm text-right">
              Only Administrator or Superadmin can edit guest profiles.
            </p>
          )}
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
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
        <Card className={totalBookingBalance > 0 ? 'border-red-200' : ''}>
          <CardContent className="p-5 flex flex-col gap-1">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <TrendingUp className="h-4 w-4" /> Booking Balance
            </div>
            <p className={`text-3xl font-bold ${totalBookingBalance > 0 ? 'text-red-600' : 'text-foreground'}`}>
              {totalBookingBalance > 0 ? formatNaira(totalBookingBalance) : 'Settled'}
            </p>
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
      <Card className={`border-2 ${ls.bg}`}>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div className="flex items-center gap-2">
              <Wallet className="h-5 w-5 text-primary" />
              <CardTitle className="text-base">City Ledger Account</CardTitle>
              {ledgerAccount ? (
                <Badge variant="outline" className={`text-xs ${ledgerBalance > 0 ? 'border-red-200 text-red-700 bg-red-50' : ledgerBalance < 0 ? 'border-green-200 text-green-700 bg-green-50' : ''}`}>
                  {ls.label}
                </Badge>
              ) : (
                <Badge variant="secondary" className="text-xs">No Account</Badge>
              )}
            </div>
            {ledgerAccount && (
              <Button size="sm" onClick={() => setPaymentModalOpen(true)}>
                Settle / Top Up
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {!ledgerAccount ? (
            <p className="text-sm text-muted-foreground">
              No city ledger account linked to this guest. City ledger accounts are created when a booking is made using City Ledger as the payment method.
            </p>
          ) : (
            <div className="flex items-end gap-6 flex-wrap">
              <div>
                <p className="text-xs text-muted-foreground mb-1">Current Balance</p>
                <p className={`text-4xl font-bold ${ls.color}`}>
                  {formatNaira(Math.abs(ledgerBalance))}
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  {ledgerBalance > 0
                    ? 'Amount owed to hotel (debit)'
                    : ledgerBalance < 0
                    ? `Credit of ${formatNaira(Math.abs(ledgerBalance))} available`
                    : 'Account fully settled'}
                </p>
              </div>
              <div className="text-sm text-muted-foreground space-y-1">
                <p>Account: <span className="font-medium text-foreground">{ledgerAccount.account_name}</span></p>
                <p>Type: <span className="font-medium text-foreground capitalize">{ledgerAccount.account_type}</span></p>
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
            {isEditingGuest && canEditGuest ? (
              <div className="space-y-3">
                <div className="space-y-2">
                  <Label>Full Name</Label>
                  <input
                    className="w-full px-3 py-2 border rounded-md text-sm bg-background"
                    value={guestForm.name}
                    onChange={(e) => setGuestForm((prev) => ({ ...prev, name: e.target.value }))}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Phone</Label>
                  <input
                    className="w-full px-3 py-2 border rounded-md text-sm bg-background"
                    value={guestForm.phone}
                    onChange={(e) => setGuestForm((prev) => ({ ...prev, phone: e.target.value }))}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Email</Label>
                  <input
                    className="w-full px-3 py-2 border rounded-md text-sm bg-background"
                    value={guestForm.email}
                    onChange={(e) => setGuestForm((prev) => ({ ...prev, email: e.target.value }))}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Address</Label>
                  <input
                    className="w-full px-3 py-2 border rounded-md text-sm bg-background"
                    value={guestForm.address}
                    onChange={(e) => setGuestForm((prev) => ({ ...prev, address: e.target.value }))}
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label>City</Label>
                    <input
                      className="w-full px-3 py-2 border rounded-md text-sm bg-background"
                      value={guestForm.city}
                      onChange={(e) => setGuestForm((prev) => ({ ...prev, city: e.target.value }))}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Country</Label>
                    <input
                      className="w-full px-3 py-2 border rounded-md text-sm bg-background"
                      value={guestForm.country}
                      onChange={(e) => setGuestForm((prev) => ({ ...prev, country: e.target.value }))}
                    />
                  </div>
                </div>
                <Separator />
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label>ID Type</Label>
                    <input
                      className="w-full px-3 py-2 border rounded-md text-sm bg-background"
                      value={guestForm.id_type}
                      onChange={(e) => setGuestForm((prev) => ({ ...prev, id_type: e.target.value }))}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>ID Number</Label>
                    <input
                      className="w-full px-3 py-2 border rounded-md text-sm bg-background"
                      value={guestForm.id_number}
                      onChange={(e) => setGuestForm((prev) => ({ ...prev, id_number: e.target.value }))}
                    />
                  </div>
                </div>
              </div>
            ) : (
              <>
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
              </>
            )}
          </CardContent>
        </Card>

        {/* Booking History */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-base">Booking History ({bookings.length})</CardTitle>
          </CardHeader>
          <CardContent>
            {bookings.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                <Building2 className="h-12 w-12 mb-3 opacity-30" />
                <p>No bookings found</p>
              </div>
            ) : (
              <div className="space-y-3">
                {bookings.map((b) => (
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
                      <Badge variant="outline" className={`text-xs ${statusColor(b.payment_status)}`}>
                        {b.payment_status}
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

      {/* City Ledger Payment Modal */}
      {ledgerAccount && (
        <CityLedgerPaymentModal
          open={paymentModalOpen}
          onClose={() => setPaymentModalOpen(false)}
          onSuccess={loadGuest}
          accountType="guest"
          accountName={guest.name}
          ledgerAccountId={ledgerAccount.id}
          currentBalance={guestOutstandingBalance}
          organizationId={orgId}
          guestId={guest.id}
        />
      )}
    </div>
  )
}
