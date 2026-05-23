'use client'

import { useMemo, useState } from 'react'
import { format, parseISO } from 'date-fns'
import { formatNaira } from '@/lib/utils/currency'
import { formatPaymentMethodLabel } from '@/lib/payments/payment-methods'
import type { OutletOrderRow } from '@/lib/outlets/types'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { FileText, Printer, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { outletApiHeaders } from '@/lib/outlets/outlet-api-headers'

type Props = {
  orders: OutletOrderRow[]
  canPrintReceipt?: boolean
  canSell?: boolean
  /** Hide the “today only” summary card (e.g. reports tab uses a date range). */
  showTodaySummary?: boolean
  onPrintUnsettled?: (order: OutletOrderRow) => void
  onPrintSettled?: (order: OutletOrderRow) => void
  onSettled?: () => void
}

export function OutletOrdersPanel({
  orders,
  canPrintReceipt,
  canSell,
  showTodaySummary = true,
  onPrintUnsettled,
  onPrintSettled,
  onSettled,
}: Props) {
  const [settlingId, setSettlingId] = useState<string | null>(null)
  const [settlePayMethod, setSettlePayMethod] = useState('pos')

  const todayTotal = useMemo(() => {
    const today = format(new Date(), 'yyyy-MM-dd')
    return orders
      .filter((o) => o.status === 'settled' && o.created_at.startsWith(today))
      .reduce((s, o) => s + Number(o.subtotal), 0)
  }, [orders])

  const settleOpenOrder = async (order: OutletOrderRow) => {
    setSettlingId(order.id)
    try {
      const res = await fetch(`/api/outlets/orders/${order.id}/settle`, {
        method: 'POST',
        headers: await outletApiHeaders({ 'Content-Type': 'application/json' }),
        credentials: 'include',
        body: JSON.stringify({
          payment_method: order.is_complimentary ? 'complimentary' : settlePayMethod,
          is_complimentary: !!order.is_complimentary,
          booking_id: order.booking_id,
          guest_name: order.guest_name,
          room_number: order.room_number,
        }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) {
        toast.error(json.error || 'Could not settle order')
        return
      }
      toast.success(`Settled — ${order.order_number}`)
      onSettled?.()
      if (canPrintReceipt && onPrintSettled && json.order) {
        onPrintSettled(json.order as OutletOrderRow)
      }
    } catch {
      toast.error('Network error')
    } finally {
      setSettlingId(null)
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

      {canSell && orders.some((o) => o.status === 'open') && (
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span className="text-muted-foreground">Settle open bill with:</span>
          <Select value={settlePayMethod} onValueChange={setSettlePayMethod}>
            <SelectTrigger className="h-8 w-[140px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="pos">POS</SelectItem>
              <SelectItem value="cash">Cash</SelectItem>
              <SelectItem value="transfer">Transfer</SelectItem>
              <SelectItem value="city_ledger">Charge to room</SelectItem>
            </SelectContent>
          </Select>
        </div>
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
                          disabled={settlingId === o.id}
                          onClick={() => void settleOpenOrder(o)}
                        >
                          {settlingId === o.id ? (
                            <Loader2 className="h-3 w-3 animate-spin" />
                          ) : (
                            'Settle'
                          )}
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
    </div>
  )
}
