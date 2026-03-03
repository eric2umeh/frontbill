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
  Calendar, CreditCard, TrendingUp, FileText, Building2, Hash
} from 'lucide-react'
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

export default function GuestDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const router = useRouter()
  const [guest, setGuest] = useState<Guest | null>(null)
  const [bookings, setBookings] = useState<Booking[]>([])
  const [loading, setLoading] = useState(true)

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

  const totalSpent = bookings.reduce((s, b) => s + Number(b.deposit || 0), 0)
  const totalBalance = bookings.reduce((s, b) => s + Number(b.balance || 0), 0)
  const lastVisit = bookings.length > 0 ? bookings[0].check_in : null

  const statusColor = (status: string) => {
    switch (status) {
      case 'paid': return 'text-green-700 border-green-200 bg-green-50'
      case 'partial': return 'text-yellow-700 border-yellow-200 bg-yellow-50'
      case 'pending': return 'text-orange-700 border-orange-200 bg-orange-50'
      default: return 'text-gray-700 border-gray-200 bg-gray-50'
    }
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
        <Card className={totalBalance > 0 ? 'border-red-200' : ''}>
          <CardContent className="p-5 flex flex-col gap-1">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <TrendingUp className="h-4 w-4" /> Outstanding Balance
            </div>
            <p className={`text-3xl font-bold ${totalBalance > 0 ? 'text-red-600' : 'text-green-600'}`}>
              {formatNaira(totalBalance)}
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
    </div>
  )
}
