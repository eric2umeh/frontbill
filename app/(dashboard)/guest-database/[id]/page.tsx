'use client'

import { useState, useEffect, use } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
import { formatNaira } from '@/lib/utils/currency'
import {
  Loader2, ArrowLeft, User, Phone, Mail, MapPin,
  Calendar, CreditCard, TrendingUp, FileText, Building2, Hash,
  Wallet, ArrowDownCircle, ArrowUpCircle, Clock,
} from 'lucide-react'
import { format } from 'date-fns'
import CityLedgerPaymentModal from '@/components/city-ledger/city-ledger-payment-modal'

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
  const [guest, setGuest] = useState<Guest | null>(null)
  const [bookings, setBookings] = useState<Booking[]>([])
  const [ledgerAccount, setLedgerAccount] = useState<LedgerAccount | null>(null)
  const [ledgerHistory, setLedgerHistory] = useState<LedgerTransaction[]>([])
  const [orgId, setOrgId] = useState<string>('')
  const [loading, setLoading] = useState(true)
  const [paymentModalOpen, setPaymentModalOpen] = useState(false)
  const [folioPaymentsSum, setFolioPaymentsSum] = useState(0)

  useEffect(() => {
    if (id) loadGuest()
  }, [id])

  const loadGuest = async () => {
    try {
      setLoading(true)
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/auth/login'); return }

      const { data: profile } = await supabase
        .from('profiles').select('organization_id').eq('id', user.id).single()
      if (!profile) return
      setOrgId(profile.organization_id)

      const [{ data: guestData }, { data: bookingData }] = await Promise.all([
        supabase.from('guests').select('*').eq('id', id).eq('organization_id', profile.organization_id).single(),
        supabase.from('bookings')
          .select('id, folio_id, check_in, check_out, number_of_nights, total_amount, deposit, balance, payment_status, status, rooms(room_number, room_type)')
          .eq('guest_id', id)
          .order('check_in', { ascending: false }),
      ])

      if (!guestData) { router.push('/guest-database'); return }
      setGuest(guestData)
      setBookings(bookingData || [])

      // Fetch all folio payment entries for this guest's bookings
      // This lets us accurately calculate Total Paid even if bookings.deposit is stale
      const bookingIds = (bookingData || []).map((b: any) => b.id)
      let folioPaymentsTotal = 0
      if (bookingIds.length > 0) {
        const { data: folioPayments } = await supabase
          .from('folio_charges')
          .select('amount')
          .in('booking_id', bookingIds)
          .eq('charge_type', 'payment')
          .lt('amount', 0) // payments are negative
        if (folioPayments) {
          folioPaymentsTotal = folioPayments.reduce((sum, p) => sum + Math.abs(Number(p.amount)), 0)
        }
      }
      // Store in state for use in totalSpent calculation
      setFolioPaymentsSum(folioPaymentsTotal)

      // City ledger account — fetch if exists, but we use guests.balance as the source of truth
      const { data: ledgerData } = await supabase
        .from('city_ledger_accounts')
        .select('id, balance, account_name, account_type')
        .eq('organization_id', profile.organization_id)
        .ilike('account_name', guestData.name)
        .in('account_type', ['individual', 'guest'])
        .maybeSingle()

      // Show city ledger section if guest has outstanding balance (from guests.balance)
      // Even if no city_ledger_accounts record exists, we can show balance and allow settlement
      // Use guests.balance as the authoritative outstanding balance (not city_ledger_accounts.balance)
      if (guestData.balance > 0) {
        // If ledgerData exists, use it; otherwise create a pseudo-account for display
        setLedgerAccount(ledgerData || { id: null, balance: guestData.balance, account_name: guestData.name, account_type: 'individual' })
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

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    )
  }

  if (!guest) return null

  // Total Paid = sum of original deposits (cash/pos/transfer at booking time)
  // + any payments recorded via "Record Payment" in folio (which bump deposit in DB)
  // + any city-ledger charges that were subsequently paid via folio payment entries
  const totalSpent = bookings.reduce((s, b) => s + Number(b.deposit || 0), 0) + folioPaymentsSum
  // Clamp to 0 — negative means overpaid, show as settled
  const totalBookingBalance = Math.max(0, bookings.reduce((s, b) => s + Number(b.balance || 0), 0))
  const lastVisit = bookings.length > 0 ? bookings[0].check_in : null
  // Use guests.balance as the authoritative city ledger outstanding balance.
  // city_ledger_accounts.balance is only updated when city_ledger payment is used.
  // guests.balance is decremented when payments are settled, so it's always accurate.
  const guestOutstandingBalance = Math.max(0, Number((guest as any).balance ?? 0))
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
            <p className="text-muted-foreground">Guest since {guest.created_at ? format(new Date(guest.created_at), 'MMMM yyyy') : '—'}</p>
          </div>
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
