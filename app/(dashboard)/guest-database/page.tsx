'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { EnhancedDataTable } from '@/components/shared/enhanced-data-table'
import { Button } from '@/components/ui/button'
import { CardContent } from '@/components/ui/card'
import { calculateGuestBalancesBatch } from '@/lib/balance'
import { formatNaira } from '@/lib/utils/currency'
import { Loader2 } from 'lucide-react'
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
  total_balance?: number
}

export default function GuestDatabasePage() {
  const [guests, setGuests] = useState<Guest[]>([])
  const [loading, setLoading] = useState(true)
  const router = useRouter()

  useEffect(() => {
    fetchGuests()
  }, [])

  const fetchGuests = async () => {
    try {
      setLoading(true)
      const supabase = createClient()
      if (!supabase) { setGuests([]); setLoading(false); return }
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

      // Batch-fetch balances using optimized utility function
      const guestIds = (data || []).map((g: any) => g.id)
      const balanceMap = await calculateGuestBalancesBatch(supabase, guestIds)

      // Attach balances to guests
      const guestsWithBalance = (data || []).map((guest: any) => ({
        ...guest,
        total_balance: balanceMap[guest.id] || 0
      }))

      setGuests(guestsWithBalance)
    } catch (err: any) {
      console.error('[v0] Error fetching guests:', err)
      setGuests([])
    } finally {
      setLoading(false)
    }
  }

  const goToGuest = (guest: Guest) => router.push(`/guest-database/${guest.id}`)

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
              <div className="cursor-pointer hover:text-primary" onClick={() => goToGuest(guest)}>
                <div className="font-semibold">{guest.name}</div>
                <div className="text-xs text-muted-foreground">{guest.phone}</div>
              </div>
            ),
          },
          {
            key: 'email',
            label: 'Email',
            render: (guest) => (
              <div className="text-sm text-muted-foreground cursor-pointer" onClick={() => goToGuest(guest)}>
                {guest.email || '—'}
              </div>
            ),
          },
          {
            key: 'address',
            label: 'Address',
            render: (guest) => (
              <div className="text-sm text-muted-foreground cursor-pointer" onClick={() => goToGuest(guest)}>
                {[guest.address, guest.city, guest.country].filter(Boolean).join(', ') || '—'}
              </div>
            ),
          },
          {
            key: 'id_type',
            label: 'ID',
            render: (guest) => (
              <div className="text-sm cursor-pointer" onClick={() => goToGuest(guest)}>
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
              <div className="text-sm text-muted-foreground cursor-pointer" onClick={() => goToGuest(guest)}>
                {guest.created_at ? format(new Date(guest.created_at), 'dd MMM yyyy') : '—'}
              </div>
            ),
          },
          {
            key: 'balance',
            label: 'Outstanding Balance',
            render: (guest) => {
              const balance = (guest as any).total_balance || 0
              return (
                <div
                  className={`text-sm font-medium cursor-pointer ${balance > 0 ? 'text-red-600' : 'text-green-600'}`}
                  onClick={() => goToGuest(guest)}
                >
                  {formatNaira(balance)}
                </div>
              )
            },
          },
          {
            key: 'actions',
            label: '',
            render: (guest) => (
              <Button size="sm" variant="outline" onClick={() => goToGuest(guest)}>
                View
              </Button>
            ),
          },
        ]}
        renderCard={(guest) => (
          <CardContent className="p-4 cursor-pointer hover:bg-accent" onClick={() => goToGuest(guest)}>
            <div className="space-y-2">
              <div className="flex items-start justify-between">
                <div>
                  <div className="font-semibold">{guest.name}</div>
                  <div className="text-sm text-muted-foreground">{guest.phone}</div>
                </div>
                <div className={`text-sm font-semibold ${((guest as any).total_balance || 0) > 0 ? 'text-red-600' : 'text-green-600'}`}>
                  {formatNaira((guest as any).total_balance || 0)}
                </div>
              </div>
              <div className="text-sm text-muted-foreground">{guest.email || '—'}</div>
            </div>
          </CardContent>
        )}
        itemsPerPage={20}
      />
    </div>
  )
}
