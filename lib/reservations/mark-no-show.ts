import type { SupabaseClient } from '@supabase/supabase-js'
import { insertFolioCharges } from '@/lib/utils/insert-folio-charges'
import {
  calculateNoShowFee,
  fetchNoShowPolicy,
} from '@/lib/reservations/no-show-policy'
import {
  folioLinesAfterNoShowFee,
  noShowBookingTotals,
  stayChargesReplacedByNoShow,
  voidedNoShowStayDescription,
  type NoShowFolioSnapshotLine,
} from '@/lib/reservations/no-show-folio'

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
      'id, status, room_id, guest_id, folio_id, organization_id, rate_per_night, total_amount, check_in, check_out, number_of_nights, balance, deposit, payment_status, folio_status',
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

  const { data: existingLines, error: linesErr } = await supabase
    .from('folio_charges')
    .select('id, description, amount, charge_type, payment_status, payment_method')
    .eq('booking_id', input.bookingId)

  if (linesErr) return { data: null, error: linesErr.message }

  const lines = (existingLines || []) as NoShowFolioSnapshotLine[]
  const projected = folioLinesAfterNoShowFee(lines, feeAmount)
  const totals = noShowBookingTotals(projected, booking.payment_status as string | null)
  const stayLines = stayChargesReplacedByNoShow(lines)

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

  if (stayLines.length) {
    const clearErr = await voidStayChargesForNoShow(supabase, input.bookingId, stayLines)
    if (clearErr) {
      if (feeAmount > 0) {
        await supabase
          .from('folio_charges')
          .delete()
          .eq('booking_id', input.bookingId)
          .eq('charge_type', 'no_show_fee')
      }
      return { data: null, error: clearErr }
    }
  }

  const { error: balErr } = await supabase
    .from('bookings')
    .update({
      balance: totals.balance,
      total_amount: totals.total_amount,
      payment_status: totals.payment_status,
    })
    .eq('id', input.bookingId)

  if (balErr) return { data: null, error: balErr.message }

  return { data: { feeAmount, bookingId: input.bookingId }, error: null }
}

async function voidStayChargesForNoShow(
  supabase: SupabaseClient,
  bookingId: string,
  stayLines: NoShowFolioSnapshotLine[],
): Promise<string | null> {
  const cleared: NoShowFolioSnapshotLine[] = []
  for (const line of stayLines) {
    const id = String(line.id || '').trim()
    if (!id) continue
    const { error } = await supabase
      .from('folio_charges')
      .update({
        amount: 0,
        payment_status: 'void',
        description: voidedNoShowStayDescription(line),
      })
      .eq('id', id)
      .eq('booking_id', bookingId)
    if (error) {
      for (const prev of cleared) {
        await supabase
          .from('folio_charges')
          .update({
            amount: Number(prev.amount) || 0,
            payment_status: prev.payment_status ?? prev.paymentStatus ?? 'unpaid',
            description: String(prev.description || 'Stay charge'),
          })
          .eq('id', prev.id)
          .eq('booking_id', bookingId)
      }
      return error.message
    }
    cleared.push(line)
  }
  return null
}
