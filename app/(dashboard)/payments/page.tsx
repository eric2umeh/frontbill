'use client'

import { PaymentsTable } from '@/components/payments/payments-table'
import { Button } from '@/components/ui/button'
import { Plus, Download } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { formatNaira } from '@/lib/utils/currency'

// Mock payments data
const mockPayments: any[] = []

export default function PaymentsPage() {
  const payments = mockPayments

  const totalReceived = payments.reduce((sum, p) => sum + Number(p.amount), 0)
  const cashPayments = payments.filter(p => p.payment_method === 'cash').reduce((sum, p) => sum + Number(p.amount), 0)
  const posPayments = payments.filter(p => p.payment_method === 'pos').reduce((sum, p) => sum + Number(p.amount), 0)
  const transferPayments = payments.filter(p => p.payment_method === 'transfer').reduce((sum, p) => sum + Number(p.amount), 0)

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Payments</h1>
          <p className="text-muted-foreground">
            Track all payment transactions
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline">
            <Download className="mr-2 h-4 w-4" />
            Export
          </Button>
          <Button>
            <Plus className="mr-2 h-4 w-4" />
            Record Payment
          </Button>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardContent className="pt-6">
            <div className="text-sm text-muted-foreground">Total Received</div>
            <div className="text-2xl font-bold text-green-600">{formatNaira(totalReceived)}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-sm text-muted-foreground">Cash</div>
            <div className="text-2xl font-bold">{formatNaira(cashPayments)}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-sm text-muted-foreground">POS</div>
            <div className="text-2xl font-bold">{formatNaira(posPayments)}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-sm text-muted-foreground">Transfer</div>
            <div className="text-2xl font-bold">{formatNaira(transferPayments)}</div>
          </CardContent>
        </Card>
      </div>

      <PaymentsTable payments={payments} />
    </div>
  )
}
