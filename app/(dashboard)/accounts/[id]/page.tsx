'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter, useParams } from 'next/navigation'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
import { formatNaira } from '@/lib/utils/currency'
import {
  Loader2, ArrowLeft, User, Phone, Mail, MapPin,
  Calendar, CreditCard, TrendingUp, FileText, Building2, Hash,
  Wallet, ArrowDownCircle, ArrowUpCircle, Clock, RefreshCw,
} from 'lucide-react'
import { format } from 'date-fns'
import CityLedgerPaymentModal from '@/components/city-ledger/city-ledger-payment-modal'

interface GuestAccount {
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

interface LedgerAccount {
  id: string
  account_name: string
  account_type: string
  contact_phone: string
  contact_email: string
  balance: number
  created_at: string
  organization_id: string
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

interface LedgerTransaction {
  id: string
  transaction_id: string
  amount: number
  payment_method: string
  status: string
  description: string
  created_at: string
}

export default function AccountDetailPage() {
  const params = useParams()
  const router = useRouter()
  const id = params.id as string

  // Parse account type from prefixed ID: "guest-{uuid}" or "ledger-{uuid}"
  const isGuest = id?.startsWith('guest-')
  const actualId = id?.split('-').slice(1).join('-')

  const [loading, setLoading] = useState(true)
  const [orgId, setOrgId] = useState('')
  const [guestData, setGuestData] = useState<GuestAccount | null>(null)
  const [ledgerData, setLedgerData] = useState<LedgerAccount | null>(null)
  const [bookings, setBookings] = useState<Booking[]>([])
  const [ledgerAccount, setLedgerAccount] = useState<any>(null)
  const [ledgerHistory, setLedgerHistory] = useState<LedgerTransaction[]>([])
  const [paymentModalOpen, setPaymentModalOpen] = useState(false)
  const [folioPaymentsSum, setFolioPaymentsSum] = useState(0)
  const [guestPendingBalance, setGuestPendingBalance] = useState(0)
  const [selectedFolioId, setSelectedFolioId] = useState('')
  const [isCheckingOut, setIsCheckingOut] = useState(false)

  useEffect(() => {
    if (id) loadAccount()
  }, [id])

  const loadAccount = async () => {
    try {
      setLoading(true)
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/auth/login'); return }

      const { data: profile } = await supabase
        .from('profiles').select('organization_id').eq('id', user.id).single()
      if (!profile) return
      setOrgId(profile.organization_id)

      if (isGuest) {
        // --- GUEST ACCOUNT ---
        const [{ data: guest }, { data: bookingData }] = await Promise.all([
          supabase.from('guests').select('*').eq('id', actualId).eq('organization_id', profile.organization_id).single(),
          supabase.from('bookings')
            .select('id, folio_id, check_in, check_out, number_of_nights, total_amount, deposit, balance, payment_status, status, rooms(room_number, room_type)')
            .eq('guest_id', actualId)
            .order('check_in', { ascending: false }),
        ])

        if (!guest) { router.push('/accounts'); return }
        setGuestData(guest)

        const rawBookings = bookingData || []
        const bookingIds = rawBookings.map((b: any) => b.id)
        let folioPaymentsTotal = 0
        let folioPendingByBooking: { [id: string]: number } = {}

        if (bookingIds.length > 0) {
          const { data: folioCharges } = await supabase
            .from('folio_charges')
            .select('booking_id, amount, payment_status, charge_type')
            .in('booking_id', bookingIds)
          if (folioCharges) {
            folioCharges.forEach((c: any) => {
              // city_ledger charges are billed to an account — still outstanding debt owed to the hotel
              if (['pending', 'unpaid', 'city_ledger'].includes(c.payment_status) && Number(c.amount) > 0) {
                folioPendingByBooking[c.booking_id] = (folioPendingByBooking[c.booking_id] || 0) + Number(c.amount)
              }
              if (c.charge_type === 'payment' && Number(c.amount) < 0) {
                folioPaymentsTotal += Math.abs(Number(c.amount))
              }
            })
          }
        }

        const enrichedBookings = rawBookings.map((b: any) => ({ ...b, balance: folioPendingByBooking[b.id] ?? 0 }))
        setBookings(enrichedBookings)
        setFolioPaymentsSum(folioPaymentsTotal)
        if (enrichedBookings.length > 0) setSelectedFolioId(enrichedBookings[0].folio_id)

        const pendingTotal = Object.values(folioPendingByBooking).reduce((s, v) => s + v, 0)
        setGuestPendingBalance(pendingTotal)

        const { data: ledger } = await supabase
          .from('city_ledger_accounts')
          .select('id, balance, account_name, account_type')
          .eq('organization_id', profile.organization_id)
          .ilike('account_name', guest.name)
          .in('account_type', ['individual', 'guest'])
          .maybeSingle()

        setLedgerAccount(pendingTotal > 0
          ? (ledger || { id: null, balance: pendingTotal, account_name: guest.name, account_type: 'individual' })
          : null)

        const { data: txData } = await supabase
          .from('transactions')
          .select('id, transaction_id, amount, payment_method, status, description, created_at')
          .eq('organization_id', profile.organization_id)
          .ilike('guest_name', guest.name)
          .order('created_at', { ascending: false })
          .limit(20)
        setLedgerHistory(txData || [])

      } else {
        // --- LEDGER ACCOUNT (individual / organization) ---
        const { data: ledger, error } = await supabase
          .from('city_ledger_accounts')
          .select('*')
          .eq('id', actualId)
          .eq('organization_id', profile.organization_id)
          .single()

        if (error || !ledger) { router.push('/accounts'); return }
        setLedgerData(ledger)
        setLedgerAccount({ id: ledger.id, balance: ledger.balance, account_name: ledger.account_name, account_type: ledger.account_type })
        setGuestPendingBalance(ledger.balance || 0)

        // Fetch bookings linked via notes field (city_ledger:<account_name>)
        const { data: linkedBookings } = await supabase
          .from('bookings')
          .select('id, folio_id, check_in, check_out, number_of_nights, total_amount, deposit, balance, payment_status, status, rooms(room_number, room_type)')
          .eq('organization_id', profile.organization_id)
          .ilike('notes', `%${ledger.account_name}%`)
          .order('check_in', { ascending: false })
        setBookings(linkedBookings || [])

        const { data: txData } = await supabase
          .from('transactions')
          .select('id, transaction_id, amount, payment_method, status, description, created_at')
          .eq('organization_id', profile.organization_id)
          .ilike('description', `%${ledger.account_name}%`)
          .order('created_at', { ascending: false })
          .limit(20)
        setLedgerHistory(txData || [])
      }
    } catch (err) {
      console.error('Error loading account:', err)
      router.push('/accounts')
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
      setBookings(bookings.map(b => b.folio_id === selectedFolioId ? { ...b, folio_status: 'checked_out' as any } : b))
    } catch (err) {
      console.error('Checkout error:', err)
    } finally {
      setIsCheckingOut(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    )
  }

  const account = isGuest ? guestData : ledgerData
  if (!account) return null

  const accountName = isGuest ? (guestData?.name || '') : (ledgerData?.account_name || '')
  const accountTypeLabel = isGuest ? 'Guest' : (ledgerData?.account_type === 'organization' ? 'Organization' : 'Individual')
  const totalSpent = bookings.reduce((s, b) => s + Number(b.deposit || 0), 0)
  const totalBookingBalance = guestPendingBalance
  const ledgerBalance = ledgerAccount ? guestPendingBalance : 0
  const lastVisit = bookings.length > 0 ? bookings[0].check_in : null

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
    if (desc?.toLowerCase().includes('top-up') || desc?.toLowerCase().includes('credit'))
      return <ArrowUpCircle className="h-4 w-4 text-blue-500 shrink-0" />
    if (desc?.toLowerCase().includes('settlement') || desc?.toLowerCase().includes('payment'))
      return <ArrowDownCircle className="h-4 w-4 text-green-500 shrink-0" />
    return <CreditCard className="h-4 w-4 text-muted-foreground shrink-0" />
  }

  return (
    <div className="space-y-6">
      {/* Back button */}
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="sm" onClick={() => router.push('/accounts')} className="gap-2">
          <ArrowLeft className="h-4 w-4" />
          Back to Accounts
        </Button>
      </div>

      {/* Header */}
      <div className="flex items-start justify-between flex-wrap gap-4">
        <div className="flex items-center gap-4">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-primary/10">
            {isGuest ? <User className="h-8 w-8 text-primary" /> : <Building2 className="h-8 w-8 text-primary" />}
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-3xl font-bold tracking-tight">{accountName}</h1>
              <Badge variant="secondary" className="capitalize">{accountTypeLabel}</Badge>
            </div>
            <p className="text-muted-foreground">
              Account since {format(new Date((account as any).created_at), 'MMMM yyyy')}
            </p>
          </div>
        </div>
        <Button variant="outline" size="sm" onClick={() => loadAccount()} className="gap-2 self-start">
          <RefreshCw className="h-4 w-4" />
          Refresh
        </Button>
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
              <TrendingUp className="h-4 w-4" /> Outstanding Balance
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

      {/* Folio Selector — guests only */}
      {isGuest && bookings.length > 0 && (
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
                      <Button size="sm" variant="outline" onClick={handleCheckoutFolio} disabled={isCheckingOut}>
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

      {/* City Ledger Account */}
      <Card className={`border-2 ${ls.bg}`}>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div className="flex items-center gap-2">
              <Wallet className="h-5 w-5 text-primary" />
              <CardTitle className="text-base">City Ledger Account</CardTitle>
              {ledgerAccount
                ? <Badge variant="outline" className={`text-xs ${ledgerBalance > 0 ? 'border-red-200 text-red-700 bg-red-50' : ''}`}>{ls.label}</Badge>
                : <Badge variant="secondary" className="text-xs">No Account</Badge>
              }
            </div>
            {ledgerAccount && (
              <Button size="sm" onClick={() => setPaymentModalOpen(true)}>Settle / Top Up</Button>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {!ledgerAccount ? (
            <p className="text-sm text-muted-foreground">
              No city ledger account linked. City ledger accounts are created when a booking uses City Ledger as the payment method.
            </p>
          ) : (
            <div className="flex items-end gap-6 flex-wrap">
              <div>
                <p className="text-xs text-muted-foreground mb-1">Current Balance</p>
                <p className={`text-4xl font-bold ${ls.color}`}>{formatNaira(Math.abs(ledgerBalance))}</p>
                <p className="text-xs text-muted-foreground mt-1">
                  {ledgerBalance > 0 ? 'Amount owed to hotel (debit)' : ledgerBalance < 0 ? `Credit of ${formatNaira(Math.abs(ledgerBalance))} available` : 'Account fully settled'}
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
        {/* Contact Info */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{isGuest ? 'Guest' : 'Account'} Information</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-3">
              {(isGuest ? guestData?.phone : ledgerData?.contact_phone) && (
                <div className="flex items-center gap-3 text-sm">
                  <Phone className="h-4 w-4 text-muted-foreground shrink-0" />
                  <span>{isGuest ? guestData?.phone : ledgerData?.contact_phone}</span>
                </div>
              )}
              {(isGuest ? guestData?.email : ledgerData?.contact_email) && (
                <div className="flex items-center gap-3 text-sm">
                  <Mail className="h-4 w-4 text-muted-foreground shrink-0" />
                  <span>{isGuest ? guestData?.email : ledgerData?.contact_email}</span>
                </div>
              )}
              {isGuest && (guestData?.address || guestData?.city || guestData?.country) && (
                <div className="flex items-start gap-3 text-sm">
                  <MapPin className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
                  <span>{[guestData?.address, guestData?.city, guestData?.country].filter(Boolean).join(', ')}</span>
                </div>
              )}
            </div>
            {isGuest && guestData?.id_type && (
              <>
                <Separator />
                <div className="space-y-2">
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Identity Document</p>
                  <div className="flex items-center gap-3 text-sm">
                    <Hash className="h-4 w-4 text-muted-foreground" />
                    <div>
                      <span className="font-medium capitalize">{guestData.id_type}: </span>
                      <span className="text-muted-foreground">{guestData.id_number || '—'}</span>
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
                        {' → '}
                        {b.check_out ? format(new Date(b.check_out), 'dd MMM yyyy') : '—'}
                        {b.number_of_nights ? ` (${b.number_of_nights} night${b.number_of_nights !== 1 ? 's' : ''})` : ''}
                      </div>
                    </div>
                    <div className="text-right space-y-1">
                      <div className="font-semibold">{formatNaira(b.total_amount)}</div>
                      {b.balance > 0 && (
                        <div className="text-xs text-red-600 font-medium">Balance: {formatNaira(b.balance)}</div>
                      )}
                      <Badge variant="outline" className={`text-xs ${
                        b.balance > 0
                          ? 'text-red-700 border-red-200 bg-red-50'
                          : 'text-green-700 border-green-200 bg-green-50'
                      }`}>
                        {b.balance > 0 ? 'Unpaid' : 'Settled'}
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
                    <Badge variant="outline" className="text-xs mt-0.5">{tx.status}</Badge>
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
          onSuccess={loadAccount}
          accountType={isGuest ? 'guest' : (ledgerData?.account_type === 'organization' ? 'organization' : 'individual')}
          accountName={accountName}
          ledgerAccountId={ledgerAccount.id}
          currentBalance={guestPendingBalance}
          organizationId={orgId}
          guestId={isGuest ? actualId : undefined}
        />
      )}
    </div>
  )
}
