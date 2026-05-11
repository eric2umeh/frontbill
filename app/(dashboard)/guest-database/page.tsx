'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { EnhancedDataTable } from '@/components/shared/enhanced-data-table'
import { Button } from '@/components/ui/button'
import { CardContent } from '@/components/ui/card'
import { calculateGuestBalancesBatch } from '@/lib/balance'
import { formatNaira } from '@/lib/utils/currency'
import { usePageData } from '@/hooks/use-page-data'
import { useAuth } from '@/lib/auth-context'
import { PageLoadingState } from '@/components/shared/loading-screen'
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
  const { initialLoading, startFetch, endFetch } = usePageData()
  const { organizationId } = useAuth()
  const router = useRouter()

  useEffect(() => {
    fetchGuests()
  }, [])

  const fetchGuests = async () => {
    try {
      startFetch()
      const supabase = createClient()
      if (!supabase) { setGuests([]); endFetch(); return }

      const { data, error } = await supabase
        .from('guests')
        .select('*')
        .eq('organization_id', organizationId)
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
      console.error('Error fetching guests:', err)
      setGuests([])
    } finally {
      endFetch()
    }
  }

  const goToGuest = (guest: Guest) => router.push(`/guest-database/${guest.id}`)

  if (initialLoading) {
    return <PageLoadingState />
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
        compactTable
        data={guests}
        searchKeys={['name', 'phone', 'email', 'id_number']}
        filters={[]}
        columns={[
          {
            key: 'name',
            label: 'Guest',
            render: (guest) => (
              <div className="cursor-pointer hover:text-primary" onClick={() => goToGuest(guest)}>
                <div className="font-semibold max-md:text-[13px]">{guest.name}</div>
                <div className="text-xs text-muted-foreground">{guest.phone}</div>
              </div>
            ),
          },
          {
            key: 'balance',
            label: 'Balance',
            render: (guest) => {
              const balance = (guest as Guest).total_balance ?? 0
              return (
                <div
                  className={`text-xs font-medium cursor-pointer md:text-sm ${balance > 0 ? 'text-red-600' : 'text-green-600'}`}
                  onClick={() => goToGuest(guest)}
                >
                  {formatNaira(balance)}
                </div>
              )
            },
          },
          {
            key: 'email',
            label: 'Email',
            responsive: 'md+',
            render: (guest) => (
              <div className="text-sm text-muted-foreground cursor-pointer max-md:text-xs" onClick={() => goToGuest(guest)}>
                {guest.email || '—'}
              </div>
            ),
          },
          {
            key: 'address',
            label: 'Address',
            responsive: 'lg+',
            render: (guest) => (
              <div className="text-sm text-muted-foreground cursor-pointer" onClick={() => goToGuest(guest)}>
                {[guest.address, guest.city, guest.country].filter(Boolean).join(', ') || '—'}
              </div>
            ),
          },
          {
            key: 'id_type',
            label: 'ID',
            responsive: 'md+',
            render: (guest) => (
              <div className="text-sm cursor-pointer" onClick={() => goToGuest(guest)}>
                {guest.id_type ? (
                  <div>
                    <div className="font-medium capitalize">{guest.id_type}</div>
                    <div className="text-xs text-muted-foreground">{guest.id_number || '—'}</div>
                  </div>
                ) : (
                  <span className="text-muted-foreground">—</span>
                )}
              </div>
            ),
          },
          {
            key: 'created_at',
            label: 'Registered',
            responsive: 'lg+',
            render: (guest) => (
              <div className="text-sm text-muted-foreground cursor-pointer" onClick={() => goToGuest(guest)}>
                {guest.created_at ? format(new Date(guest.created_at), 'dd MMM yyyy') : '—'}
              </div>
            ),
          },
          {
            key: 'actions',
            label: '',
            render: (guest) => (
              <Button size="sm" variant="outline" className="h-8 px-2 text-xs" onClick={() => goToGuest(guest)}>
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
