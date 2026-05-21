'use client'

import { useMemo } from 'react'
import { format, parseISO } from 'date-fns'
import { formatNaira } from '@/lib/utils/currency'
import { formatPaymentMethodLabel } from '@/lib/payments/payment-methods'
import type { OutletOrderRow } from '@/lib/outlets/types'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Printer } from 'lucide-react'

type Props = {
  orders: OutletOrderRow[]
  canPrintReceipt?: boolean
  onPrintReceipt?: (order: OutletOrderRow) => void
}

export function OutletOrdersPanel({ orders, canPrintReceipt, onPrintReceipt }: Props) {
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
              {canPrintReceipt && <th className="p-2 w-20" />}
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
                  {formatPaymentMethodLabel(o.payment_method)}
                </td>
                <td className="p-2">
                  <Badge variant={o.status === 'settled' ? 'default' : 'secondary'}>{o.status}</Badge>
                </td>
                {canPrintReceipt && (
                  <td className="p-2">
                    {o.status === 'settled' && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        title="Print receipt"
                        onClick={() => onPrintReceipt?.(o)}
                      >
                        <Printer className="h-4 w-4" />
                      </Button>
                    )}
                  </td>
                )}
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
