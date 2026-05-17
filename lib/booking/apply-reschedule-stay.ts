import type { createAdminClient } from '@/lib/supabase/admin'
import { roomHousekeepingAfterEdit } from '@/lib/booking/edit-booking-patch'
import { hasRoomDateConflict } from '@/lib/booking/room-date-conflict'
import {
  appendRescheduleStayNote,
  buildRescheduleStayFields,
} from '@/lib/booking/reschedule-stay'
import { canRescheduleStayBooking } from '@/lib/booking/can-reschedule-stay'
import { isBookingCheckedOut } from '@/lib/utils/booking-checkout-ui'

export type ApplyRescheduleStayResult =
  | { ok: true; booking: Record<string, unknown> }
  | { ok: false; status: number; error: string }

/** Apply new stay dates to an existing booking (used on approval). */
export async function applyRescheduleStay(
  admin: ReturnType<typeof createAdminClient>,
  params: {
    organizationId: string
    bookingId: string
    check_in: string
    check_out: string
    callerId: string
    reason?: string | null
  },
): Promise<ApplyRescheduleStayResult> {
  const { organizationId, bookingId, check_in, check_out, callerId, reason } = params

  const { data: existing, error: loadErr } = await admin.from('bookings').select('*').eq('id', bookingId).single()
  if (loadErr || !existing) {
    return { ok: false, status: 404, error: 'Booking not found' }
  }

  if ((existing as { organization_id: string }).organization_id !== organizationId) {
    return { ok: false, status: 403, error: 'Forbidden' }
  }

  const ex = existing as {
    status: string
    folio_status?: string | null
    check_in: string
    check_out: string
    room_id: string
  }

  if (isBookingCheckedOut({ status: ex.status, folio_status: ex.folio_status })) {
    return { ok: false, status: 400, error: 'Cannot reschedule a checked-out folio.' }
  }

  if (!canRescheduleStayBooking(ex)) {
    return {
      ok: false,
      status: 400,
      error:
        'Only reserved or confirmed stays can be rescheduled. Use Extend Stay or administrator edit for in-house folios.',
    }
  }

  const prevCi = ex.check_in.slice(0, 10)
  const prevCo = ex.check_out.slice(0, 10)
  if (prevCi === check_in && prevCo === check_out) {
    return { ok: false, status: 400, error: 'Dates match the current stay; nothing to apply.' }
  }

  let fields: ReturnType<typeof buildRescheduleStayFields>
  try {
    fields = buildRescheduleStayFields(existing as Record<string, unknown>, check_in, check_out)
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Invalid dates'
    return { ok: false, status: 400, error: msg }
  }

  const conflict = await hasRoomDateConflict(
    admin,
    organizationId,
    ex.room_id,
    fields.check_in,
    fields.check_out,
    bookingId,
  )
  if (conflict) {
    return { ok: false, status: 409, error: 'Room is already booked for overlapping dates' }
  }

  const updated_at = new Date().toISOString()
  const notes = appendRescheduleStayNote(
    (existing as { notes?: string | null }).notes,
    { check_in: prevCi, check_out: prevCo },
    { check_in: fields.check_in, check_out: fields.check_out },
    reason,
  )

  const { data: updated, error: upErr } = await admin
    .from('bookings')
    .update({
      ...fields,
      notes,
      updated_at,
      updated_by: callerId,
    })
    .eq('id', bookingId)
    .select('*')
    .single()

  if (upErr) {
    return { ok: false, status: 500, error: upErr.message }
  }

  const nextHousekeeping = roomHousekeepingAfterEdit(String((existing as { status?: string }).status ?? 'reserved'))
  await admin
    .from('rooms')
    .update({ status: nextHousekeeping, updated_at, updated_by: callerId })
    .eq('id', ex.room_id)

  return { ok: true, booking: updated as Record<string, unknown> }
}
