'use client'

import { useCallback, useEffect, useState } from 'react'
import { Receipt } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { createClient } from '@/lib/supabase/client'
import { formatNaira } from '@/lib/utils/currency'
import {
  PaymentReceiptDialog,
  type PaymentReceiptChargeRow,
} from '@/components/receipts/payment-receipt-dialog'
import type { PaymentReceiptBranding } from '@/lib/receipts/receipt-format'
import { canPrintPaymentReceipt } from '@/lib/receipts/can-print-payment-receipt'
import {
  buildFolioContextLinesForReceipt,
  filterPaymentLedgerTransactions,
  folioRowEligibleForPaymentReceipt,
  transactionToReceiptChargeRow,
  type PaymentLedgerReceiptRow,
} from '@/lib/receipts/booking-receipt-utils'
import { fetchUserDisplayNameMap } from '@/lib/utils/fetch-user-display-names'
import { getUserDisplayName } from '@/lib/utils/user-display'

type FolioChargeRow = {
  id: string
  timestamp: string
  description: string
  amount: number
  type: string
  createdBy: string
  paymentStatus: string
  paymentMethod: string | null
}

type Props = {
  bookingId: string
  folioId?: string | null
  guestName?: string | null
  roomNumber?: string | null
  role: string | null | undefined
  userId: string | null | undefined
  userName: string | null | undefined
  organizationId?: string | null
  /** Compact: only ledger list; full: folio line receipt buttons too */
  variant?: 'compact' | 'full'
}

export function BookingPaymentReceiptPanel({
  bookingId,
  folioId,
  guestName,
  roomNumber,
  role,
  userId,
  userName,
  organizationId,
  variant = 'full',
}: Props) {
  const canPrint = canPrintPaymentReceipt(role)
  const [folioCharges, setFolioCharges] = useState<FolioChargeRow[]>([])
  const [paymentLedgerRows, setPaymentLedgerRows] = useState<PaymentLedgerReceiptRow[]>([])
  const [receiptOrg, setReceiptOrg] = useState<PaymentReceiptBranding | null>(null)
  const [receiptCharge, setReceiptCharge] = useState<PaymentReceiptChargeRow | null>(null)
  const [receiptFolioContextLines, setReceiptFolioContextLines] = useState<string[] | null>(null)
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    if (!bookingId || !canPrint) {
      setLoading(false)
      return
    }
    setLoading(true)
    try {
      const supabase = createClient()
      if (!supabase) return

      if (userId && userId !== 'placeholder') {
        try {
          const rb = await fetch(
            `/api/bookings/${encodeURIComponent(bookingId)}/receipt-branding?caller_id=${encodeURIComponent(userId)}`,
            { credentials: 'include' },
          )
          if (rb.ok) {
            const j = await rb.json()
            setReceiptOrg({
              hotelName: String(j.hotelName ?? '').trim(),
              address: String(j.address ?? ''),
              phone: String(j.phone ?? ''),
              email: String(j.email ?? ''),
            })
          }
        } catch {
          /* optional */
        }
      }

      if (variant === 'full') {
        const { data: chargesData } = await supabase
          .from('folio_charges')
          .select('*')
          .eq('booking_id', bookingId)
          .order('created_at', { ascending: true })

        const chargeCreatorIds = (chargesData || [])
          .map((c: { created_by?: string }) => c.created_by)
          .filter(Boolean)
        const chargeCreatorMap = await fetchUserDisplayNameMap(chargeCreatorIds, userId)

        setFolioCharges(
          (chargesData || []).map((charge: Record<string, unknown>) => ({
            id: String(charge.id),
            timestamp: String(charge.created_at),
            description: String(charge.description || ''),
            amount: Number(charge.amount) || 0,
            type: String(charge.charge_type || ''),
            createdBy: charge.created_by
              ? chargeCreatorMap[String(charge.created_by)] ||
                getUserDisplayName(null, String(charge.created_by))
              : 'System',
            paymentStatus: String(charge.payment_status || ''),
            paymentMethod: charge.payment_method ? String(charge.payment_method) : null,
          })),
        )
      }

      const [{ data: txRows }, { data: payRows }] = await Promise.all([
        supabase
          .from('transactions')
          .select(
            'id, created_at, amount, payment_method, description, received_by, transaction_id, status',
          )
          .eq('booking_id', bookingId)
          .order('created_at', { ascending: false }),
        supabase
          .from('payments')
          .select('id, payment_date, amount, payment_method, notes, received_by')
          .eq('booking_id', bookingId)
          .order('payment_date', { ascending: false }),
      ])

      const payLedgerRaw = filterPaymentLedgerTransactions(txRows || [])
      const outletTxIds = new Set(
        payLedgerRaw
          .filter((t) => String(t.transaction_id || '').startsWith('OUT-'))
          .map((t) => String(t.transaction_id || '').replace(/^OUT-/i, '')),
      )
      const receiverIds = [
        ...new Set(
          payLedgerRaw
            .map((t: { received_by?: string | null }) => t.received_by)
            .filter(Boolean),
        ),
      ] as string[]
      const receiverMap =
        receiverIds.length > 0 ? await fetchUserDisplayNameMap(receiverIds, userId) : {}

      const fromTx = payLedgerRaw.map((t: Record<string, unknown>) => ({
        id: String(t.id),
        created_at: String(t.created_at),
        amount: Number(t.amount) || 0,
        payment_method: t.payment_method ? String(t.payment_method) : null,
        description: t.description ? String(t.description) : null,
        transaction_id: t.transaction_id ? String(t.transaction_id) : null,
        receivedByLabel: t.received_by
          ? receiverMap[String(t.received_by)] || getUserDisplayName(null, String(t.received_by))
          : 'Staff',
      }))

      const fromPayments = (payRows || [])
        .filter((p: { notes?: string | null }) => {
          const notes = String(p.notes || '')
          const m = notes.match(/\s([A-Z]{2,}-\d+)\s—/)
          if (m && outletTxIds.has(m[1])) return false
          return true
        })
        .map((p: Record<string, unknown>) => ({
          id: `pay-${String(p.id)}`,
          created_at: String(p.payment_date),
          amount: Number(p.amount) || 0,
          payment_method: p.payment_method ? String(p.payment_method) : null,
          description: p.notes ? String(p.notes) : null,
          transaction_id: null,
          receivedByLabel: p.received_by
            ? receiverMap[String(p.received_by)] || getUserDisplayName(null, String(p.received_by))
            : 'Staff',
        }))

      setPaymentLedgerRows(
        [...fromTx, ...fromPayments].sort(
          (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
        ),
      )
    } finally {
      setLoading(false)
    }
  }, [bookingId, canPrint, userId, variant])

  useEffect(() => {
    void load()
  }, [load])

  if (!canPrint) return null
  if (loading && paymentLedgerRows.length === 0 && folioCharges.length === 0) {
    return null
  }

  const bookingLike = {
    folio_id: folioId,
    guestName,
    guests: guestName ? { name: guestName } : null,
    rooms: roomNumber ? { room_number: roomNumber } : null,
  }

  const hasLedger = paymentLedgerRows.length > 0
  const hasFolioReceipts =
    variant === 'full' &&
    folioCharges.some((c) => folioRowEligibleForPaymentReceipt(c))

  if (!hasLedger && !hasFolioReceipts) return null

  return (
    <>
      {hasLedger && (
        <div className="space-y-2 pt-1">
          <div className="text-sm font-medium">Print payment receipts</div>
          <p className="text-xs text-muted-foreground">
            Generate a receipt for each payment recorded on this {variant === 'compact' ? 'reservation' : 'folio'}.
          </p>
          <div className="space-y-2">
            {paymentLedgerRows.map((tx) => (
              <div
                key={tx.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-md border bg-muted/30 px-3 py-2"
              >
                <div className="min-w-0 text-sm">
                  <div className="font-semibold">{formatNaira(Math.abs(Number(tx.amount)))}</div>
                  <div className="text-xs text-muted-foreground">
                    {new Date(tx.created_at).toLocaleString('en-GB')} ·{' '}
                    {String(tx.payment_method || '—').replace(/_/g, ' ')}
                  </div>
                  {tx.description && (
                    <div
                      className="text-xs text-muted-foreground truncate max-w-[220px] md:max-w-none"
                      title={tx.description}
                    >
                      {tx.description}
                    </div>
                  )}
                </div>
                <Button
                  size="sm"
                  variant="secondary"
                  className="shrink-0"
                  type="button"
                  onClick={() => {
                    setReceiptFolioContextLines(
                      variant === 'full' ? buildFolioContextLinesForReceipt(folioCharges) : null,
                    )
                    setReceiptCharge(transactionToReceiptChargeRow(tx))
                  }}
                >
                  <Receipt className="h-4 w-4 mr-1.5" />
                  Receipt
                </Button>
              </div>
            ))}
          </div>
        </div>
      )}

      {variant === 'full' && hasFolioReceipts && (
        <p className="text-xs text-muted-foreground">
          You can also use Receipt on individual paid lines in the folio list above.
        </p>
      )}

      <PaymentReceiptDialog
        open={!!receiptCharge}
        onOpenChange={(open) => {
          if (!open) {
            setReceiptCharge(null)
            setReceiptFolioContextLines(null)
          }
        }}
        organization={receiptOrg}
        booking={bookingLike}
        charge={receiptCharge}
        currentUserName={userName}
        folioContextLines={receiptFolioContextLines}
      />
    </>
  )
}
