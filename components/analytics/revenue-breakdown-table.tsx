'use client'

import { Payment } from '@/lib/types/database'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { DataTable, Column } from '@/components/shared/data-table'
import { Badge } from '@/components/ui/badge'
import { formatDate } from '@/lib/utils/date'
import { formatNaira } from '@/lib/utils/currency'
import { FileBarChart } from 'lucide-react'

interface RevenueBreakdownTableProps {
  payments: Payment[]
}

export function RevenueBreakdownTable({ payments }: RevenueBreakdownTableProps) {
  const methodColors: Record<string, string> = {
    cash: 'bg-green-100 text-green-800',
    pos: 'bg-blue-100 text-blue-800',
    transfer: 'bg-purple-100 text-purple-800',
    cheque: 'bg-orange-100 text-orange-800',
    credit: 'bg-yellow-100 text-yellow-800',
  }

  const columns: Column<Payment>[] = [
    {
      header: 'Date',
      accessor: 'payment_date',
      cell: (value) => formatDate(value),
    },
    {
      header: 'Payer',
      accessor: (payment) => {
        if (payment.organization) return payment.organization.name
        if (payment.guest) return `${payment.guest.first_name} ${payment.guest.last_name}`
        return 'N/A'
      },
      cell: (_, payment) => (
        <div>
          <p className="font-medium">
            {payment.organization?.name || 
             (payment.guest ? `${payment.guest.first_name} ${payment.guest.last_name}` : 'N/A')}
          </p>
          <Badge variant="secondary" className="mt-1 text-xs">
            {payment.organization ? 'Corporate' : 'Individual'}
          </Badge>
        </div>
      ),
    },
    {
      header: 'Guest/Booking',
      accessor: (payment) => payment.booking?.guest,
      cell: (_, payment) => (
        <div className="text-sm">
          {payment.booking ? (
            <>
              <p>{payment.guest?.first_name} {payment.guest?.last_name}</p>
              <p className="text-xs text-muted-foreground">
                Room {payment.booking.room?.room_number}
              </p>
            </>
          ) : (
            <span className="text-muted-foreground">Direct payment</span>
          )}
        </div>
      ),
      className: 'hidden lg:table-cell',
    },
    {
      header: 'Amount',
      accessor: 'amount',
      cell: (value) => (
        <span className="font-semibold">{formatNaira(value)}</span>
      ),
    },
    {
      header: 'Method',
      accessor: 'payment_method',
      cell: (value) => (
        <Badge className={methodColors[value]} variant="secondary">
          {value.toUpperCase()}
        </Badge>
      ),
    },
    {
      header: 'Status',
      accessor: (payment) => payment.booking?.payment_status || 'completed',
      cell: (value) => (
        <Badge variant={value === 'paid' ? 'default' : 'secondary'}>
          {value === 'paid' ? 'Fully Paid' : value === 'partial' ? 'Partial' : 'Pending'}
        </Badge>
      ),
      className: 'hidden md:table-cell',
    },
  ]

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <FileBarChart className="h-5 w-5" />
          Revenue Breakdown
        </CardTitle>
        <p className="text-sm text-muted-foreground">
          Detailed transaction breakdown showing payer type, guest information, payment method, and status
        </p>
      </CardHeader>
      <CardContent>
        <DataTable columns={columns} data={payments} pageSize={20} />
      </CardContent>
    </Card>
  )
}
