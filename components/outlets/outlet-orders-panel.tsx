'use client'

import { useMemo } from 'react'
import { format, parseISO } from 'date-fns'
import { formatNaira } from '@/lib/utils/currency'
import type { OutletOrderRow } from '@/lib/outlets/types'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'

type Props = {
  orders: OutletOrderRow[]
}

export function OutletOrdersPanel({ orders }: Props) {
  const todayTotal = useMemo(() => {
    const today = format(new Date(), 'yyyy-MM-dd')
    return orders
      .filter((o) => o.status === 'settled' && o.created_at.startsWith(today))
      .reduce((s, o) => s + Number(o.subtotal), 0)
  }, [orders])

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Today&apos;s settled sales</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-2xl font-bold">{formatNaira(todayTotal)}</p>
          <p className="text-xs text-muted-foreground">{orders.filter((o) => o.status === 'settled').length} orders shown</p>
        </CardContent>
      </Card>

      <div className="border rounded-lg overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-muted/50">
            <tr>
              <th className="text-left p-2">Receipt #</th>
              <th className="text-left p-2">Time</th>
              <th className="text-left p-2">Guest</th>
              <th className="text-right p-2">Total</th>
              <th className="p-2">Pay</th>
              <th className="p-2">Status</th>
            </tr>
          </thead>
          <tbody>
            {orders.map((o) => (
              <tr key={o.id} className="border-t">
                <td className="p-2 font-mono text-xs">{o.order_number}</td>
                <td className="p-2 text-muted-foreground">
                  {format(parseISO(o.created_at), 'dd MMM · HH:mm')}
                </td>
                <td className="p-2">{o.guest_name || o.room_number || '—'}</td>
                <td className="p-2 text-right font-medium">{formatNaira(o.subtotal)}</td>
                <td className="p-2 text-xs">
                  {o.payment_method === 'city_ledger' || o.payment_method === 'room_charge'
                    ? 'City ledger'
                    : o.payment_method?.replace('_', ' ') ?? '—'}
                </td>
                <td className="p-2">
                  <Badge variant={o.status === 'settled' ? 'default' : 'secondary'}>{o.status}</Badge>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {orders.length === 0 && (
          <p className="p-6 text-center text-muted-foreground text-sm">No orders yet</p>
        )}
      </div>
    </div>
  )
}
