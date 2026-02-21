'use client'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { CreditCard } from 'lucide-react'
import { formatNaira } from '@/lib/utils/currency'

const payments = [
  { id: 1, name: 'Adewale Johnson', amount: 45000, method: 'cash', date: new Date().toLocaleDateString() },
  { id: 2, name: 'Fatima Bello', amount: 120000, method: 'transfer', date: new Date().toLocaleDateString() },
  { id: 3, name: 'Emeka Okafor', amount: 85000, method: 'pos', date: new Date().toLocaleDateString() },
  { id: 4, name: 'Sarah Williams', amount: 95000, method: 'transfer', date: new Date().toLocaleDateString() },
  { id: 5, name: 'Pierre Dubois', amount: 150000, method: 'pos', date: new Date().toLocaleDateString() },
]

const methodColors = {
  cash: 'bg-green-500/10 text-green-700',
  pos: 'bg-blue-500/10 text-blue-700',
  transfer: 'bg-purple-500/10 text-purple-700',
}

export function RecentPayments() {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex gap-2 items-center"><CreditCard className="w-5 h-5" />Recent Payments</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {payments.map(p => (
          <div key={p.id} className="flex justify-between items-center border-b pb-3 last:border-0">
            <div>
              <p className="font-medium text-sm">{p.name}</p>
              <p className="text-xs text-muted-foreground">{p.date}</p>
            </div>
            <div className="flex gap-3 items-center">
              <Badge className={methodColors[p.method as keyof typeof methodColors]}>{p.method}</Badge>
              <p className="font-semibold text-green-600">{formatNaira(p.amount)}</p>
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  )
}
