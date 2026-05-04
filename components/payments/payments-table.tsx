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
    credit: 'bg-yellow-100 text-yellow-800',
  }

  const methodBadgeClass = (method: string) =>
    methodColors[method] ?? 'bg-muted text-muted-foreground'

  const columns: Column<Payment>[] = [
    {
      header: 'Reference',
      accessor: (payment) => (payment as any).reference_number || (payment as any).payment_reference || payment.id,
      cell: (value) => (
        <span className="font-mono text-sm">{value}</span>
      ),
    },
    {
      header: 'Payer',
      accessor: (payment) => {
        const row = payment as any
        if (row.organization) return row.organization.name
        if (row.guests?.name) return row.guests.name
        if (row.guest?.name) return row.guest.name
        if (row.guest) return `${row.guest.first_name || ''} ${row.guest.last_name || ''}`.trim()
        return 'N/A'
      },
      cell: (_, payment) => (
        <div>
          {(payment as any).organization ? (
            <>
              <p className="font-medium">{(payment as any).organization.name}</p>
              <p className="text-xs text-muted-foreground">Organization</p>
            </>
          ) : (payment as any).guests?.name || (payment as any).guest ? (
            <>
              <p className="font-medium">
                {(payment as any).guests?.name || (payment as any).guest?.name || `${(payment as any).guest?.first_name || ''} ${(payment as any).guest?.last_name || ''}`.trim()}
              </p>
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
        <Badge className={methodBadgeClass(String(value))} variant="secondary">
          {String(value).toUpperCase()}
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
