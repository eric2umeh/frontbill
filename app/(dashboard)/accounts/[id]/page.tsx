'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { formatNaira } from '@/lib/utils/currency'
import { Loader2, ArrowLeft, Phone, Mail, Calendar } from 'lucide-react'
import { format } from 'date-fns'
import { toast } from 'sonner'

export default function AccountDetailPage() {
  const params = useParams()
  const router = useRouter()
  const id = params.id as string

  const [loading, setLoading] = useState(true)
  const [accountType, setAccountType] = useState<'guest' | 'ledger'>('guest')
  const [guestData, setGuestData] = useState<any>(null)
  const [ledgerData, setLedgerData] = useState<any>(null)
  const [bookings, setBookings] = useState<any[]>([])
  const [transactions, setTransactions] = useState<any[]>([])

  useEffect(() => {
    loadAccount()
  }, [id])

  const loadAccount = async () => {
    try {
      setLoading(true)
      const supabase = createClient()
      if (!supabase) return

      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/auth/login'); return }

      const { data: profile } = await supabase
        .from('profiles').select('organization_id').eq('id', user.id).single()
      if (!profile) return

      // Determine account type from ID prefix
      const isGuest = id.startsWith('guest-')
      const isLedger = id.startsWith('ledger-')
      const actualId = id.split('-').slice(1).join('-')

      if (isGuest) {
        // Load guest data
        const { data: guest, error: guestErr } = await supabase
          .from('guests')
          .select('*')
          .eq('id', actualId)
          .eq('organization_id', profile.organization_id)
          .single()

        if (guestErr) throw guestErr
        setGuestData(guest)
        setAccountType('guest')

        // Load guest's bookings
        const { data: bookingData } = await supabase
          .from('bookings')
          .select('*')
          .eq('guest_id', actualId)
          .order('check_in', { ascending: false })

        setBookings(bookingData || [])
      } else if (isLedger) {
        // Load ledger account data
        const { data: ledger, error: ledgerErr } = await supabase
          .from('city_ledger_accounts')
          .select('*')
          .eq('id', actualId)
          .eq('organization_id', profile.organization_id)
          .single()

        if (ledgerErr) throw ledgerErr
        setLedgerData(ledger)
        setAccountType('ledger')

        // Load transactions for this ledger account
        const { data: txnData } = await supabase
          .from('transactions')
          .select('*')
          .eq('organization_id', profile.organization_id)
          .ilike('description', `%${ledger.account_name}%`)
          .order('created_at', { ascending: false })
          .limit(10)

        setTransactions(txnData || [])
      }
    } catch (err: any) {
      console.error('[v0] Error loading account:', err)
      toast.error('Failed to load account details')
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

  const account = accountType === 'guest' ? guestData : ledgerData
  if (!account) {
    return (
      <div className="text-center py-12">
        <p className="text-muted-foreground">Account not found</p>
        <Button variant="outline" onClick={() => router.back()} className="mt-4">
          Go Back
        </Button>
      </div>
    )
  }

  const accountTypeLabel = accountType === 'guest' ? 'Guest' : (ledgerData?.account_type === 'organization' ? 'Organization' : 'Individual')
  const balance = accountType === 'guest' ? 0 : (ledgerData?.balance || 0)

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => router.back()}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-3xl font-bold">{account.name || account.account_name}</h1>
              <Badge variant="secondary" className="capitalize">
                {accountTypeLabel}
              </Badge>
            </div>
            <p className="text-muted-foreground">
              Created {format(new Date(account.created_at), 'dd MMMM yyyy')}
            </p>
          </div>
        </div>
      </div>

      {/* Account Info Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardContent className="pt-6">
            <div className="text-sm text-muted-foreground">Account Type</div>
            <div className="text-2xl font-bold mt-2 capitalize">{accountTypeLabel}</div>
          </CardContent>
        </Card>

        {(account.phone || account.contact_phone) && (
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-2 text-sm text-muted-foreground mb-2">
                <Phone className="h-4 w-4" />
                Phone
              </div>
              <div className="font-medium">{account.phone || account.contact_phone}</div>
            </CardContent>
          </Card>
        )}

        {(account.email || account.contact_email) && (
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-2 text-sm text-muted-foreground mb-2">
                <Mail className="h-4 w-4" />
                Email
              </div>
              <div className="font-medium text-sm break-all">{account.email || account.contact_email}</div>
            </CardContent>
          </Card>
        )}

        {accountType === 'ledger' && (
          <Card>
            <CardContent className="pt-6">
              <div className="text-sm text-muted-foreground">Outstanding Balance</div>
              <div className={`text-2xl font-bold mt-2 ${balance > 0 ? 'text-red-600' : 'text-green-600'}`}>
                {formatNaira(balance)}
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Guest-Specific: Bookings */}
      {accountType === 'guest' && (
        <Card>
          <CardHeader>
            <CardTitle>Booking History</CardTitle>
          </CardHeader>
          <CardContent>
            {bookings.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">No bookings found</p>
            ) : (
              <div className="space-y-4">
                {bookings.map(booking => (
                  <div key={booking.id} className="flex items-between justify-between border-b pb-3 last:border-0">
                    <div>
                      <p className="font-medium">Folio #{booking.folio_id}</p>
                      <p className="text-sm text-muted-foreground">
                        {format(new Date(booking.check_in), 'dd MMM')} - {format(new Date(booking.check_out), 'dd MMM yyyy')}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="font-semibold">{formatNaira(booking.total_amount || 0)}</p>
                      <Badge variant="secondary" className="text-xs mt-1 capitalize">
                        {booking.status}
                      </Badge>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Ledger-Specific: Transactions */}
      {accountType === 'ledger' && (
        <Card>
          <CardHeader>
            <CardTitle>Recent Transactions</CardTitle>
          </CardHeader>
          <CardContent>
            {transactions.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">No transactions found</p>
            ) : (
              <div className="space-y-4">
                {transactions.map(txn => (
                  <div key={txn.id} className="flex items-between justify-between border-b pb-3 last:border-0">
                    <div>
                      <p className="font-medium text-sm">{txn.description}</p>
                      <p className="text-xs text-muted-foreground">
                        {format(new Date(txn.created_at), 'dd MMM yyyy, HH:mm')}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className={`font-semibold ${txn.type === 'income' ? 'text-green-600' : 'text-red-600'}`}>
                        {txn.type === 'income' ? '+' : '-'}{formatNaira(txn.amount)}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Additional Contact Info */}
      {accountType === 'guest' && (account.address || account.city || account.country) && (
        <Card>
          <CardHeader>
            <CardTitle>Address Information</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {account.address && <p>{account.address}</p>}
            {account.city && account.country && (
              <p>{account.city}, {account.country}</p>
            )}
            {account.id_type && account.id_number && (
              <p className="text-sm text-muted-foreground">
                {account.id_type}: {account.id_number}
              </p>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  )
}
