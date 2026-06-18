'use client'

import { useEffect, useMemo, useState } from 'react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Loader2, Plus } from 'lucide-react'
import type { OutletOrderRow } from '@/lib/outlets/types'
import { OUTLET_ORDER_TYPE_OPTIONS } from '@/lib/outlets/order-types'
import { OUTLET_FEE_LINE_NAMES } from '@/lib/outlets/order-extra-fees'
import { outletApiHeaders } from '@/lib/outlets/outlet-api-headers'
import { toast } from 'sonner'

const FEE_NAMES = new Set([
  OUTLET_FEE_LINE_NAMES.roomService,
  OUTLET_FEE_LINE_NAMES.takeaway,
])

type EditableLine = {
  item_id: string | null
  item_name: string
  qty: number
  unit_price: number
}

type Props = {
  order: OutletOrderRow | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onSaved: (order: OutletOrderRow) => void
}

const numberInputValue = (value: number | null | undefined) =>
  value != null && Number(value) !== 0 ? String(value) : ''

export function OutletEditOrderDialog({ order, open, onOpenChange, onSaved }: Props) {
  const [guestName, setGuestName] = useState('')
  const [roomNumber, setRoomNumber] = useState('')
  const [tableLabel, setTableLabel] = useState('')
  const [waiterName, setWaiterName] = useState('')
  const [notes, setNotes] = useState('')
  const [orderType, setOrderType] = useState('takeaway')
  const [roomServiceFee, setRoomServiceFee] = useState('')
  const [takeawayFee, setTakeawayFee] = useState('')
  const [lines, setLines] = useState<EditableLine[]>([])
  const [submitting, setSubmitting] = useState(false)

  const isOpen = order?.status === 'open'
  const isSettled = order?.status === 'settled'

  useEffect(() => {
    if (!open || !order) return
    setGuestName(order.guest_name?.trim() || '')
    setRoomNumber(order.room_number?.trim() || '')
    setTableLabel(order.table_label?.trim() || '')
    setWaiterName(order.waiter_name?.trim() || '')
    setNotes(order.notes?.trim() || '')
    setOrderType(order.order_type)
    setRoomServiceFee(numberInputValue(order.room_service_fee))
    setTakeawayFee(numberInputValue(order.takeaway_fee))
    const productLines = (order.outlet_order_lines ?? [])
      .filter((l) => !FEE_NAMES.has(String(l.item_name).trim()))
      .map((l) => ({
        item_id: l.item_id,
        item_name: l.item_name,
        qty: Number(l.qty) || 1,
        unit_price: Number(l.unit_price) || 0,
      }))
    setLines(productLines)
  }, [open, order])

  const lineTotalPreview = useMemo(
    () =>
      lines.reduce(
        (s, l) => s + Math.round((Number(l.qty) || 0) * (Number(l.unit_price) || 0) * 100) / 100,
        0,
      ),
    [lines],
  )

  const updateLine = (index: number, patch: Partial<EditableLine>) => {
    setLines((prev) => prev.map((l, i) => (i === index ? { ...l, ...patch } : l)))
  }

  const submit = async () => {
    if (!order) return
    setSubmitting(true)
    try {
      const payload: Record<string, unknown> = {
        guest_name: guestName,
        room_number: roomNumber,
        table_label: tableLabel,
        waiter_name: waiterName,
        notes,
      }
      if (isOpen) {
        payload.order_type = orderType
        payload.room_service_fee = roomServiceFee
        payload.takeaway_fee = takeawayFee
        payload.lines = lines.map((l) => ({
          item_id: l.item_id,
          item_name: l.item_name,
          qty: Number(l.qty),
          unit_price: Number(l.unit_price),
        }))
      }
      const res = await fetch(`/api/outlets/orders/${order.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', ...(await outletApiHeaders()) },
        credentials: 'include',
        body: JSON.stringify(payload),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) {
        toast.error(json.error || 'Could not save order')
        return
      }
      toast.success('Order updated')
      onSaved(json.order as OutletOrderRow)
      onOpenChange(false)
    } catch {
      toast.error('Network error')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Edit order {order?.order_number}</DialogTitle>
          <DialogDescription>
            {isSettled
              ? 'Settled orders: guest, room, table, waiter, and notes only.'
              : 'Open bill: you can adjust lines, fees, and header details.'}
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-3 text-sm">
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <Label className="text-xs">Guest / client</Label>
              <Input value={guestName} onChange={(e) => setGuestName(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Room</Label>
              <Input value={roomNumber} onChange={(e) => setRoomNumber(e.target.value)} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <Label className="text-xs">Table / label</Label>
              <Input value={tableLabel} onChange={(e) => setTableLabel(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Waiter</Label>
              <Input value={waiterName} onChange={(e) => setWaiterName(e.target.value)} />
            </div>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Notes</Label>
            <Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>

          {isOpen && (
            <>
              <div className="space-y-1">
                <Label className="text-xs">Order type</Label>
                <Select value={orderType} onValueChange={setOrderType}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {OUTLET_ORDER_TYPE_OPTIONS.map((o) => (
                      <SelectItem key={o.value} value={o.value}>
                        {o.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {(orderType === 'room_service' || orderType === 'takeaway') && (
                <div className="grid grid-cols-2 gap-2">
                  {orderType === 'room_service' && (
                    <div className="space-y-1">
                      <Label className="text-xs">Room service fee</Label>
                      <Input
                        type="number"
                        min={0}
                        step="0.01"
                        value={roomServiceFee}
                        onChange={(e) => setRoomServiceFee(e.target.value)}
                      />
                    </div>
                  )}
                  {orderType === 'takeaway' && (
                    <div className="space-y-1">
                      <Label className="text-xs">Take-away fee</Label>
                      <Input
                        type="number"
                        min={0}
                        step="0.01"
                        value={takeawayFee}
                        onChange={(e) => setTakeawayFee(e.target.value)}
                      />
                    </div>
                  )}
                </div>
              )}
              <div className="space-y-2">
                <Label className="text-xs">Line items</Label>
                <div className="border rounded-md divide-y max-h-48 overflow-y-auto">
                  {lines.map((l, i) => (
                    <div key={i} className="p-2 grid grid-cols-[1fr_64px_80px_28px] gap-1 items-center">
                      <span className="truncate text-xs font-medium" title={l.item_name}>
                        {l.item_name}
                      </span>
                      <Input
                        type="number"
                        min={0.001}
                        step="1"
                        className="h-7 text-xs"
                        value={numberInputValue(l.qty)}
                        onChange={(e) => updateLine(i, { qty: Number(e.target.value) })}
                      />
                      <Input
                        type="number"
                        min={0}
                        step="0.01"
                        className="h-7 text-xs"
                        value={numberInputValue(l.unit_price)}
                        onChange={(e) => updateLine(i, { unit_price: Number(e.target.value) })}
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        title="Increase qty"
                        onClick={() => updateLine(i, { qty: l.qty + 1 })}
                      >
                        <Plus className="h-3 w-3" />
                      </Button>
                    </div>
                  ))}
                  {lines.length === 0 && (
                    <p className="p-3 text-xs text-muted-foreground text-center">No product lines</p>
                  )}
                </div>
                <p className="text-[10px] text-muted-foreground">
                  Items subtotal preview: ₦{lineTotalPreview.toLocaleString()}
                </p>
              </div>
            </>
          )}
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="button" onClick={() => void submit()} disabled={submitting}>
            {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Save'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
