import type { createAdminClient } from '@/lib/supabase/admin'
import { roomHousekeepingAfterEdit } from '@/lib/booking/edit-booking-patch'
import { hasRoomDateConflict } from '@/lib/booking/room-date-conflict'
import {
  appendRescheduleStayNote,
  buildRescheduleRoomChargeFolioUpdates,
  buildRescheduleStayFields,
  folioRoomChargeStatusAfterReschedule,
} from '@/lib/booking/reschedule-stay'
import { canRescheduleStayBooking } from '@/lib/booking/can-reschedule-stay'
import { isBookingCheckedOut } from '@/lib/utils/booking-checkout-ui'
import { insertFolioCharges } from '@/lib/utils/insert-folio-charges'

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

  const { data: roomChargeRows, error: folioLoadErr } = await admin
    .from('folio_charges')
    .select('id, amount, description, charge_type, created_at')
    .eq('booking_id', bookingId)
    .in('charge_type', ['room_charge', 'reservation'])
    .order('created_at', { ascending: true })

  if (folioLoadErr) {
    return { ok: false, status: 500, error: folioLoadErr.message }
  }

  const folioUpdates = buildRescheduleRoomChargeFolioUpdates(roomChargeRows || [], fields)
  if (folioUpdates.length === 0) {
    const { error: folioInsErr } = await insertFolioCharges(admin, [
      {
        booking_id: bookingId,
        organization_id: organizationId,
        description: `Initial booking charge - ${fields.number_of_nights} night${
          fields.number_of_nights !== 1 ? 's' : ''
        }`,
        amount: fields.total_amount,
        charge_type: 'room_charge',
        payment_status: folioRoomChargeStatusAfterReschedule(fields.payment_status),
        created_by: callerId,
      },
    ])
    if (folioInsErr) {
      return { ok: false, status: 500, error: folioInsErr.message }
    }
  } else {
    for (const patch of folioUpdates) {
      const { error: folioUpErr } = await admin
        .from('folio_charges')
        .update({
          amount: patch.amount,
          description: patch.description,
          payment_status: patch.payment_status,
        })
        .eq('id', patch.id)
      if (folioUpErr) {
        return { ok: false, status: 500, error: folioUpErr.message }
      }
    }
  }

  const nextHousekeeping = roomHousekeepingAfterEdit(String((existing as { status?: string }).status ?? 'reserved'))
  await admin
    .from('rooms')
    .update({ status: nextHousekeeping, updated_at, updated_by: callerId })
    .eq('id', ex.room_id)

  return { ok: true, booking: updated as Record<string, unknown> }
}
