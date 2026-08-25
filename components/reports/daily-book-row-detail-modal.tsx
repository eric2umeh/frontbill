'use client'

import { useEffect, useState } from 'react'
import { format } from 'date-fns'
import { createClient } from '@/lib/supabase/client'
import { formatNaira } from '@/lib/utils/currency'
import {
  formatBookingPaymentMethodLabel,
  bookingAmountPaid,
} from '@/lib/booking/parse-booking-notes'
import {
  SALES_COLLECTION_LABELS,
  type DailyCollectionLine,
  type DailyGuestRow,
} from '@/lib/reports/daily-front-desk-pack'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Badge } from '@/components/ui/badge'
import { Loader2 } from 'lucide-react'

export type DailyBookDetailTarget =
  | { kind: 'guest'; guest: DailyGuestRow }
  | { kind: 'line'; line: DailyCollectionLine }

type PaymentHistoryRow = {
  id: string
  amount: number
  payment_method: string
  payment_date: string
  notes: string
  reference: string
  account_label: string
}

function formatWhen(iso: string | null | undefined): string {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return String(iso).slice(0, 16)
  return format(d, 'dd MMM yyyy HH:mm')
}

export function DailyBookRowDetailModal({
  open,
  onOpenChange,
  target,
  organizationId,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  target: DailyBookDetailTarget | null
  organizationId?: string | null
}) {
  const [loading, setLoading] = useState(false)
  const [history, setHistory] = useState<PaymentHistoryRow[]>([])
  const [guestExtra, setGuestExtra] = useState<DailyGuestRow | null>(null)

  const bookingId =
    target?.kind === 'guest'
      ? target.guest.booking_id
      : target?.kind === 'line'
        ? target.line.booking_id
        : null

  useEffect(() => {
    if (!open || !bookingId) {
      setHistory([])
      setGuestExtra(null)
      return
    }
    let cancelled = false
    ;(async () => {
      setLoading(true)
      try {
        const supabase = createClient()
        if (!supabase) return

        let payQ = supabase
          .from('payments')
          .select(
            'id, amount, payment_method, payment_date, notes, reference_number, payment_account_label',
          )
          .eq('booking_id', bookingId)
          .order('payment_date', { ascending: false })
          .limit(50)
        if (organizationId) payQ = payQ.eq('organization_id', organizationId)

        let txQ = supabase
          .from('transactions')
          .select(
            'id, amount, payment_method, created_at, description, transaction_id, payment_account_label, status',
          )
          .eq('booking_id', bookingId)
          .order('created_at', { ascending: false })
          .limit(50)
        if (organizationId) txQ = txQ.eq('organization_id', organizationId)

        const [payRes, txRes, bookRes] = await Promise.all([
          payQ,
          txQ,
          target?.kind === 'line'
            ? supabase
                .from('bookings')
                .select(
                  'id, check_in, check_out, status, rate_per_night, total_amount, deposit, balance, folio_id, payment_status, payment_method, ledger_account_name, notes, guest_id, guests:guest_id(name), rooms:room_id(room_number, room_type)',
                )
                .eq('id', bookingId)
                .maybeSingle()
            : Promise.resolve({ data: null, error: null }),
        ])

        if (cancelled) return

        const rows: PaymentHistoryRow[] = []
        for (const p of payRes.data || []) {
          rows.push({
            id: `p-${(p as { id: string }).id}`,
            amount: Number((p as { amount: unknown }).amount) || 0,
            payment_method: String((p as { payment_method?: string }).payment_method || ''),
            payment_date: String((p as { payment_date?: string }).payment_date || ''),
            notes: String((p as { notes?: string }).notes || ''),
            reference: String((p as { reference_number?: string }).reference_number || ''),
            account_label: String(
              (p as { payment_account_label?: string }).payment_account_label || '',
            ),
          })
        }
        for (const t of txRes.data || []) {
          const st = String((t as { status?: string }).status || '').toLowerCase()
          if (st === 'void' || st === 'cancelled') continue
          rows.push({
            id: `t-${(t as { id: string }).id}`,
            amount: Number((t as { amount: unknown }).amount) || 0,
            payment_method: String((t as { payment_method?: string }).payment_method || ''),
            payment_date: String((t as { created_at?: string }).created_at || ''),
            notes: String((t as { description?: string }).description || ''),
            reference: String((t as { transaction_id?: string }).transaction_id || ''),
            account_label: String(
              (t as { payment_account_label?: string }).payment_account_label || '',
            ),
          })
        }
        rows.sort(
          (a, b) => new Date(b.payment_date).getTime() - new Date(a.payment_date).getTime(),
        )
        setHistory(rows)

        if (bookRes.data && target?.kind === 'line') {
          const b = bookRes.data as Record<string, unknown>
          const guests = b.guests as { name?: string } | null
          const rooms = b.rooms as { room_number?: string; room_type?: string } | null
          setGuestExtra({
            booking_id: String(b.id),
            guest_id: b.guest_id ? String(b.guest_id) : null,
            guest_name: guests?.name || target.line.guest_name,
            room_number: rooms?.room_number || target.line.room || '—',
            room_type: rooms?.room_type || '—',
            rate_per_night: Number(b.rate_per_night) || 0,
            total_amount: Number(b.total_amount) || 0,
            deposit: Number(b.deposit) || 0,
            balance: Number(b.balance) || 0,
            check_in: String(b.check_in || '').slice(0, 10),
            check_out: String(b.check_out || '').slice(0, 10),
            folio_id: String(b.folio_id || '—'),
            payment_status: String(b.payment_status || '—'),
            payment_method: String(b.payment_method || target.line.payment_method),
            payment_account_label: target.line.payment_account_label,
            ledger_account_name: String(b.ledger_account_name || ''),
            status: String(b.status || ''),
            is_city_ledger: String(b.payment_method || '').toLowerCase() === 'city_ledger',
          })
        } else {
          setGuestExtra(null)
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [open, bookingId, organizationId, target])

  const guest: DailyGuestRow | null =
    target?.kind === 'guest' ? target.guest : guestExtra

  const line = target?.kind === 'line' ? target.line : null

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {guest?.guest_name || line?.guest_name || 'Details'}
          </DialogTitle>
          <DialogDescription>
            Stay, balances, and payment history for this daily book row.
          </DialogDescription>
        </DialogHeader>

        {loading && !guest && !line ? (
          <div className="flex justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="space-y-4 text-sm">
            {guest ? (
              <div className="grid grid-cols-2 gap-3 rounded-md border p-3">
                <div>
                  <p className="text-xs text-muted-foreground">Guest / org</p>
                  <p className="font-medium">{guest.guest_name}</p>
                  {guest.ledger_account_name ? (
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {guest.ledger_account_name}
                    </p>
                  ) : null}
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Room</p>
                  <p className="font-medium">
                    {guest.room_number} · {guest.room_type}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Stay</p>
                  <p className="font-medium">
                    {guest.check_in} → {guest.check_out}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Folio</p>
                  <p className="font-medium tabular-nums">{guest.folio_id}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Rate / night</p>
                  <p className="font-medium">{formatNaira(guest.rate_per_night)}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Total</p>
                  <p className="font-medium">{formatNaira(guest.total_amount)}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Paid</p>
                  <p className="font-medium">
                    {formatNaira(bookingAmountPaid(guest.total_amount, guest.balance))}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Balance</p>
                  <p className="font-medium text-amber-700">
                    {formatNaira(guest.balance)}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Payment</p>
                  <Badge variant="outline" className="capitalize mt-0.5">
                    {guest.payment_status}
                  </Badge>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Method</p>
                  <p className="font-medium">
                    {formatBookingPaymentMethodLabel(guest.payment_method)}
                  </p>
                  {guest.payment_account_label ? (
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {guest.payment_account_label}
                    </p>
                  ) : null}
                </div>
              </div>
            ) : null}

            {line ? (
              <div className="rounded-md border p-3 space-y-2">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                  Collection line
                </p>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <p className="text-xs text-muted-foreground">Amount</p>
                    <p className="font-semibold">{formatNaira(line.amount)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">When</p>
                    <p className="font-medium">{formatWhen(line.at)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Method</p>
                    <p className="font-medium">
                      {formatBookingPaymentMethodLabel(line.payment_method)}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Category</p>
                    <Badge variant="secondary">{SALES_COLLECTION_LABELS[line.category]}</Badge>
                  </div>
                </div>
                {line.description ? (
                  <div>
                    <p className="text-xs text-muted-foreground">Description</p>
                    <p>{line.description}</p>
                  </div>
                ) : null}
                {line.reference ? (
                  <div>
                    <p className="text-xs text-muted-foreground">Reference</p>
                    <p className="tabular-nums text-xs">{line.reference}</p>
                  </div>
                ) : null}
              </div>
            ) : null}

            <div>
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                  Payment history
                </p>
                {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
              </div>
              {!bookingId ? (
                <p className="text-muted-foreground text-xs">No linked booking for this line.</p>
              ) : history.length === 0 && !loading ? (
                <p className="text-muted-foreground text-xs">No payments recorded on this folio.</p>
              ) : (
                <ul className="space-y-2">
                  {history.map((h) => (
                    <li
                      key={h.id}
                      className="flex items-start justify-between gap-3 rounded-md border px-3 py-2"
                    >
                      <div className="min-w-0">
                        <p className="font-medium">
                          {formatBookingPaymentMethodLabel(h.payment_method)}
                          {h.account_label ? (
                            <span className="text-muted-foreground font-normal">
                              {' '}
                              · {h.account_label}
                            </span>
                          ) : null}
                        </p>
                        <p className="text-xs text-muted-foreground">{formatWhen(h.payment_date)}</p>
                        {h.notes ? (
                          <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">
                            {h.notes}
                          </p>
                        ) : null}
                      </div>
                      <p className="font-semibold tabular-nums shrink-0">
                        {formatNaira(h.amount)}
                      </p>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
