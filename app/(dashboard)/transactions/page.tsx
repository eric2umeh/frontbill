'use client'

import { EnhancedDataTable } from '@/components/shared/enhanced-data-table'
import { Badge } from '@/components/ui/badge'
import { CardContent } from '@/components/ui/card'
import { generateEnhancedMockGuests } from '@/lib/mock-data'
import { formatNaira } from '@/lib/utils/currency'
import { Receipt } from 'lucide-react'

const mockGuests = generateEnhancedMockGuests(50)

// Generate transaction records from bookings
const transactions = mockGuests.flatMap((guest) => {
  const baseTransaction = {
    id: Math.random().toString(),
    transactionId: `TXN-${Math.random().toString(36).substring(2, 10).toUpperCase()}`,
    date: guest.checkIn,
    guestName: guest.name,
    room: guest.room,
    amount: guest.amount,
    method: ['cash', 'pos', 'transfer', 'city_ledger'][Math.floor(Math.random() * 4)],
    status: guest.payment === 'paid' ? 'completed' : guest.payment === 'partial' ? 'partial' : 'pending',
    description: `Room ${guest.room} - ${guest.nights} night(s)`,
  }

  // If partial payment, create multiple transactions
  if (guest.payment === 'partial') {
    const paidAmount = guest.amount * 0.6
    const remainingAmount = guest.amount * 0.4
    return [
      { ...baseTransaction, amount: paidAmount, status: 'completed' },
      { ...baseTransaction, id: Math.random().toString(), transactionId: `TXN-${Math.random().toString(36).substring(2, 10).toUpperCase()}`, amount: remainingAmount, status: 'pending' }
    ]
  }

  return [baseTransaction]
})

export default function TransactionsPage() {
  const methodColors: Record<string, string> = {
    cash: 'bg-green-500/10 text-green-700 border-green-200',
    pos: 'bg-blue-500/10 text-blue-700 border-blue-200',
    transfer: 'bg-purple-500/10 text-purple-700 border-purple-200',
    city_ledger: 'bg-orange-500/10 text-orange-700 border-orange-200',
  }

  const statusColors: Record<string, string> = {
    completed: 'bg-green-500/10 text-green-700 border-green-200',
    partial: 'bg-yellow-500/10 text-yellow-700 border-yellow-200',
    pending: 'bg-orange-500/10 text-orange-700 border-orange-200',
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Transactions</h1>
          <p className="text-muted-foreground">All payment transactions and records</p>
        </div>
      </div>

      <EnhancedDataTable
        data={transactions}
        searchKeys={['transactionId', 'guestName', 'room']}
        filters={[
          {
            key: 'method',
            label: 'Payment Method',
            options: [
              { value: 'cash', label: 'Cash' },
              { value: 'pos', label: 'POS' },
              { value: 'transfer', label: 'Transfer' },
              { value: 'city_ledger', label: 'City Ledger' },
            ],
          },
          {
            key: 'status',
            label: 'Status',
            options: [
              { value: 'completed', label: 'Completed' },
              { value: 'partial', label: 'Partial' },
              { value: 'pending', label: 'Pending' },
            ],
          },
        ]}
        columns={[
          {
            key: 'transactionId',
            label: 'Transaction ID',
            render: (txn) => (
              <div className="font-mono text-sm">{txn.transactionId}</div>
            ),
          },
          {
            key: 'guestName',
            label: 'Guest',
            render: (txn) => (
              <div>
                <div className="font-medium">{txn.guestName}</div>
                <div className="text-xs text-muted-foreground">{txn.description}</div>
              </div>
            ),
          },
          {
            key: 'date',
            label: 'Date',
            render: (txn) => (
              <div className="text-sm">
                {new Date(txn.date).toLocaleDateString('en-GB')}
              </div>
            ),
          },
          {
            key: 'amount',
            label: 'Amount',
            render: (txn) => (
              <div className="font-semibold">{formatNaira(txn.amount)}</div>
            ),
          },
          {
            key: 'method',
            label: 'Method',
            render: (txn) => (
              <Badge variant="outline" className={methodColors[txn.method]}>
                {txn.method.replace('_', ' ').toUpperCase()}
              </Badge>
            ),
          },
        ]}
        renderCard={(txn) => (
          <CardContent className="p-4">
            <div className="space-y-3">
              <div className="flex items-start justify-between">
                <div>
                  <div className="font-mono text-sm text-muted-foreground">{txn.transactionId}</div>
                  <div className="font-semibold mt-1">{txn.guestName}</div>
                  <div className="text-sm text-muted-foreground">{txn.description}</div>
                </div>
                <Badge variant="outline" className={statusColors[txn.status]}>
                  {txn.status}
                </Badge>
              </div>
              <div className="grid grid-cols-2 gap-2 text-sm pt-2 border-t">
                <div>
                  <div className="text-muted-foreground">Amount</div>
                  <div className="font-semibold">{formatNaira(txn.amount)}</div>
                </div>
                <div>
                  <div className="text-muted-foreground">Method</div>
                  <Badge variant="outline" className={methodColors[txn.method]} size="sm">
                    {txn.method.replace('_', ' ').toUpperCase()}
                  </Badge>
                </div>
              </div>
            </div>
          </CardContent>
        )}
        itemsPerPage={20}
      />
    </div>
  )
}
