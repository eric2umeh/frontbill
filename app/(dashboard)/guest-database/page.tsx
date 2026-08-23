'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { EnhancedDataTable } from '@/components/shared/enhanced-data-table'
import { Button } from '@/components/ui/button'
import { CardContent } from '@/components/ui/card'
import { calculateGuestBalancesBatch } from '@/lib/balance'
import { formatNaira } from '@/lib/utils/currency'
import { MobileTableSubdetail } from '@/lib/utils/table-mobile'
import { TABLE_INLINE_ROW, TABLE_META_TEXT, TABLE_CELL_TRUNCATE } from '@/lib/utils/table-row-inline'
import { usePageData } from '@/hooks/use-page-data'
import { useAuth } from '@/lib/auth-context'
import { PageLoadingState } from '@/components/loading-screen'
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
    if (!organizationId) return
    fetchGuests()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [organizationId])

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

      // Folio debt (+) / prepaid credit (−) including city-ledger credit
      const balanceMap = await calculateGuestBalancesBatch(
        supabase,
        (data || []).map((g: { id: string; name?: string | null }) => ({
          id: g.id,
          name: g.name,
        })),
        organizationId,
      )

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
        showRowNumbers
        data={guests}
        searchKeys={['name', 'phone', 'email', 'id_number']}
        filters={[]}
        columns={[
          {
            key: 'name',
            label: 'Guest',
            render: (guest) => (
              <div
                className={`cursor-pointer hover:text-primary ${TABLE_INLINE_ROW} max-w-[12rem]`}
                onClick={() => goToGuest(guest)}
              >
                <span className={`font-semibold max-md:text-[13px] ${TABLE_CELL_TRUNCATE}`}>{guest.name}</span>
                {guest.phone && (
                  <span className={`${TABLE_META_TEXT} max-md:hidden shrink-0`}>{guest.phone}</span>
                )}
                <MobileTableSubdetail>
                  {guest.phone && <div>{guest.phone}</div>}
                  {guest.email && <div className="truncate max-w-[200px]">{guest.email}</div>}
                </MobileTableSubdetail>
              </div>
            ),
          },
          {
            key: 'balance',
            label: 'Balance',
            render: (guest) => {
              const balance = (guest as Guest).total_balance ?? 0
              const isCredit = balance < -0.005
              const isDebt = balance > 0.005
              return (
                <div
                  className={`text-xs font-medium cursor-pointer md:text-sm inline-flex items-center gap-1 whitespace-nowrap ${
                    isDebt
                      ? 'text-red-600'
                      : isCredit
                        ? 'text-blue-600'
                        : 'text-green-600'
                  }`}
                  onClick={() => goToGuest(guest)}
                >
                  <span>{formatNaira(Math.abs(balance))}</span>
                  {isCredit && (
                    <span className="text-[10px] font-normal text-blue-600/80 shrink-0">Credit</span>
                  )}
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
              <div className={`text-sm cursor-pointer ${TABLE_INLINE_ROW}`} onClick={() => goToGuest(guest)}>
                {guest.id_type ? (
                  <>
                    <span className="font-medium capitalize shrink-0">{guest.id_type}</span>
                    <span className={`${TABLE_META_TEXT} ${TABLE_CELL_TRUNCATE}`}>{guest.id_number || '—'}</span>
                  </>
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
            stickyOnMobile: true,
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
                {(() => {
                  const bal = Number((guest as Guest).total_balance || 0)
                  const isCredit = bal < -0.005
                  const isDebt = bal > 0.005
                  return (
                    <div
                      className={`text-sm font-semibold text-right ${
                        isDebt
                          ? 'text-red-600'
                          : isCredit
                            ? 'text-blue-600'
                            : 'text-green-600'
                      }`}
                    >
                      <div>{formatNaira(Math.abs(bal))}</div>
                      {isCredit && (
                        <div className="text-[10px] font-normal text-blue-600/80">
                          Credit
                        </div>
                      )}
                    </div>
                  )
                })()}
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
