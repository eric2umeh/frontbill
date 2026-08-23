import type { SupabaseClient } from '@supabase/supabase-js'
import { attachPaymentAccountLabelsToBookings } from '@/lib/booking/fetch-booking-payment-accounts'
import {
  folioGuestCreditAmount,
  folioPositiveOutstandingSum,
  shouldReconcileBookingPaymentPaid,
} from '@/lib/utils/booking-bill-balance'

const FOLIO_BOOKING_ID_CHUNK = 80

type FolioChargeRow = {
  amount?: unknown
  type?: string | null
  charge_type?: string | null
  payment_status?: string | null
  payment_method?: string | null
}

export type BookingListRow = {
  id: string
  total_amount?: number
  deposit?: number
  balance?: number
  payment_status?: string
  folio_credit?: number
  guestName?: string
  guests?: { name?: string | null } | null
  check_in?: string
  _db_balance?: number
}

async function fetchFolioChargesByBookingIds(
  supabase: SupabaseClient,
  bookingIds: string[],
): Promise<Record<string, FolioChargeRow[]>> {
  const chargesByBooking: Record<string, FolioChargeRow[]> = {}
  if (!bookingIds.length) return chargesByBooking

  for (let i = 0; i < bookingIds.length; i += FOLIO_BOOKING_ID_CHUNK) {
    const chunk = bookingIds.slice(i, i + FOLIO_BOOKING_ID_CHUNK)
    const { data, error } = await supabase
      .from('folio_charges')
      .select('booking_id, amount, payment_status, charge_type, payment_method')
      .in('booking_id', chunk)
    if (error) throw error
    for (const c of data ?? []) {
      const id = (c as { booking_id: string }).booking_id
      if (!chargesByBooking[id]) chargesByBooking[id] = []
      chargesByBooking[id].push({
        amount: (c as { amount?: unknown }).amount,
        type: (c as { charge_type?: string | null }).charge_type,
        charge_type: (c as { charge_type?: string | null }).charge_type,
        payment_status: (c as { payment_status?: string | null }).payment_status,
        payment_method: (c as { payment_method?: string | null }).payment_method,
      })
    }
  }
  return chargesByBooking
}

async function attachGuestLedgerCreditToBookings(
  supabase: SupabaseClient,
  organizationId: string,
  bookings: BookingListRow[],
): Promise<void> {
  if (!bookings.length || !organizationId) return

  const { data: creditRows } = await supabase
    .from('city_ledger_accounts')
    .select('account_name, balance')
    .eq('organization_id', organizationId)
    .in('account_type', ['individual', 'guest'])
    .lt('balance', -0.005)
    .limit(500)

  if (!creditRows?.length) return

  const creditByName = new Map<string, number>()
  for (const row of creditRows) {
    const key = String(row.account_name || '')
      .trim()
      .toLowerCase()
    if (!key) continue
    const amt = Math.abs(Number(row.balance || 0))
    creditByName.set(key, Math.max(creditByName.get(key) || 0, amt))
  }

  for (const [nameKey, creditAmt] of creditByName) {
    const guestBookings = bookings.filter((b) => {
      const n = String(b.guestName || b.guests?.name || '')
        .trim()
        .toLowerCase()
      return n === nameKey
    })
    if (!guestBookings.length) continue

    const folioCreditSum = guestBookings.reduce(
      (s, b) => s + Math.max(0, Number(b.folio_credit || 0)),
      0,
    )
    if (folioCreditSum >= creditAmt - 0.5) continue

    const target = [...guestBookings].sort((a, b) =>
      String(b.check_in || '').localeCompare(String(a.check_in || '')),
    )[0]
    if (Number(target.balance || 0) > 0.005) continue

    target.folio_credit = Math.max(Number(target.folio_credit || 0), creditAmt)
  }
}

/**
 * Folio balance, guest credit, POS account labels, and payment_status heal.
 * Call after the list is painted for faster first load (deferred enrichment).
 */
export async function enrichBookingsList(
  supabase: SupabaseClient,
  organizationId: string,
  bookings: BookingListRow[],
): Promise<void> {
  const bookingIds = bookings.map((b) => b.id)
  if (!bookingIds.length) return

  for (const b of bookings) {
    if (b._db_balance === undefined) {
      b._db_balance = Number(b.balance ?? 0)
    }
  }

  const chargesByBooking = await fetchFolioChargesByBookingIds(supabase, bookingIds)

  bookings.forEach((b) => {
    const ch = chargesByBooking[b.id] ?? []
    b.balance = folioPositiveOutstandingSum(ch)
    b.folio_credit = folioGuestCreditAmount(ch)
  })

  await attachGuestLedgerCreditToBookings(supabase, organizationId, bookings)
  await attachPaymentAccountLabelsToBookings(supabase, bookings)

  const healIds = bookings
    .filter((b) =>
      shouldReconcileBookingPaymentPaid(
        {
          total_amount: b.total_amount,
          deposit: b.deposit,
          balance: b._db_balance,
          payment_status: b.payment_status,
        },
        chargesByBooking[b.id] ?? [],
      ),
    )
    .map((b) => b.id)

  if (healIds.length > 0) {
    bookings.forEach((b) => {
      if (healIds.includes(b.id)) b.payment_status = 'paid'
    })
    void Promise.all(
      healIds.map((id) =>
        supabase.from('bookings').update({ payment_status: 'paid' }).eq('id', id),
      ),
    )
  }

  bookings.forEach((b) => {
    delete b._db_balance
  })
}
