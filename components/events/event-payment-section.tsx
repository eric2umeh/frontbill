'use client'

import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Checkbox } from '@/components/ui/checkbox'
import { Badge } from '@/components/ui/badge'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { formatNaira } from '@/lib/utils/currency'
import {
  FolioRemarksAttachmentsField,
  type FolioRemarksAttachmentsValue,
} from '@/components/folio/folio-remarks-attachments-field'
import { computeEventPayment, type EventPaymentStatus } from '@/lib/events/compute-event-payment'

export type EventPaymentFormValue = {
  payment_method: string
  payment_status: EventPaymentStatus
  partial_amount: string | number
  pay_above_total: boolean
  folio_extras: FolioRemarksAttachmentsValue
}

type Props = {
  totalAmount: number
  value: EventPaymentFormValue
  onChange: (next: EventPaymentFormValue) => void
  disabled?: boolean
}

export function EventPaymentSection({ totalAmount, value, onChange, disabled }: Props) {
  const paymentMethod = value.payment_method || 'pos'
  const paymentStatus = value.payment_status || 'paid'
  const partialAmount = value.partial_amount
  const payAboveTotal = value.pay_above_total

  const { depositAmount, balanceAmount } = computeEventPayment({
    totalAmount,
    paymentStatus,
    partialAmount: typeof partialAmount === 'number' ? partialAmount : Number(partialAmount) || 0,
    payAboveTotal,
  })

  const patch = (partial: Partial<EventPaymentFormValue>) => onChange({ ...value, ...partial })

  return (
    <div className="space-y-4">
      {totalAmount > 0 && (
        <div className="rounded-lg border bg-muted/40 p-3 text-sm">
          <div className="flex justify-between font-semibold">
            <span>Event total</span>
            <span>{formatNaira(totalAmount)}</span>
          </div>
        </div>
      )}

      <div className="rounded-lg border p-4 space-y-4">
        <p className="text-sm font-semibold">Payment</p>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-2">
            <Label>Payment Status</Label>
            <Select
              value={paymentStatus}
              onValueChange={(v: EventPaymentStatus) => patch({ payment_status: v })}
              disabled={disabled}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="paid">Full Payment</SelectItem>
                <SelectItem value="partial">Partial Payment</SelectItem>
                <SelectItem value="unpaid">No Payment Yet</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Amount Paid</Label>
            <Input
              type="number"
              min={0}
              max={paymentStatus === 'partial' && !payAboveTotal ? totalAmount : undefined}
              value={
                paymentStatus === 'paid' && !payAboveTotal
                  ? totalAmount || ''
                  : partialAmount
              }
              onChange={(e) =>
                patch({
                  partial_amount: e.target.value === '' ? '' : Number(e.target.value),
                })
              }
              disabled={
                disabled ||
                paymentStatus === 'unpaid' ||
                (paymentStatus === 'paid' && !payAboveTotal)
              }
              placeholder="Enter paid amount"
            />
          </div>
        </div>

        <div className="flex items-start gap-2 rounded-md border border-input p-3">
          <Checkbox
            id="event-pay-above-total"
            checked={payAboveTotal}
            disabled={disabled}
            onCheckedChange={(c) => {
              const on = Boolean(c)
              patch({ pay_above_total: on })
              if (on && paymentStatus === 'paid') {
                patch({
                  partial_amount:
                    typeof partialAmount === 'number' && partialAmount >= totalAmount
                      ? partialAmount
                      : totalAmount,
                })
              }
            }}
          />
          <Label
            htmlFor="event-pay-above-total"
            className="text-sm font-normal leading-snug cursor-pointer"
          >
            Guest is paying more than the event total — save the excess as city ledger credit for
            future stays or incidentals.
          </Label>
        </div>

        <div className="space-y-2">
          <Label>Payment Method</Label>
          <Select
            value={paymentMethod}
            onValueChange={(v) => patch({ payment_method: v })}
            disabled={disabled}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="pos">POS</SelectItem>
              <SelectItem value="cash">Cash</SelectItem>
              <SelectItem value="transfer">Transfer</SelectItem>
              <SelectItem value="card">Card</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {totalAmount > 0 && (
          <div className="rounded-lg bg-muted space-y-1 p-3 text-sm border">
            {depositAmount > 0 && (
              <div className="flex justify-between text-green-700">
                <span>Amount Paid</span>
                <span>{formatNaira(depositAmount)}</span>
              </div>
            )}
            {balanceAmount > 0 && (
              <div className="flex justify-between font-medium text-orange-700">
                <span>Balance Due</span>
                <span>{formatNaira(balanceAmount)}</span>
              </div>
            )}
            <div className="flex items-center justify-between pt-1">
              <span className="text-muted-foreground">Method</span>
              <Badge variant="outline">{paymentMethod.replace('_', ' ')}</Badge>
            </div>
          </div>
        )}
      </div>

      <FolioRemarksAttachmentsField
        value={value.folio_extras}
        onChange={(folio_extras) => patch({ folio_extras })}
        disabled={disabled}
      />
    </div>
  )
}
