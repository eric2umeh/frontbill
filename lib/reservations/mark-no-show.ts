import type { SupabaseClient } from '@supabase/supabase-js'
import { insertFolioCharges } from '@/lib/utils/insert-folio-charges'
import { folioPositiveOutstandingSum } from '@/lib/utils/booking-bill-balance'
import {
  calculateNoShowFee,
  fetchNoShowPolicy,
} from '@/lib/reservations/no-show-policy'
import { stayChargeIdsToSupersedeOnNoShow } from '@/lib/reservations/no-show-folio'

const NO_SHOW_ELIGIBLE_STATUSES = ['reserved', 'confirmed']

export function isNoShowEligibleStatus(status: unknown): boolean {
  return NO_SHOW_ELIGIBLE_STATUSES.includes(String(status || '').toLowerCase())
}

export type MarkNoShowInput = {
  bookingId: string
  organizationId: string
  userId?: string | null
  /** Optional manual fee override (hotel staff). */
  feeOverride?: number | null
  notes?: string | null
}

export type MarkNoShowResult = {
  feeAmount: number
  bookingId: string
}

export async function markBookingNoShow(
  supabase: SupabaseClient,
  input: MarkNoShowInput,
): Promise<{ data: MarkNoShowResult | null; error: string | null }> {
  const { data: booking, error: fetchErr } = await supabase
    .from('bookings')
    .select(
      'id, status, room_id, guest_id, folio_id, organization_id, rate_per_night, total_amount, check_in, check_out, number_of_nights, balance, deposit, folio_status',
    )
    .eq('id', input.bookingId)
    .eq('organization_id', input.organizationId)
    .maybeSingle()

  if (fetchErr) return { data: null, error: fetchErr.message }
  if (!booking) return { data: null, error: 'Booking not found' }
  if (!isNoShowEligibleStatus(booking.status)) {
    return {
      data: null,
      error: 'Only reserved or confirmed bookings can be marked as no-show',
    }
  }

  const policy = await fetchNoShowPolicy(supabase, input.organizationId)
  const feeAmount = calculateNoShowFee(policy, booking, input.feeOverride)

  const { data: existingFee } = await supabase
    .from('folio_charges')
    .select('id')
    .eq('booking_id', input.bookingId)
    .eq('charge_type', 'no_show_fee')
    .limit(1)

  if (existingFee?.length) {
    return { data: null, error: 'No-show fee already posted for this booking' }
  }

  const now = new Date().toISOString()
  const { data: updated, error: upErr } = await supabase
    .from('bookings')
    .update({
      status: 'no_show',
      no_show_at: now,
      no_show_fee_amount: feeAmount,
      folio_status: 'active',
      updated_at: now,
    })
    .eq('id', input.bookingId)
    .in('status', NO_SHOW_ELIGIBLE_STATUSES)
    .select('id')
    .maybeSingle()

  if (upErr) return { data: null, error: upErr.message }
  if (!updated) return { data: null, error: 'Booking is no longer eligible for no-show' }

  if (booking.room_id) {
    await supabase
      .from('rooms')
      .update({ status: 'available', updated_at: now })
      .eq('id', booking.room_id)
      .in('status', ['reserved', 'occupied'])
  }

  const { data: existingCharges, error: fcReadErr } = await supabase
    .from('folio_charges')
    .select('id, amount, charge_type, payment_status, payment_method, description')
    .eq('booking_id', input.bookingId)

  if (fcReadErr) return { data: null, error: fcReadErr.message }

  const supersedeIds = stayChargeIdsToSupersedeOnNoShow(existingCharges || [])
  if (supersedeIds.length) {
    const { error: voidErr } = await supabase
      .from('folio_charges')
      .update({ payment_status: 'voided' })
      .in('id', supersedeIds)
      .eq('booking_id', input.bookingId)

    if (voidErr) return { data: null, error: voidErr.message }
  }

  if (feeAmount > 0) {
    const chargeRow: Record<string, unknown> = {
      booking_id: input.bookingId,
      description:
        input.notes?.trim() ||
        `No-show charge (${policy.feeMode === 'percent' ? `${policy.feePercent}%` : 'policy rate'})`,
      amount: feeAmount,
      charge_type: 'no_show_fee',
      payment_status: 'pending',
    }
    if (input.organizationId) chargeRow.organization_id = input.organizationId
    if (input.userId) chargeRow.created_by = input.userId

    const { error: fcErr } = await insertFolioCharges(supabase, [chargeRow])
    if (fcErr) return { data: null, error: fcErr.message }
  }

  const { data: fcRows, error: fcFinalErr } = await supabase
    .from('folio_charges')
    .select('amount, charge_type, payment_status, payment_method')
    .eq('booking_id', input.bookingId)

  if (fcFinalErr) return { data: null, error: fcFinalErr.message }

  const billBalance = folioPositiveOutstandingSum(
    (fcRows || []).map((r) => ({
      amount: r.amount,
      charge_type: r.charge_type,
      payment_status: r.payment_status,
      payment_method: r.payment_method,
    })),
  )

  const activeStayTotal = (fcRows || []).reduce((sum, r) => {
    const status = String(r.payment_status || '').toLowerCase()
    if (status === 'voided' || status === 'superseded' || status === 'cancelled') {
      return sum
    }
    const ctype = String(r.charge_type || '').toLowerCase()
    const amt = Number(r.amount || 0)
    if (ctype === 'payment' || amt <= 0) return sum
    return sum + amt
  }, 0)

  await supabase
    .from('bookings')
    .update({
      balance: billBalance,
      // Replace stay total with the post-no-show active charges (fee), not max(old, fee).
      total_amount: activeStayTotal > 0 ? activeStayTotal : feeAmount,
      payment_status: billBalance > 0 ? 'pending' : 'paid',
    })
    .eq('id', input.bookingId)

  return { data: { feeAmount, bookingId: input.bookingId }, error: null }
}
