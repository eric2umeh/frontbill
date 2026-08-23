import type { SupabaseClient } from '@supabase/supabase-js'
import {
  formatPaymentAccountLabel,
  resolvePaymentAccountLabel,
} from '@/lib/payments/payment-accounts'

const CHUNK = 80

type PaymentAccountRow = {
  id: string
  bank_name: string | null
  account_number: string | null
  account_name: string | null
  label: string | null
}

type PaymentRow = {
  booking_id: string | null
  payment_account_label: string | null
  notes: string | null
  payment_account_id: string | null
}

type TransactionRow = {
  booking_id: string | null
  payment_account_label: string | null
  description: string | null
  payment_account_id: string | null
}

function labelFromStoredFields(
  row: {
    payment_account_label?: string | null
    notes?: string | null
    description?: string | null
    payment_account_id?: string | null
  },
  accountById: Record<string, PaymentAccountRow>,
): string {
  const direct = resolvePaymentAccountLabel({
    payment_account_label: row.payment_account_label,
    notes: row.notes,
    description: row.description,
  })
  if (direct) return direct
  const accId = String(row.payment_account_id || '').trim()
  if (accId && accountById[accId]) {
    return formatPaymentAccountLabel(accountById[accId])
  }
  return ''
}

async function loadPaymentAccountsById(
  supabase: SupabaseClient,
  ids: string[],
  accountById: Record<string, PaymentAccountRow>,
): Promise<void> {
  const missing = [...new Set(ids.filter((id) => id && !accountById[id]))]
  if (!missing.length) return

  for (let i = 0; i < missing.length; i += CHUNK) {
    const chunk = missing.slice(i, i + CHUNK)
    const { data } = await supabase
      .from('payment_accounts')
      .select('id, bank_name, account_number, account_name, label')
      .in('id', chunk)
    for (const row of (data ?? []) as PaymentAccountRow[]) {
      accountById[row.id] = row
    }
  }
}

/** Latest POS/transfer account label per booking from payments + transactions. */
export async function fetchPaymentAccountLabelsByBookingIds(
  supabase: SupabaseClient,
  bookingIds: string[],
): Promise<Record<string, string>> {
  const result: Record<string, string> = {}
  const uniqueIds = [...new Set(bookingIds.filter(Boolean))]
  if (!uniqueIds.length) return result

  const accountById: Record<string, PaymentAccountRow> = {}

  for (let i = 0; i < uniqueIds.length; i += CHUNK) {
    const chunk = uniqueIds.slice(i, i + CHUNK)

    const { data: payRows } = await supabase
      .from('payments')
      .select('booking_id, payment_account_label, notes, payment_account_id, payment_date')
      .in('booking_id', chunk)
      .order('payment_date', { ascending: false })

    const paymentAccountIds = (payRows ?? [])
      .map((r) => (r as PaymentRow).payment_account_id)
      .filter(Boolean) as string[]
    await loadPaymentAccountsById(supabase, paymentAccountIds, accountById)

    for (const row of (payRows ?? []) as PaymentRow[]) {
      const bid = row.booking_id
      if (!bid || result[bid]) continue
      const label = labelFromStoredFields(row, accountById)
      if (label) result[bid] = label
    }

    const needTx = chunk.filter((id) => !result[id])
    if (!needTx.length) continue

    const { data: txRows } = await supabase
      .from('transactions')
      .select('booking_id, payment_account_label, description, payment_account_id, created_at')
      .in('booking_id', needTx)
      .order('created_at', { ascending: false })

    const txAccountIds = (txRows ?? [])
      .map((r) => (r as TransactionRow).payment_account_id)
      .filter(Boolean) as string[]
    await loadPaymentAccountsById(supabase, txAccountIds, accountById)

    for (const row of (txRows ?? []) as TransactionRow[]) {
      const bid = row.booking_id
      if (!bid || result[bid]) continue
      const label = labelFromStoredFields(row, accountById)
      if (label) result[bid] = label
    }
  }

  return result
}

/** Fill payment_account_label on list rows when notes lack Account: tag. */
export async function attachPaymentAccountLabelsToBookings<
  T extends {
    id: string
    payment_account_label?: string
    notes?: string | null
  },
>(supabase: SupabaseClient, bookings: T[]): Promise<void> {
  if (!bookings.length) return

  const fromPayments = await fetchPaymentAccountLabelsByBookingIds(
    supabase,
    bookings.map((b) => b.id),
  )

  for (const booking of bookings) {
    const fromNotes = resolvePaymentAccountLabel({ notes: booking.notes })
    const merged =
      fromPayments[booking.id] ||
      fromNotes ||
      String(booking.payment_account_label || '').trim()
    if (merged) booking.payment_account_label = merged
  }
}
