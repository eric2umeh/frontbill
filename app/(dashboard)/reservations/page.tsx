'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { EnhancedDataTable } from '@/components/shared/enhanced-data-table'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { CardContent } from '@/components/ui/card'
import { formatNaira } from '@/lib/utils/currency'
import { usePageData } from '@/hooks/use-page-data'
import { useAuth } from '@/lib/auth-context'
import { hasPermission } from '@/lib/permissions'
import { Plus, Users, Loader2 } from 'lucide-react'
import { BulkBookingModal } from '@/components/reservations/bulk-booking-modal'
import { NewReservationModal } from '@/components/reservations/new-reservation-modal'
import { getUserDisplayName } from '@/lib/utils/user-display'
import { fetchUserDisplayNameMap } from '@/lib/utils/fetch-user-display-names'
import { getBulkGroupId } from '@/lib/utils/bulk-booking'

interface Reservation {
  id: string
  folio_id: string
  guest_id: string
  room_id: string
  check_in: string
  check_out: string
  status: string
  payment_status: string
  payment_method?: string
  ledger_account_name?: string
  guestName?: string
  guestPhone?: string
  rate_per_night: number
  balance: number
  deposit: number
  notes?: string
  created_by?: string
  created_by_name?: string
  updated_by?: string
  updated_by_name?: string
  is_bulk?: boolean
  bulk_group_id?: string
  room_count?: number
  guest_count?: number
  total_amount?: number
  guests?: { name: string; phone: string }
  rooms?: { room_number: string; room_type: string }
}

export default function ReservationsPage() {
  const [reservations, setReservations] = useState<Reservation[]>([])
  const [bulkModalOpen, setBulkModalOpen] = useState(false)
  const [newReservationOpen, setNewReservationOpen] = useState(false)
  const { initialLoading, startFetch, endFetch } = usePageData()
  const { organizationId, role, userId } = useAuth()
  const router = useRouter()

  useEffect(() => {
    let isMounted = true
    if (isMounted) fetchReservations()
    return () => { isMounted = false }
  }, [])

  const fetchReservations = async () => {
    try {
      startFetch()
      const supabase = createClient()
      if (!supabase) {
        setReservations([])
        return
      }

      // Single query — no FK join on profiles (no FK exists), fetch user names separately
      const { data, error } = await supabase
        .from('bookings')
        .select(`
          id, folio_id, guest_id, room_id, check_in, check_out, status, payment_status,
          rate_per_night, total_amount, balance, deposit, notes, created_by, created_at, updated_by,
          guests:guest_id(id, name, phone),
          rooms:room_id(id, room_number, room_type)
        `)
        .eq('organization_id', organizationId)
        .eq('status', 'reserved')
        .gt('check_in', new Date().toISOString().split('T')[0])
        .order('created_at', { ascending: false })

      if (error) throw error

      // Batch-fetch creator / updater names to avoid N+1 and missing-FK errors
      const userIds = [...new Set([
        ...(data || []).map((r: any) => r.created_by).filter(Boolean),
        ...(data || []).map((r: any) => r.updated_by).filter(Boolean),
      ])]
      const profileMap = await fetchUserDisplayNameMap(userIds as string[], userId)

      // Map data to match interface and calculate balance from folio_charges
      const reservationsWithData = (data || []).map((reservation: any) => {
        let balance = reservation.balance !== undefined ? reservation.balance : 0

        // Derive payment_method + ledger_account_name from notes (no payment_method column on bookings table)
        let payment_method = 'cash'
        let ledger_account_name = ''
        if (reservation.notes) {
          if (/^city_ledger:/i.test(reservation.notes)) {
            payment_method = 'city_ledger'
            ledger_account_name = reservation.notes.replace(/^city_ledger:\s*/i, '')
          } else if (reservation.notes.startsWith('City Ledger:')) {
            payment_method = 'city_ledger'
            ledger_account_name = reservation.notes.replace(/^City Ledger:\s*/, '')
          } else if (reservation.notes.startsWith('payment_method:')) {
            payment_method = reservation.notes.replace(/^payment_method:\s*/, '').split('|')[0].trim()
            const match = reservation.notes.match(/\|ledger:(.+)/)
            if (match) ledger_account_name = match[1].trim()
          }
        }

        return {
          ...reservation,
          payment_method,
          ledger_account_name,
          guestName: reservation.guests?.name || '',
          guestPhone: reservation.guests?.phone || '',
          guests: reservation.guests
            ? (Array.isArray(reservation.guests) ? reservation.guests[0] : reservation.guests)
            : null,
          rooms: reservation.rooms
            ? (Array.isArray(reservation.rooms) ? reservation.rooms[0] : reservation.rooms)
            : null,
          created_by_name: reservation.created_by ? (profileMap[reservation.created_by] || getUserDisplayName(null, reservation.created_by)) : 'System',
          updated_by_name: reservation.updated_by ? (profileMap[reservation.updated_by] || getUserDisplayName(null, reservation.updated_by)) : null,
          balance: balance
        }
      })
      
      setReservations(groupBulkRows(reservationsWithData))
    } catch (error: any) {
      console.error('Error fetching reservations:', error)
      setReservations([])
    } finally {
      endFetch()
    }
  }

  const paymentColors = {
    paid: 'bg-green-500/10 text-green-700 border-green-200',
    partial: 'bg-yellow-500/10 text-yellow-700 border-yellow-200',
    pending: 'bg-orange-500/10 text-orange-700 border-orange-200',
  }

  const statusColors = {
    reserved: 'bg-blue-500/10 text-blue-700 border-blue-200',
    confirmed: 'bg-green-500/10 text-green-700 border-green-200',
    cancelled: 'bg-red-500/10 text-red-700 border-red-200',
  }

  const groupBulkRows = (rows: Reservation[]) => {
    const grouped = new Map<string, Reservation[]>()
    const singles: Reservation[] = []

    rows.forEach((row) => {
      const groupId = getBulkGroupId(row)
      if (!groupId) {
        singles.push(row)
        return
      }
      grouped.set(groupId, [...(grouped.get(groupId) || []), row])
    })

    const bulkRows = Array.from(grouped.entries()).map(([groupId, groupRows]) => {
      const first = groupRows[0]
      const guestNames = Array.from(new Set(groupRows.map(row => row.guests?.name).filter(Boolean)))
      const roomTypes = Array.from(new Set(groupRows.map(row => row.rooms?.room_type).filter(Boolean)))
      return {
        ...first,
        folio_id: `Bulk ${groupId}`,
        is_bulk: true,
        bulk_group_id: groupId,
        room_count: groupRows.length,
        guest_count: guestNames.length,
        total_amount: groupRows.reduce((sum, row) => sum + Number(row.total_amount || 0), 0),
        deposit: groupRows.reduce((sum, row) => sum + Number(row.deposit || 0), 0),
        balance: groupRows.reduce((sum, row) => sum + Number(row.balance || 0), 0),
        guests: {
          name: guestNames.length > 1 ? `${guestNames[0]} + ${guestNames.length - 1} more` : guestNames[0] || 'Bulk Guests',
          phone: `${groupRows.length} room${groupRows.length === 1 ? '' : 's'}`,
        },
        guestName: guestNames.join(' '),
        rooms: {
          room_number: `${groupRows.length}`,
          room_type: roomTypes.join(', ') || 'Multiple rooms',
        },
      }
    })

    return [...bulkRows, ...singles].sort((a, b) => new Date(b.check_in).getTime() - new Date(a.check_in).getTime())
  }

  if (initialLoading) {
    return (
      <div className="flex items-center justify-center h-96">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <BulkBookingModal open={bulkModalOpen} onClose={() => setBulkModalOpen(false)} onSuccess={() => { setBulkModalOpen(false); fetchReservations() }} />
      <NewReservationModal open={newReservationOpen} onClose={() => setNewReservationOpen(false)} onSuccess={() => { setNewReservationOpen(false); fetchReservations() }} />
      
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Reservations</h1>
          <p className="text-muted-foreground">Manage future bookings and reservations</p>
        </div>
        {hasPermission(role, 'reservations:create') && (
          <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row">
            <Button variant="outline" size="sm" className="w-full text-xs sm:w-auto sm:text-sm" onClick={() => setBulkModalOpen(true)}>
              <Users className="mr-2 h-3.5 w-3.5 sm:h-4 sm:w-4" />
              Bulk Booking
            </Button>
            <Button size="sm" className="w-full text-xs sm:w-auto sm:text-sm" onClick={() => setNewReservationOpen(true)}>
              <Plus className="mr-2 h-3.5 w-3.5 sm:h-4 sm:w-4" />
              New Reservation
            </Button>
          </div>
        )}
      </div>

      <EnhancedDataTable
        data={reservations}
        searchKeys={['folio_id', 'guestName', 'guestPhone', 'ledger_account_name', 'rooms.room_number'] as any}
        dateField="check_in"
        filters={[
          {
            key: 'payment_status',
            label: 'Payment Status',
            options: [
              { value: 'paid', label: 'Paid' },
              { value: 'partial', label: 'Partial' },
              { value: 'pending', label: 'Pending' },
            ],
          },
        ]}
        columns={[
          {
            key: 'folio_id',
            label: 'Folio Ref',
            render: (res) => (
              <Link 
                href={res.is_bulk ? `/bulk-bookings/${res.bulk_group_id}` : `/reservations/${res.id}`}
                className="font-mono text-sm cursor-pointer hover:text-primary"
              >
                {res.is_bulk ? `Bulk Reservation (${res.room_count} rooms)` : res.folio_id}
              </Link>
            ),
          },
          {
            key: 'guest',
            label: 'Guest',
            render: (res) => (
              <Link 
                href={res.is_bulk ? `/bulk-bookings/${res.bulk_group_id}` : `/reservations/${res.id}`}
                className="cursor-pointer hover:text-primary block"
              >
                <div className="font-medium">{res.guests?.name}</div>
                <div className="text-xs text-muted-foreground">{res.guests?.phone}</div>
              </Link>
            ),
          },
          {
            key: 'room',
            label: 'Room',
            render: (res) => (
              <Link href={res.is_bulk ? `/bulk-bookings/${res.bulk_group_id}` : `/reservations/${res.id}`} className="cursor-pointer block">
                <div className="font-medium">{res.is_bulk ? `${res.room_count} Rooms` : `Room ${res.rooms?.room_number}`}</div>
                <div className="text-xs text-muted-foreground">{res.rooms?.room_type}</div>
              </Link>
            ),
          },
          {
            key: 'payment_method',
            label: 'Method',
            render: (res) => (
              <div className="space-y-1">
                <Badge variant="outline" className="text-xs capitalize">
                  {(res.payment_method || 'cash').replace(/_/g, ' ')}
                </Badge>
                {res.payment_method === 'city_ledger' && res.ledger_account_name && (
                  <div className="text-xs text-muted-foreground truncate max-w-[120px]">
                    {res.ledger_account_name}
                  </div>
                )}
              </div>
            ),
          },
          {
            key: 'check_in',
            label: 'Check-in Date',
            render: (res) => (
              <div className="text-sm">
                {new Date(res.check_in).toLocaleDateString('en-GB')}
              </div>
            ),
          },
          {
            key: 'check_out',
            label: 'Check-out Date',
            render: (res) => (
              <div className="text-sm">
                {new Date(res.check_out).toLocaleDateString('en-GB')}
              </div>
            ),
          },
          {
            key: 'payment_status',
            label: 'Payment',
            render: (res) => {
              const effectiveStatus = res.payment_method === 'city_ledger' && res.payment_status === 'paid'
                ? 'pending'
                : res.payment_status
              return (
                <div className="space-y-1">
                  <Badge variant="outline" className={(paymentColors as Record<string, string>)[effectiveStatus]}>
                    {effectiveStatus}
                  </Badge>
                  {res.balance > 0 && (
                    <div className="text-xs text-muted-foreground">
                      Bal: {formatNaira(res.balance)}
                    </div>
                  )}
                </div>
              )
            },
          },
          {
            key: 'created_by_name',
            label: 'Created By',
            render: (res) => (
              <div className="text-sm text-muted-foreground">
                {res.created_by_name}
              </div>
            ),
          },
          {
            key: 'updated_by_name',
            label: 'Last Updated',
            render: (res) => (
              <div className="text-sm">
                {res.updated_by_name ? (
                  <div className="text-muted-foreground">
                    {res.updated_by_name}
                  </div>
                ) : (
                  <span className="text-muted-foreground">—</span>
                )}
              </div>
            ),
          },
          {
            key: 'actions',
            label: 'Actions',
            render: (res) => (
              <Button asChild size="sm" variant="outline">
                <Link href={res.is_bulk ? `/bulk-bookings/${res.bulk_group_id}` : `/reservations/${res.id}`}>View</Link>
              </Button>
            ),
          },
        ]}
        renderCard={(res) => (
          <CardContent className="p-4">
            <div className="space-y-3">
              <div className="flex items-start justify-between">
                <div>
                  <div className="font-semibold">{res.guests?.name}</div>
                  <div className="text-sm text-muted-foreground">{res.guests?.phone}</div>
                </div>
                <Badge variant="outline" className={(paymentColors as Record<string, string>)[res.payment_status]}>
                  {res.payment_status}
                </Badge>
              </div>
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div>
                  <div className="text-muted-foreground">Room</div>
                  <div className="font-medium">{res.is_bulk ? `${res.room_count} Rooms` : `Room ${res.rooms?.room_number}`}</div>
                </div>
                <div>
                  <div className="text-muted-foreground">Check-in</div>
                  <div className="font-medium">{new Date(res.check_in).toLocaleDateString('en-GB')}</div>
                </div>
              </div>
            </div>
          </CardContent>
        )}
        itemsPerPage={15}
      />
    </div>
  )
}
