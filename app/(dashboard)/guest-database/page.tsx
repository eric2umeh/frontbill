'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { EnhancedDataTable } from '@/components/shared/enhanced-data-table'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { CardContent } from '@/components/ui/card'
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet'
import { Separator } from '@/components/ui/separator'
import { formatNaira } from '@/lib/utils/currency'
import { Loader2, User, Phone, Mail, MapPin, Calendar, CreditCard, TrendingUp } from 'lucide-react'
import { format } from 'date-fns'

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

interface GuestSummary {
  totalBookings: number
  totalSpent: number
  totalBalance: number
  lastVisit: string | null
  recentBookings: any[]
}

export default function GuestDatabasePage() {
  const [guests, setGuests] = useState<Guest[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedGuest, setSelectedGuest] = useState<Guest | null>(null)
  const [guestSummary, setGuestSummary] = useState<GuestSummary | null>(null)
  const [summaryLoading, setSummaryLoading] = useState(false)
  const router = useRouter()

  useEffect(() => {
    fetchGuests()
  }, [])

  const fetchGuests = async () => {
    try {
      setLoading(true)
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/auth/login'); return }

      const { data: profile } = await supabase
        .from('profiles').select('organization_id').eq('id', user.id).single()
      if (!profile) return

      const { data, error } = await supabase
        .from('guests')
        .select('*')
        .eq('organization_id', profile.organization_id)
        .order('created_at', { ascending: false })

      if (error) throw error
      setGuests(data || [])
    } catch (error: any) {
      setGuests([])
    } finally {
      setLoading(false)
    }
  }

  const openGuestDetail = async (guest: Guest) => {
    setSelectedGuest(guest)
    setSummaryLoading(true)
    try {
      const supabase = createClient()
      // Fetch summary in one query — only the last 5 bookings to save API calls
      const { data: bookings } = await supabase
        .from('bookings')
        .select('id, folio_id, check_in, check_out, total_amount, deposit, balance, payment_status, status, rooms(room_number, room_type)')
        .eq('guest_id', guest.id)
        .order('check_in', { ascending: false })
        .limit(5)

      // Aggregate totals from all bookings in one count query
      const { data: allBookings } = await supabase
        .from('bookings')
        .select('total_amount, deposit, balance')
        .eq('guest_id', guest.id)

      const totalBookings = allBookings?.length || 0
      const totalSpent = allBookings?.reduce((s, b) => s + Number(b.deposit || 0), 0) || 0
      const totalBalance = allBookings?.reduce((s, b) => s + Number(b.balance || 0), 0) || 0
      const lastVisit = allBookings && allBookings.length > 0
        ? (bookings?.[0]?.check_in || null)
        : null

      setGuestSummary({
        totalBookings,
        totalSpent,
        totalBalance,
        lastVisit,
        recentBookings: bookings || [],
      })
    } catch {
      setGuestSummary(null)
    } finally {
      setSummaryLoading(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Guest Database</h1>
          <p className="text-muted-foreground">{guests.length} total guests</p>
        </div>
      </div>

      <EnhancedDataTable
        data={guests}
        searchKeys={['name', 'phone', 'email', 'id_number']}
        filters={[]}
        columns={[
          {
            key: 'name',
            label: 'Guest',
            render: (guest) => (
              <div className="cursor-pointer hover:text-primary" onClick={() => openGuestDetail(guest)}>
                <div className="font-semibold">{guest.name}</div>
                <div className="text-xs text-muted-foreground">{guest.phone}</div>
              </div>
            ),
          },
          {
            key: 'email',
            label: 'Email',
            render: (guest) => (
              <div className="text-sm text-muted-foreground cursor-pointer" onClick={() => openGuestDetail(guest)}>
                {guest.email || '—'}
              </div>
            ),
          },
          {
            key: 'address',
            label: 'Address',
            render: (guest) => (
              <div className="text-sm text-muted-foreground cursor-pointer" onClick={() => openGuestDetail(guest)}>
                {[guest.address, guest.city, guest.country].filter(Boolean).join(', ') || '—'}
              </div>
            ),
          },
          {
            key: 'id_type',
            label: 'ID',
            render: (guest) => (
              <div className="text-sm cursor-pointer" onClick={() => openGuestDetail(guest)}>
                {guest.id_type ? (
                  <div>
                    <div className="font-medium capitalize">{guest.id_type}</div>
                    <div className="text-xs text-muted-foreground">{guest.id_number || '—'}</div>
                  </div>
                ) : <span className="text-muted-foreground">—</span>}
              </div>
            ),
          },
          {
            key: 'created_at',
            label: 'Registered',
            render: (guest) => (
              <div className="text-sm text-muted-foreground cursor-pointer" onClick={() => openGuestDetail(guest)}>
                {guest.created_at ? format(new Date(guest.created_at), 'dd MMM yyyy') : '—'}
              </div>
            ),
          },
          {
            key: 'actions',
            label: '',
            render: (guest) => (
              <Button size="sm" variant="outline" onClick={() => openGuestDetail(guest)}>
                View
              </Button>
            ),
          },
        ]}
        renderCard={(guest) => (
          <CardContent className="p-4 cursor-pointer hover:bg-accent" onClick={() => openGuestDetail(guest)}>
            <div className="space-y-2">
              <div className="flex items-start justify-between">
                <div>
                  <div className="font-semibold">{guest.name}</div>
                  <div className="text-sm text-muted-foreground">{guest.phone}</div>
                </div>
              </div>
              <div className="text-sm text-muted-foreground">{guest.email || '—'}</div>
            </div>
          </CardContent>
        )}
        itemsPerPage={20}
      />

      {/* Guest Detail Side Sheet */}
      <Sheet open={!!selectedGuest} onOpenChange={(o) => { if (!o) { setSelectedGuest(null); setGuestSummary(null) } }}>
        <SheetContent className="w-full sm:max-w-xl overflow-y-auto">
          {selectedGuest && (
            <>
              <SheetHeader>
                <SheetTitle className="flex items-center gap-2">
                  <User className="h-5 w-5" />
                  {selectedGuest.name}
                </SheetTitle>
                <SheetDescription>Guest profile and booking summary</SheetDescription>
              </SheetHeader>

              <div className="mt-6 space-y-6">
                {/* Contact Info */}
                <div className="space-y-3">
                  <h3 className="font-semibold text-sm uppercase tracking-wide text-muted-foreground">Contact</h3>
                  <div className="space-y-2">
                    <div className="flex items-center gap-2 text-sm">
                      <Phone className="h-4 w-4 text-muted-foreground" />
                      <span>{selectedGuest.phone || '—'}</span>
                    </div>
                    <div className="flex items-center gap-2 text-sm">
                      <Mail className="h-4 w-4 text-muted-foreground" />
                      <span>{selectedGuest.email || '—'}</span>
                    </div>
                    <div className="flex items-center gap-2 text-sm">
                      <MapPin className="h-4 w-4 text-muted-foreground" />
                      <span>{[selectedGuest.address, selectedGuest.city, selectedGuest.country].filter(Boolean).join(', ') || '—'}</span>
                    </div>
                  </div>
                </div>

                {selectedGuest.id_type && (
                  <div className="space-y-2">
                    <h3 className="font-semibold text-sm uppercase tracking-wide text-muted-foreground">Identity</h3>
                    <div className="flex gap-4 text-sm">
                      <div>
                        <span className="text-muted-foreground">Type: </span>
                        <span className="capitalize font-medium">{selectedGuest.id_type}</span>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Number: </span>
                        <span className="font-medium">{selectedGuest.id_number || '—'}</span>
                      </div>
                    </div>
                  </div>
                )}

                <Separator />

                {/* Account Summary */}
                {summaryLoading ? (
                  <div className="flex items-center gap-2 text-muted-foreground text-sm py-4">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Loading account summary...
                  </div>
                ) : guestSummary && (
                  <>
                    <div className="space-y-3">
                      <h3 className="font-semibold text-sm uppercase tracking-wide text-muted-foreground">Account Summary</h3>
                      <div className="grid grid-cols-2 gap-3">
                        <div className="rounded-lg border p-3 space-y-1">
                          <div className="flex items-center gap-1 text-xs text-muted-foreground">
                            <Calendar className="h-3 w-3" /> Total Bookings
                          </div>
                          <div className="text-2xl font-bold">{guestSummary.totalBookings}</div>
                        </div>
                        <div className="rounded-lg border p-3 space-y-1">
                          <div className="flex items-center gap-1 text-xs text-muted-foreground">
                            <CreditCard className="h-3 w-3" /> Total Paid
                          </div>
                          <div className="text-lg font-bold text-green-600">{formatNaira(guestSummary.totalSpent)}</div>
                        </div>
                        <div className={`rounded-lg border p-3 space-y-1 col-span-2 ${guestSummary.totalBalance > 0 ? 'border-red-200 bg-red-50' : ''}`}>
                          <div className="flex items-center gap-1 text-xs text-muted-foreground">
                            <TrendingUp className="h-3 w-3" /> Total Balance Owed
                          </div>
                          <div className={`text-2xl font-bold ${guestSummary.totalBalance > 0 ? 'text-red-600' : 'text-green-600'}`}>
                            {formatNaira(guestSummary.totalBalance)}
                          </div>
                        </div>
                      </div>
                      {guestSummary.lastVisit && (
                        <p className="text-xs text-muted-foreground">
                          Last visit: {format(new Date(guestSummary.lastVisit), 'dd MMM yyyy')}
                        </p>
                      )}
                    </div>

                    <Separator />

                    {/* Recent Bookings */}
                    {guestSummary.recentBookings.length > 0 && (
                      <div className="space-y-3">
                        <h3 className="font-semibold text-sm uppercase tracking-wide text-muted-foreground">Recent Bookings (last 5)</h3>
                        <div className="space-y-2">
                          {guestSummary.recentBookings.map((b: any) => (
                            <div
                              key={b.id}
                              className="flex items-center justify-between rounded-lg border p-3 text-sm cursor-pointer hover:bg-accent transition-colors"
                              onClick={() => router.push(`/bookings/${b.id}`)}
                            >
                              <div>
                                <div className="font-medium font-mono text-xs">{b.folio_id}</div>
                                <div className="text-muted-foreground">
                                  {b.rooms?.room_number ? `Room ${b.rooms.room_number}` : '—'} · {b.check_in ? format(new Date(b.check_in), 'dd MMM yy') : '—'} — {b.check_out ? format(new Date(b.check_out), 'dd MMM yy') : '—'}
                                </div>
                              </div>
                              <div className="text-right">
                                <div className="font-semibold">{formatNaira(b.total_amount)}</div>
                                <Badge
                                  variant="outline"
                                  className={
                                    b.payment_status === 'paid' ? 'text-green-700 border-green-200 bg-green-50 text-xs' :
                                    b.payment_status === 'partial' ? 'text-yellow-700 border-yellow-200 bg-yellow-50 text-xs' :
                                    'text-orange-700 border-orange-200 bg-orange-50 text-xs'
                                  }
                                >
                                  {b.payment_status}
                                </Badge>
                              </div>
                            </div>
                          ))}
                        </div>
                        {guestSummary.totalBookings > 5 && (
                          <p className="text-xs text-muted-foreground text-center">
                            Showing 5 of {guestSummary.totalBookings} bookings
                          </p>
                        )}
                      </div>
                    )}
                  </>
                )}
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>
    </div>
  )
}
