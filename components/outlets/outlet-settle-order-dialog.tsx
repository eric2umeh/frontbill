'use client'

import { useEffect, useState } from 'react'
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Loader2 } from 'lucide-react'
import { formatNaira } from '@/lib/utils/currency'
import type { OutletOrderRow } from '@/lib/outlets/types'
import { OutletOrderCustomerFields } from '@/components/outlets/outlet-order-customer-fields'
import type { OutletClientOption } from '@/lib/outlets/types'
import { outletApiHeaders } from '@/lib/outlets/outlet-api-headers'
import { toast } from 'sonner'

type LedgerOption = { id: string; name: string; balance: number }

type Props = {
  order: OutletOrderRow | null
  open: boolean
  onOpenChange: (open: boolean) => void
  organizationId: string
  departmentLabel: string
  onSettled: (order: OutletOrderRow) => void
}

export function OutletSettleOrderDialog({
  order,
  open,
  onOpenChange,
  organizationId,
  departmentLabel,
  onSettled,
}: Props) {
  const [paymentMethod, setPaymentMethod] = useState('pos')
  const [guestName, setGuestName] = useState('')
  const [roomNumber, setRoomNumber] = useState('')
  const [bookingId, setBookingId] = useState('')
  const [selectedLedger, setSelectedLedger] = useState<LedgerOption | null>(null)
  const [ledgerSearch, setLedgerSearch] = useState('')
  const [ledgerResults, setLedgerResults] = useState<LedgerOption[]>([])
  const [submitting, setSubmitting] = useState(false)

  const isComplimentary = !!order?.is_complimentary

  useEffect(() => {
    if (!open || !order) return
    setPaymentMethod('pos')
    setGuestName(order.guest_name?.trim() || '')
    setRoomNumber(order.room_number?.trim() || '')
    setBookingId(order.booking_id?.trim() || '')
    setSelectedLedger(null)
    setLedgerSearch('')
    setLedgerResults([])
  }, [open, order])

  const searchLedgers = async () => {
    const term = ledgerSearch.trim()
    if (!term || !organizationId) return
    const res = await fetch(
      `/api/outlets/lookup-clients?q=${encodeURIComponent(term)}`,
      { headers: await outletApiHeaders(), credentials: 'include' },
    )
    const json = await res.json().catch(() => ({}))
    const ledgers = (json.clients ?? []).filter(
      (c: { kind: string }) => c.kind === 'ledger',
    ) as Array<{ id: string; name: string; balance?: number }>
    setLedgerResults(
      ledgers.map((l) => ({ id: l.id, name: l.name, balance: Number(l.balance) || 0 })),
    )
  }

  const handleClientSelect = (client: OutletClientOption | null) => {
    if (!client || client.kind !== 'ledger') return
    setSelectedLedger({
      id: client.id,
      name: client.name,
      balance: client.balance ?? 0,
    })
  }

  const submit = async () => {
    if (!order) return
    if (!isComplimentary && !paymentMethod) {
      toast.error('Choose a payment method')
      return
    }
    if (!isComplimentary && paymentMethod === 'city_ledger') {
      const hasRoom = roomNumber.trim().length > 0
      const hasGuest = guestName.trim().length > 0
      const hasLedger = !!selectedLedger?.id
      const hasBooking = !!bookingId.trim()
      if (!hasBooking && !hasGuest && !hasLedger && !hasRoom) {
        toast.error(
          'For charge to room: pick an in-house room, enter a guest name, or select a city ledger account',
        )
        return
      }
    }

    setSubmitting(true)
    try {
      const res = await fetch(`/api/outlets/orders/${order.id}/settle`, {
        method: 'POST',
        headers: await outletApiHeaders({ 'Content-Type': 'application/json' }),
        credentials: 'include',
        body: JSON.stringify({
          payment_method: isComplimentary ? 'complimentary' : paymentMethod,
          is_complimentary: isComplimentary,
          booking_id: bookingId.trim() || order.booking_id,
          guest_name: guestName.trim() || order.guest_name,
          room_number: roomNumber.trim() || order.room_number,
          city_ledger_account_id: selectedLedger?.id || null,
        }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) {
        toast.error(json.error || 'Could not settle order')
        return
      }
      toast.success(`Settled — ${order.order_number}`)
      onOpenChange(false)
      if (json.order) onSettled(json.order as OutletOrderRow)
    } catch {
      toast.error('Network error')
    } finally {
      setSubmitting(false)
    }
  }

  if (!order) return null

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Settle order {order.order_number}</DialogTitle>
          <DialogDescription>
            Choose how this bill is paid. Total: {formatNaira(order.subtotal)} — posts to sales
            report, transactions, and folio when charge to room.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 py-1">
          {isComplimentary ? (
            <p className="text-sm text-muted-foreground rounded-md border bg-muted/40 px-3 py-2">
              This order is complimentary — no payment will be collected.
            </p>
          ) : (
            <>
              <div className="space-y-1">
                <Label>Payment method</Label>
                <Select value={paymentMethod} onValueChange={setPaymentMethod}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select payment method" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="pos">POS</SelectItem>
                    <SelectItem value="cash">Cash</SelectItem>
                    <SelectItem value="transfer">Transfer</SelectItem>
                    <SelectItem value="city_ledger">Charge to room (city ledger)</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {paymentMethod === 'city_ledger' && (
                <div className="space-y-2 rounded-lg border bg-muted/30 p-3">
                  <p className="text-xs text-muted-foreground">
                    Posts to city ledger as <strong>{departmentLabel}</strong> on folio and
                    transactions.
                  </p>
                  <OutletOrderCustomerFields
                    organizationId={organizationId}
                    guestName={guestName}
                    onGuestNameChange={setGuestName}
                    onClientSelect={handleClientSelect}
                    roomNumber={roomNumber}
                    onRoomNumberChange={setRoomNumber}
                    onRoomBookingLink={({ bookingId: bid, guestName: gn }) => {
                      setBookingId(bid ?? '')
                      if (gn) setGuestName(gn)
                    }}
                    selectedLedger={selectedLedger}
                    onLedgerSelect={setSelectedLedger}
                  />
                  <div className="space-y-1">
                    <Label className="text-xs">Or search ledger account</Label>
                    <div className="flex gap-1">
                      <Input
                        value={ledgerSearch}
                        onChange={(e) => setLedgerSearch(e.target.value)}
                        placeholder="Account name…"
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') void searchLedgers()
                        }}
                      />
                      <Button type="button" variant="outline" size="sm" onClick={() => void searchLedgers()}>
                        Search
                      </Button>
                    </div>
                    {ledgerResults.length > 0 && !selectedLedger && (
                      <ul className="border rounded-md bg-background max-h-24 overflow-y-auto text-xs">
                        {ledgerResults.map((a) => (
                          <li key={a.id}>
                            <button
                              type="button"
                              className="w-full text-left px-2 py-1.5 hover:bg-muted"
                              onClick={() => {
                                setSelectedLedger(a)
                                setGuestName(a.name)
                                setLedgerResults([])
                              }}
                            >
                              {a.name}
                            </button>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
            Cancel
          </Button>
          <Button type="button" onClick={() => void submit()} disabled={submitting}>
            {submitting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
            Settle &amp; record payment
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
