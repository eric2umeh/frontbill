'use client'

import { Booking } from '@/lib/types/database'
import { DataTable, Column } from '@/components/shared/data-table'
import { Badge } from '@/components/ui/badge'
import { formatDate } from '@/lib/utils/date'
import { formatNaira } from '@/lib/utils/currency'

interface BookingsTableProps {
  bookings: Booking[]
}

export function BookingsTable({ bookings }: BookingsTableProps) {
  const statusColors: Record<string, string> = {
    pending: 'bg-yellow-100 text-yellow-800',
    confirmed: 'bg-blue-100 text-blue-800',
    checked_in: 'bg-green-100 text-green-800',
    checked_out: 'bg-gray-100 text-gray-800',
    cancelled: 'bg-red-100 text-red-800',
  }

  const paymentColors: Record<string, string> = {
    pending: 'bg-red-100 text-red-800',
    partial: 'bg-yellow-100 text-yellow-800',
    paid: 'bg-green-100 text-green-800',
    arrears: 'bg-orange-100 text-orange-800',
  }

  const columns: Column<Booking>[] = [
    {
      header: 'Booking #',
      accessor: 'booking_number',
      cell: (value) => (
        <span className="font-mono text-sm">{value}</span>
      ),
    },
    {
      header: 'Guest',
      accessor: (booking) => booking.guest ? `${booking.guest.first_name} ${booking.guest.last_name}` : 'N/A',
      cell: (_, booking) => (
        <div>
          <p className="font-medium">{booking.guest?.first_name} {booking.guest?.last_name}</p>
          {booking.organization && (
            <p className="text-xs text-muted-foreground">{booking.organization.name}</p>
          )}
        </div>
      ),
    },
    {
      header: 'Room',
      accessor: (booking) => booking.room?.room_number || 'N/A',
      className: 'hidden md:table-cell',
    },
    {
      header: 'Check-in/out',
      accessor: (booking) => `${formatDate(booking.check_in)} - ${formatDate(booking.check_out)}`,
      cell: (_, booking) => (
        <div className="text-sm">
          <p>{formatDate(booking.check_in)}</p>
          <p className="text-muted-foreground">{formatDate(booking.check_out)}</p>
        </div>
      ),
      className: 'hidden lg:table-cell',
    },
    {
      header: 'Amount',
      accessor: 'total_amount',
      cell: (value, booking) => (
        <div className="text-right">
          <p className="font-semibold">{formatNaira(value)}</p>
          {booking.balance > 0 && (
            <p className="text-xs text-red-600">₦{booking.balance} due</p>
          )}
        </div>
      ),
    },
    {
      header: 'Status',
      accessor: 'status',
      cell: (value, booking) => (
        <div className="space-y-1">
          <Badge className={statusColors[value]} variant="secondary">
            {value.replace('_', ' ')}
          </Badge>
          <Badge className={paymentColors[booking.payment_status]} variant="secondary">
            {booking.payment_status}
          </Badge>
        </div>
      ),
    },
  ]

  return <DataTable columns={columns} data={bookings} pageSize={15} />
}
