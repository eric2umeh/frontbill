import { resolvePaymentAccountLabel, normalizePaymentMethodKey } from '@/lib/payments/payment-accounts'

export type BookingNotesMeta = {
  payment_method: string
  ledger_account_name: string
  payment_account_label: string
  /** Compact last reschedule range, e.g. "20 Aug → 23 Aug". */
  last_reschedule: string | null
}

/** Parse payment method, ledger, POS account, and last reschedule from booking/reservation notes. */
export function parseBookingNotesMeta(notes?: string | null): BookingNotesMeta {
  const raw = String(notes || '').trim()
  let payment_method = 'cash'
  let ledger_account_name = ''

  if (raw) {
    if (/^city_ledger:/i.test(raw)) {
      payment_method = 'city_ledger'
      ledger_account_name = raw
        .replace(/^city_ledger:\s*/i, '')
        .split('\n')[0]
        .split('|')[0]
        .trim()
    } else if (raw.startsWith('City Ledger:')) {
      payment_method = 'city_ledger'
      ledger_account_name = raw
        .replace(/^City Ledger:\s*/, '')
        .split('\n')[0]
        .split('|')[0]
        .trim()
    } else {
      const pmMatch = raw.match(/payment_method:\s*([^\s|\n]+)/i)
      if (pmMatch) payment_method = pmMatch[1].trim().toLowerCase()
      const ledgerMatch = raw.match(/\|ledger:([^|\n]+)/i)
      if (ledgerMatch) ledger_account_name = ledgerMatch[1].trim()
    }
  }

  return {
    payment_method,
    ledger_account_name,
    payment_account_label: resolvePaymentAccountLabel({ notes: raw }),
    last_reschedule: formatLastRescheduleFromNotes(raw),
  }
}

/** Most recent stay reschedule as a short date range (ignores older history in notes). */
export function formatLastRescheduleFromNotes(notes: string): string | null {
  const lines = notes.split('\n').filter((line) => /stay rescheduled/i.test(line))
  if (!lines.length) return null

  const last = lines[lines.length - 1]
  const match = last.match(
    /stay rescheduled\s+(\d{4}-\d{2}-\d{2})[^\d→]*→\s*(\d{4}-\d{2}-\d{2})/i,
  )
  if (!match) return null

  const fmt = (ymd: string) => {
    const dt = new Date(`${ymd}T12:00:00`)
    return dt.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })
  }

  return `${fmt(match[1])} → ${fmt(match[2])}`
}

/** Most recent adjustment date from a stay reschedule note line. */
export function parseLastAdjustmentDateFromNotes(notes?: string | null): string | null {
  const raw = String(notes || '').trim()
  if (!raw) return null
  const lines = raw.split('\n').filter((line) => /stay rescheduled/i.test(line))
  if (!lines.length) return null
  const last = lines[lines.length - 1]
  const match = last.match(/\(adjustment date:\s*(\d{4}-\d{2}-\d{2})\)/i)
  return match ? match[1] : null
}

export function formatBookingPaymentMethodLabel(method: string | null | undefined): string {
  const m = normalizePaymentMethodKey(method)
  if (m === 'pos' || m === 'card') return 'POS'
  if (m === 'bank_transfer' || m === 'transfer') return 'Transfer'
  if (m === 'city_ledger') return 'City ledger'
  if (m === 'cash') return 'Cash'
  if (m === 'pending') return 'Pending'
  if (!m) return 'Cash'
  return m.replace(/_/g, ' ')
}

/** Amount collected toward the folio (total minus outstanding balance). */
export function bookingAmountPaid(totalAmount: unknown, balance: unknown): number {
  const total = Math.max(0, Number(totalAmount ?? 0))
  const owed = Math.max(0, Number(balance ?? 0))
  return Math.max(0, total - owed)
}
