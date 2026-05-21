'use client'

import { useCallback, useEffect, useState } from 'react'
import { Receipt } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  PaymentReceiptDialog,
  type PaymentReceiptChargeRow,
} from '@/components/receipts/payment-receipt-dialog'
import type { PaymentReceiptBranding } from '@/lib/receipts/receipt-format'
import { canPrintPaymentReceipt } from '@/lib/receipts/can-print-payment-receipt'
import type { HotelEventRow } from '@/lib/events/types'

export function eventEligibleForPaymentReceipt(ev: HotelEventRow): boolean {
  const paid = Number(ev.amount_paid) || 0
  if (paid > 0) return true
  const st = String(ev.payment_status || '').toLowerCase()
  return st === 'paid' || st === 'partial'
}

type Props = {
  event: HotelEventRow
  role: string | null | undefined
  userId: string | null | undefined
  userName: string | null | undefined
  size?: 'sm' | 'default'
  variant?: 'secondary' | 'outline' | 'ghost'
}

export function EventPaymentReceiptButton({
  event,
  role,
  userId,
  userName,
  size = 'sm',
  variant = 'secondary',
}: Props) {
  const canPrint = canPrintPaymentReceipt(role)
  const [open, setOpen] = useState(false)
  const [receiptOrg, setReceiptOrg] = useState<PaymentReceiptBranding | null>(null)
  const [charge, setCharge] = useState<PaymentReceiptChargeRow | null>(null)

  const loadBranding = useCallback(async () => {
    if (!userId || !event.organization_id) return
    try {
      const res = await fetch(
        `/api/events/${encodeURIComponent(event.id)}/receipt-branding?caller_id=${encodeURIComponent(userId)}`,
        { credentials: 'include' },
      )
      if (res.ok) {
        const j = await res.json()
        setReceiptOrg({
          hotelName: String(j.hotelName ?? '').trim(),
          address: String(j.address ?? ''),
          phone: String(j.phone ?? ''),
          email: String(j.email ?? ''),
        })
      }
    } catch {
      /* ignore */
    }
  }, [event.id, event.organization_id, userId])

  useEffect(() => {
    if (open) void loadBranding()
  }, [open, loadBranding])

  if (!canPrint || !eventEligibleForPaymentReceipt(event)) return null

  const amount = Math.max(0, Number(event.amount_paid) || 0)
  const shortId = event.id.replace(/-/g, '').slice(0, 8).toUpperCase()

  return (
    <>
      <Button
        type="button"
        size={size}
        variant={variant}
        className="shrink-0"
        onClick={() => {
          setCharge({
            id: event.id,
            timestamp: event.updated_at || event.created_at,
            description: `Event — ${event.title}`,
            amount: -amount,
            type: 'payment',
            createdBy: userName || 'Staff',
            paymentMethod: event.payment_method,
          })
          setOpen(true)
        }}
      >
        <Receipt className="h-4 w-4 mr-1.5" />
        Receipt
      </Button>
      <PaymentReceiptDialog
        open={open}
        onOpenChange={(v) => {
          setOpen(v)
          if (!v) setCharge(null)
        }}
        organization={receiptOrg}
        booking={{
          folio_id: `EVT-${shortId}`,
          guestName: event.client_name,
          guests: event.client_name ? { name: event.client_name } : null,
          rooms: event.venue ? { room_number: event.venue } : null,
        }}
        charge={charge}
        currentUserName={userName}
      />
    </>
  )
}
