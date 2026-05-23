'use client'

import { useMemo, useState } from 'react'
import { format, parseISO } from 'date-fns'
import { formatNaira } from '@/lib/utils/currency'
import { formatPaymentMethodLabel } from '@/lib/payments/payment-methods'
import type { OutletOrderRow } from '@/lib/outlets/types'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { FileText, Printer, Loader2 } from 'lucide-react'
import { OutletSettleOrderDialog } from '@/components/outlets/outlet-settle-order-dialog'

type Props = {
  orders: OutletOrderRow[]
  organizationId: string
  departmentLabel: string
  canPrintReceipt?: boolean
  canSell?: boolean
  showTodaySummary?: boolean
  onPrintUnsettled?: (order: OutletOrderRow) => void
  onPrintSettled?: (order: OutletOrderRow) => void
  onSettled?: () => void
}

export function OutletOrdersPanel({
  orders,
  organizationId,
  departmentLabel,
  canPrintReceipt,
  canSell,
  showTodaySummary = true,
  onPrintUnsettled,
  onPrintSettled,
  onSettled,
}: Props) {
  const [settleTarget, setSettleTarget] = useState<OutletOrderRow | null>(null)

  const todayTotal = useMemo(() => {
    const today = format(new Date(), 'yyyy-MM-dd')
    return orders
      .filter((o) => o.status === 'settled' && o.created_at.startsWith(today))
      .reduce((s, o) => s + Number(o.subtotal), 0)
  }, [orders])

  const handleSettled = (order: OutletOrderRow) => {
    onSettled?.()
    if (canPrintReceipt && onPrintSettled) {
      onPrintSettled(order)
    }
  }

  return (
    <div className="space-y-3">
      {showTodaySummary && (
        <Card>
          <CardHeader className="py-2 px-3">
            <CardTitle className="text-sm">Today&apos;s settled sales</CardTitle>
          </CardHeader>
          <CardContent className="px-3 pb-3 pt-0">
            <p className="text-xl font-bold">{formatNaira(todayTotal)}</p>
            <p className="text-[10px] text-muted-foreground">
              {orders.filter((o) => o.status === 'settled').length} settled ·{' '}
              {orders.filter((o) => o.status === 'open').length} open bills
            </p>
          </CardContent>
        </Card>
      )}

      <div className="border rounded-lg overflow-x-auto">
        <table className="w-full text-xs">
          <thead className="bg-muted/50">
            <tr>
              <th className="text-left p-2">Receipt #</th>
              <th className="text-left p-2">Time</th>
              <th className="text-left p-2">Guest</th>
              <th className="text-right p-2">Items</th>
              <th className="text-right p-2">Total</th>
              <th className="p-2">Pay</th>
              <th className="p-2">Status</th>
              {canPrintReceipt && <th className="p-2 text-right">Print</th>}
            </tr>
          </thead>
          <tbody>
            {orders.map((o) => (
              <tr key={o.id} className="border-t">
                <td className="p-2 font-mono">{o.order_number}</td>
                <td className="p-2 text-muted-foreground">
                  {format(parseISO(o.created_at), 'dd MMM · HH:mm')}
                </td>
                <td className="p-2">{o.guest_name || o.room_number || '—'}</td>
                <td className="p-2 text-right text-muted-foreground">
                  {(o.outlet_order_lines ?? []).reduce((s, l) => s + (Number(l.qty) || 0), 0)}
                </td>
                <td className="p-2 text-right font-medium">{formatNaira(o.subtotal)}</td>
                <td className="p-2">
                  {o.is_complimentary
                    ? 'Complimentary'
                    : o.status === 'settled'
                      ? formatPaymentMethodLabel(o.payment_method)
                      : '—'}
                </td>
                <td className="p-2">
                  <Badge
                    variant={o.status === 'settled' ? 'default' : o.status === 'open' ? 'outline' : 'secondary'}
                    className="text-[10px]"
                  >
                    {o.status === 'open' ? 'unsettled' : o.status}
                  </Badge>
                </td>
                {canPrintReceipt && (
                  <td className="p-2">
                    <div className="flex justify-end gap-0.5 flex-wrap">
                      {(o.status === 'open' || o.status === 'settled') && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7"
                          title="Print unsettled bill"
                          onClick={() => onPrintUnsettled?.(o)}
                        >
                          <FileText className="h-3.5 w-3.5" />
                        </Button>
                      )}
                      {o.status === 'settled' && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7"
                          title="Print settled receipt"
                          onClick={() => onPrintSettled?.(o)}
                        >
                          <Printer className="h-3.5 w-3.5" />
                        </Button>
                      )}
                      {canSell && o.status === 'open' && (
                        <Button
                          type="button"
                          variant="secondary"
                          size="sm"
                          className="h-7 text-[10px] px-2"
                          onClick={() => setSettleTarget(o)}
                        >
                          Settle
                        </Button>
                      )}
                    </div>
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

      <OutletSettleOrderDialog
        order={settleTarget}
        open={!!settleTarget}
        onOpenChange={(open) => !open && setSettleTarget(null)}
        organizationId={organizationId}
        departmentLabel={departmentLabel}
        onSettled={handleSettled}
      />
    </div>
  )
}
