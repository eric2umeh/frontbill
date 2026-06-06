import { createAdminClient } from '@/lib/supabase/admin'
import { applyRescheduleStay } from '@/lib/booking/apply-reschedule-stay'
import { canRescheduleStay, canRescheduleStayBooking } from '@/lib/booking/can-reschedule-stay'
import { isStayCheckInConsideredBackdated } from '@/lib/hotel-date'
import { notifyNightAuditRequestCreated } from '@/lib/night-audit/notify-request-created'
import { isBookingCheckedOut } from '@/lib/utils/booking-checkout-ui'
import { canonicalRoleKey, hasPermission } from '@/lib/permissions'
import { resolveAuthedUserId } from '@/lib/supabase/resolve-authed-user-id'
import { NextResponse } from 'next/server'

const DECISION = ['approved', 'rejected'] as const

function isRescheduleDeciderRole(role: string | null | undefined): boolean {
  const k = canonicalRoleKey(role)
  return k === 'superadmin' || k === 'admin' || k === 'manager'
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const callerId = searchParams.get('caller_id')
    const bookingId = searchParams.get('booking_id')

    if (!callerId) {
      return NextResponse.json({ error: 'caller_id is required' }, { status: 400 })
    }

    const authed = await resolveAuthedUserId(request)
    if (!authed || authed !== callerId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const admin = createAdminClient()
    const { data: callerProfile, error: callerError } = await admin
      .from('profiles')
      .select('role, organization_id')
      .eq('id', callerId)
      .single()

    if (callerError || !callerProfile?.organization_id) {
      return NextResponse.json({ error: 'Caller profile not found' }, { status: 403 })
    }

    let query = admin
      .from('reschedule_stay_requests')
      .select('*')
      .eq('organization_id', callerProfile.organization_id)
      .order('created_at', { ascending: false })

    if (bookingId) {
      query = query.eq('booking_id', bookingId)
    }

    if (!isRescheduleDeciderRole(callerProfile.role)) {
      query = query.eq('requested_by', callerId)
    }

    const { data: rows, error } = await query
    if (error) {
      if (/reschedule_stay_requests/i.test(error.message || '') && /does not exist/i.test(error.message || '')) {
        return NextResponse.json({ requests: [] })
      }
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    const userIds = Array.from(
      new Set((rows || []).flatMap((r: { requested_by?: string; approved_by?: string }) => [r.requested_by, r.approved_by]).filter(Boolean)),
    )
    const nameMap: Record<string, string> = {}
    if (userIds.length > 0) {
      const { data: profiles } = await admin.from('profiles').select('id, full_name').in('id', userIds)
      ;(profiles || []).forEach((p: { id: string; full_name?: string }) => {
        nameMap[p.id] = String(p.full_name || '').trim() || `User ${String(p.id).slice(0, 8)}`
      })
    }

    return NextResponse.json({
      requests: (rows || []).map((r: Record<string, unknown>) => ({
        ...r,
        requested_by_name: nameMap[String(r.requested_by)] || 'Unknown',
        approved_by_name: r.approved_by ? nameMap[String(r.approved_by)] || 'Unknown' : null,
      })),
    })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Server error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const { caller_id, booking_id, check_in, check_out, reason } = body

    if (!caller_id || !booking_id || !check_in || !check_out || !String(reason || '').trim()) {
      return NextResponse.json(
        { error: 'caller_id, booking_id, check_in, check_out and reason are required' },
        { status: 400 },
      )
    }

    const authed = await resolveAuthedUserId(request)
    if (!authed || authed !== caller_id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(check_in)) || !/^\d{4}-\d{2}-\d{2}$/.test(String(check_out))) {
      return NextResponse.json({ error: 'check_in and check_out must be YYYY-MM-DD' }, { status: 400 })
    }

    if (check_in >= check_out) {
      return NextResponse.json({ error: 'Check-out must be after check-in' }, { status: 400 })
    }

    const admin = createAdminClient()
    const { data: callerProfile, error: callerError } = await admin
      .from('profiles')
      .select('role, organization_id')
      .eq('id', caller_id)
      .single()

    if (callerError || !callerProfile?.organization_id) {
      return NextResponse.json({ error: 'Caller profile not found' }, { status: 403 })
    }

    if (!hasPermission(callerProfile.role, 'reschedule_stay:request')) {
      return NextResponse.json({ error: 'You do not have permission to request a date change' }, { status: 403 })
    }

    const orgId = callerProfile.organization_id

    const { data: booking, error: bookingErr } = await admin
      .from('bookings')
      .select('id, organization_id, folio_id, guest_id, room_id, check_in, check_out, status, folio_status')
      .eq('id', booking_id)
      .single()

    if (bookingErr || !booking || booking.organization_id !== orgId) {
      return NextResponse.json({ error: 'Booking not found' }, { status: 404 })
    }

    if (
      isBookingCheckedOut({
        status: booking.status,
        folio_status: booking.folio_status,
      })
    ) {
      return NextResponse.json({ error: 'Cannot reschedule a checked-out folio' }, { status: 400 })
    }

    if (!canRescheduleStayBooking(booking)) {
      return NextResponse.json(
        { error: 'Date changes can only be requested for reserved or confirmed bookings' },
        { status: 400 },
      )
    }

    const prevCi = String(booking.check_in || '').slice(0, 10)
    const prevCo = String(booking.check_out || '').slice(0, 10)
    if (prevCi === check_in && prevCo === check_out) {
      return NextResponse.json({ error: 'Choose different check-in or check-out dates' }, { status: 400 })
    }

    const { data: pendingDup } = await admin
      .from('reschedule_stay_requests')
      .select('id')
      .eq('organization_id', orgId)
      .eq('booking_id', booking_id)
      .eq('status', 'pending')
      .maybeSingle()

    if (pendingDup?.id) {
      return NextResponse.json(
        { error: 'A move-dates request is already pending for this booking' },
        { status: 409 },
      )
    }

    const is_backdate =
      isStayCheckInConsideredBackdated(check_in) && check_in !== prevCi

    let guest_label: string | null = null
    let room_label: string | null = null
    if (booking.guest_id) {
      const { data: guestRow } = await admin.from('guests').select('name').eq('id', booking.guest_id).maybeSingle()
      guest_label = guestRow?.name ? String(guestRow.name) : null
    }
    if (booking.room_id) {
      const { data: roomRow } = await admin.from('rooms').select('room_number').eq('id', booking.room_id).maybeSingle()
      room_label = roomRow?.room_number ? `Room ${roomRow.room_number}` : null
    }

    const { data: inserted, error: insErr } = await admin
      .from('reschedule_stay_requests')
      .insert([
        {
          organization_id: orgId,
          booking_id,
          from_check_in: prevCi,
          from_check_out: prevCo,
          to_check_in: check_in,
          to_check_out: check_out,
          is_backdate,
          folio_label: booking.folio_id || null,
          guest_label,
          room_label,
          reason: String(reason).trim(),
          requested_by: caller_id,
        },
      ])
      .select()
      .single()

    if (insErr) {
      if (insErr.code === '23505' || /idx_reschedule_stay_org_booking_pending/i.test(insErr.message || '')) {
        return NextResponse.json(
          { error: 'A move-dates request is already pending for this booking' },
          { status: 409 },
        )
      }
      if (/reschedule_stay_requests/i.test(insErr.message || '') && /does not exist/i.test(insErr.message || '')) {
        return NextResponse.json(
          {
            error:
              'Move-dates requests are not set up yet. Run migration scripts/048_reschedule_stay_requests.sql in Supabase.',
          },
          { status: 503 },
        )
      }
      return NextResponse.json({ error: insErr.message }, { status: 500 })
    }

    void notifyNightAuditRequestCreated(admin, {
      organizationId: orgId,
      callerId: caller_id,
      kind: 'reschedule_stay',
      requestId: inserted.id,
      reason: String(reason).trim(),
      detailLines: [
        { label: 'From', value: `${prevCi} → ${prevCo}` },
        { label: 'To', value: `${check_in} → ${check_out}` },
        { label: 'Guest', value: guest_label || '—' },
      ],
    })

    return NextResponse.json({ request: inserted })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Server error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

export async function PATCH(request: Request) {
  try {
    const { caller_id, request_id, status, decision_note } = await request.json()

    if (!caller_id || !request_id || !DECISION.includes(status)) {
      return NextResponse.json(
        { error: 'caller_id, request_id and status (approved|rejected) are required' },
        { status: 400 },
      )
    }

    const authed = await resolveAuthedUserId(request)
    if (!authed || authed !== caller_id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const admin = createAdminClient()
    const { data: callerProfile, error: callerError } = await admin
      .from('profiles')
      .select('role, organization_id')
      .eq('id', caller_id)
      .single()

    if (callerError || !callerProfile) {
      return NextResponse.json({ error: 'Caller profile not found' }, { status: 403 })
    }

    if (!hasPermission(callerProfile.role, 'reschedule_stay:approve')) {
      return NextResponse.json(
        { error: 'Only a Superadmin, Administrator, or Manager can approve move-dates requests' },
        { status: 403 },
      )
    }

    const { data: row, error: loadErr } = await admin
      .from('reschedule_stay_requests')
      .select('*')
      .eq('id', request_id)
      .single()

    if (loadErr || !row) {
      return NextResponse.json({ error: 'Request not found' }, { status: 404 })
    }

    if (row.organization_id !== callerProfile.organization_id) {
      return NextResponse.json({ error: 'Request not found' }, { status: 404 })
    }

    if (row.status !== 'pending') {
      return NextResponse.json({ error: 'This request has already been decided' }, { status: 400 })
    }

    const decidedAt = new Date().toISOString()

    if (status === 'rejected') {
      const { data: updated, error: upErr } = await admin
        .from('reschedule_stay_requests')
        .update({
          status: 'rejected',
          approved_by: caller_id,
          decided_at: decidedAt,
          decision_note: decision_note?.trim() || null,
        })
        .eq('id', request_id)
        .select()
        .single()
      if (upErr) return NextResponse.json({ error: upErr.message }, { status: 500 })
      return NextResponse.json({ request: updated })
    }

    const applyResult = await applyRescheduleStay(admin, {
      organizationId: row.organization_id,
      bookingId: row.booking_id,
      check_in: String(row.to_check_in).slice(0, 10),
      check_out: String(row.to_check_out).slice(0, 10),
      callerId: caller_id,
      reason: row.reason,
    })

    if (!applyResult.ok) {
      return NextResponse.json({ error: applyResult.error }, { status: applyResult.status })
    }

    const { data: updated, error: upErr } = await admin
      .from('reschedule_stay_requests')
      .update({
        status: 'approved',
        approved_by: caller_id,
        decided_at: decidedAt,
        decision_note: decision_note?.trim() || null,
      })
      .eq('id', request_id)
      .select()
      .single()

    if (upErr) return NextResponse.json({ error: upErr.message }, { status: 500 })

    return NextResponse.json({ request: updated, booking_id: row.booking_id, booking: applyResult.booking })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Server error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
