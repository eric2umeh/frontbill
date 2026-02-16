'use client'

import { Payment } from '@/lib/types/database'
import { DataTable, Column } from '@/components/shared/data-table'
import { Badge } from '@/components/ui/badge'
import { formatDateTime } from '@/lib/utils/date'
import { formatNaira } from '@/lib/utils/currency'

interface PaymentsTableProps {
  payments: Payment[]
}

export function PaymentsTable({ payments }: PaymentsTableProps) {
  const methodColors: Record<string, string> = {
    cash: 'bg-green-100 text-green-800',
    pos: 'bg-blue-100 text-blue-800',
    transfer: 'bg-purple-100 text-purple-800',
    cheque: 'bg-orange-100 text-orange-800',
    credit: 'bg-yellow-100 text-yellow-800',
  }

  const columns: Column<Payment>[] = [
    {
      header: 'Reference',
      accessor: 'payment_reference',
      cell: (value) => (
        <span className="font-mono text-sm">{value}</span>
      ),
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
          {payment.organization ? (
            <>
              <p className="font-medium">{payment.organization.name}</p>
              <p className="text-xs text-muted-foreground">Organization</p>
            </>
          ) : payment.guest ? (
            <>
              <p className="font-medium">{payment.guest.first_name} {payment.guest.last_name}</p>
              <p className="text-xs text-muted-foreground">Individual</p>
            </>
          ) : (
            <span className="text-muted-foreground">N/A</span>
          )}
        </div>
      ),
    },
    {
      header: 'Amount',
      accessor: 'amount',
      cell: (value) => (
        <span className="font-semibold text-green-600">{formatNaira(value)}</span>
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
      header: 'Date',
      accessor: 'payment_date',
      cell: (value) => formatDateTime(value),
      className: 'hidden lg:table-cell',
    },
  ]

  return <DataTable columns={columns} data={payments} pageSize={15} />
}
