import { createAdminClient } from '@/lib/supabase/admin'
import { NextResponse } from 'next/server'
import { canonicalRoleKey, hasPermission } from '@/lib/permissions'
import { notifyNightAuditRequestCreated } from '@/lib/night-audit/notify-request-created'
import { roomNotBookableReason } from '@/lib/utils/room-bookability'
import { roomHousekeepingPatchForInHouse } from '@/lib/rooms/sync-housekeeping-status'
import { canFrontDeskApplyRoomChange } from '@/lib/booking/can-room-change'
import { hasRoomDateConflict } from '@/lib/booking/room-date-conflict'

const DECISION = ['approved', 'rejected'] as const

function isRoomChangeDeciderRole(role: string | null | undefined): boolean {
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
      .from('room_change_requests')
      .select('*')
      .eq('organization_id', callerProfile.organization_id)
      .order('created_at', { ascending: false })

    if (bookingId) {
      query = query.eq('booking_id', bookingId)
    }

    if (!isRoomChangeDeciderRole(callerProfile.role)) {
      query = query.eq('requested_by', callerId)
    }

    const { data: rows, error } = await query
    if (error) {
      if (/room_change_requests/i.test(error.message || '') && /does not exist/i.test(error.message || '')) {
        return NextResponse.json({ requests: [] })
      }
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    const userIds = Array.from(
      new Set((rows || []).flatMap((r: any) => [r.requested_by, r.approved_by]).filter(Boolean)),
    )
    const nameMap: Record<string, string> = {}
    if (userIds.length > 0) {
      const { data: profiles } = await admin.from('profiles').select('id, full_name').in('id', userIds)
      ;(profiles || []).forEach((p: any) => {
        nameMap[p.id] = String(p.full_name || '').trim() || `User ${String(p.id).slice(0, 8)}`
      })
    }

    return NextResponse.json({
      requests: (rows || []).map((r: any) => ({
        ...r,
        requested_by_name: nameMap[r.requested_by] || 'Unknown',
        approved_by_name: r.approved_by ? nameMap[r.approved_by] || 'Unknown' : null,
      })),
    })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const { caller_id, booking_id, to_room_id, reason, apply_immediately } = body

    if (!caller_id || !booking_id || !to_room_id || !String(reason || '').trim()) {
      return NextResponse.json(
        { error: 'caller_id, booking_id, to_room_id and reason are required' },
        { status: 400 },
      )
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

    if (!hasPermission(callerProfile.role, 'room_change:request')) {
      return NextResponse.json({ error: 'You do not have permission to request a room change' }, { status: 403 })
    }

    const orgId = callerProfile.organization_id
    const applyNow =
      Boolean(apply_immediately) &&
      (canFrontDeskApplyRoomChange(callerProfile.role) ||
        hasPermission(callerProfile.role, 'room_change:approve'))

    const { data: booking, error: bookingErr } = await admin
      .from('bookings')
      .select('id, organization_id, room_id, status, check_in, check_out, folio_id')
      .eq('id', booking_id)
      .single()

    if (bookingErr || !booking || booking.organization_id !== orgId) {
      return NextResponse.json({ error: 'Booking not found' }, { status: 404 })
    }

    const bookingStatus = String(booking.status || '')
      .trim()
      .toLowerCase()
      .replace(/[\s-]+/g, '_')
    const roomChangeEligible = ['checked_in', 'confirmed', 'reserved'].includes(bookingStatus)
    if (!roomChangeEligible) {
      return NextResponse.json(
        { error: 'Room changes can only be requested for reserved, confirmed, or checked-in bookings' },
        { status: 400 },
      )
    }

    const fromRoomId = booking.room_id as string | null
    if (!fromRoomId) {
      return NextResponse.json({ error: 'Booking has no room assigned' }, { status: 400 })
    }

    if (fromRoomId === to_room_id) {
      return NextResponse.json({ error: 'Select a different room than the current one' }, { status: 400 })
    }

    if (!applyNow) {
      const { data: pendingDup } = await admin
        .from('room_change_requests')
        .select('id')
        .eq('organization_id', orgId)
        .eq('booking_id', booking_id)
        .eq('status', 'pending')
        .maybeSingle()

      if (pendingDup?.id) {
        return NextResponse.json(
          { error: 'A room change request is already pending for this booking' },
          { status: 409 },
        )
      }
    }

    const { data: fromRoom, error: fromErr } = await admin
      .from('rooms')
      .select('id, room_number, status, organization_id')
      .eq('id', fromRoomId)
      .single()
    if (fromErr || !fromRoom || fromRoom.organization_id !== orgId) {
      return NextResponse.json({ error: 'Current room not found' }, { status: 400 })
    }

    const { data: toRoom, error: toErr } = await admin
      .from('rooms')
      .select('id, room_number, status, organization_id, housekeeping_status')
      .eq('id', to_room_id)
      .single()
    if (toErr || !toRoom || toRoom.organization_id !== orgId) {
      return NextResponse.json({ error: 'Target room not found' }, { status: 400 })
    }

    const bookableReason = roomNotBookableReason({
      status: String(toRoom.status),
      housekeeping_status: (toRoom as { housekeeping_status?: string | null }).housekeeping_status,
    })
    if (bookableReason) {
      return NextResponse.json(
        { error: `Room ${toRoom.room_number}: ${bookableReason}` },
        { status: 400 },
      )
    }

    if (String(toRoom.status) !== 'available') {
      return NextResponse.json(
        { error: `Room ${toRoom.room_number} is not available (status: ${toRoom.status})` },
        { status: 400 },
      )
    }

    const cin = String(booking.check_in || '').slice(0, 10)
    const cout = String(booking.check_out || '').slice(0, 10)
    if (!cin || !cout) {
      return NextResponse.json({ error: 'Booking is missing stay dates' }, { status: 400 })
    }

    // Reserved folios are date holds after occupied rooms became sellable on later nights.
    const conflict = await hasRoomDateConflict(admin, orgId, to_room_id, cin, cout, booking_id)
    if (conflict) {
      return NextResponse.json(
        { error: `Room ${toRoom.room_number} is already assigned for overlapping dates` },
        { status: 400 },
      )
    }

    const fromLabel = String(fromRoom.room_number || fromRoomId)
    const toLabel = String(toRoom.room_number || to_room_id)
    const reasonText = String(reason).trim()
    const nowIso = new Date().toISOString()

    if (applyNow) {
      // Clear any leftover pending request so immediate move is not blocked later
      await admin
        .from('room_change_requests')
        .update({
          status: 'rejected',
          approved_by: caller_id,
          decided_at: nowIso,
          decision_note: 'Superseded by immediate room change',
        })
        .eq('organization_id', orgId)
        .eq('booking_id', booking_id)
        .eq('status', 'pending')

      const { error: bookUpErr } = await admin
        .from('bookings')
        .update({ room_id: to_room_id })
        .eq('id', booking_id)
        .eq('room_id', fromRoomId)

      if (bookUpErr) {
        return NextResponse.json({ error: bookUpErr.message }, { status: 500 })
      }

      // Reserved stays do not occupy inventory; only in-house folios mark rooms occupied.
      if (bookingStatus === 'reserved') {
        await admin.from('rooms').update({ status: 'available', updated_at: nowIso }).eq('id', fromRoomId)
        await admin.from('rooms').update({ status: 'available', updated_at: nowIso }).eq('id', to_room_id)
      } else {
        await admin.from('rooms').update({ status: 'available', updated_at: nowIso }).eq('id', fromRoomId)
        await admin
          .from('rooms')
          .update({
            ...roomHousekeepingPatchForInHouse(bookingStatus, nowIso),
            updated_at: nowIso,
          })
          .eq('id', to_room_id)
      }

      const noteDescription = `Room change (applied): ${fromLabel} → ${toLabel}. Reason: ${reasonText.slice(0, 500)}`
      const { error: folioErr } = await admin.from('folio_charges').insert([
        {
          booking_id,
          description: noteDescription,
          amount: 0,
          charge_type: 'folio_note',
          payment_status: 'paid',
          created_by: caller_id,
        },
      ])
      if (folioErr) {
        console.error('[room-change-requests] folio_note insert failed', folioErr)
      }

      // Audit trail as auto-approved (no pending Night Audit wait)
      const { data: inserted, error: insErr } = await admin
        .from('room_change_requests')
        .insert([
          {
            organization_id: orgId,
            booking_id,
            from_room_id: fromRoomId,
            to_room_id,
            from_room_label: fromLabel,
            to_room_label: toLabel,
            reason: reasonText,
            requested_by: caller_id,
            status: 'approved',
            approved_by: caller_id,
            decided_at: nowIso,
            decision_note: 'Applied immediately by front desk (approval not required)',
          },
        ])
        .select()
        .single()

      if (insErr) {
        // Room already moved — do not fail the whole op if history insert fails
        console.error('[room-change-requests] immediate history insert failed', insErr)
        return NextResponse.json({ applied: true, booking_id, request: null })
      }

      return NextResponse.json({ applied: true, request: inserted, booking_id })
    }

    const { data: inserted, error: insErr } = await admin
      .from('room_change_requests')
      .insert([
        {
          organization_id: orgId,
          booking_id,
          from_room_id: fromRoomId,
          to_room_id,
          from_room_label: fromLabel,
          to_room_label: toLabel,
          reason: reasonText,
          requested_by: caller_id,
        },
      ])
      .select()
      .single()

    if (insErr) {
      if (insErr.code === '23505' || /idx_room_change_org_booking_pending/i.test(insErr.message || '')) {
        return NextResponse.json(
          { error: 'A room change request is already pending for this booking' },
          { status: 409 },
        )
      }
      return NextResponse.json({ error: insErr.message }, { status: 500 })
    }

    void notifyNightAuditRequestCreated(admin, {
      organizationId: orgId,
      callerId: caller_id,
      kind: 'room_change',
      requestId: inserted.id,
      reason: reasonText,
      detailLines: [
        { label: 'From room', value: fromLabel },
        { label: 'To room', value: toLabel },
        { label: 'Folio', value: String(booking.folio_id || booking_id).slice(0, 32) },
      ],
    })

    return NextResponse.json({ applied: false, request: inserted })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

export async function PATCH(request: Request) {
  try {
    const { caller_id, request_id, status, decision_note } = await request.json()

    if (!caller_id || !request_id || !DECISION.includes(status)) {
      return NextResponse.json({ error: 'caller_id, request_id and status (approved|rejected) are required' }, { status: 400 })
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

    if (!hasPermission(callerProfile.role, 'room_change:approve')) {
      return NextResponse.json({ error: 'Only a Superadmin, Administrator, or Manager can approve room changes' }, { status: 403 })
    }

    const { data: row, error: loadErr } = await admin
      .from('room_change_requests')
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
        .from('room_change_requests')
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

    const { data: booking, error: bErr } = await admin
      .from('bookings')
      .select('id, organization_id, room_id, status, check_in, check_out, folio_id')
      .eq('id', row.booking_id)
      .single()

    if (bErr || !booking || booking.organization_id !== row.organization_id) {
      return NextResponse.json({ error: 'Booking no longer exists' }, { status: 400 })
    }

    const bookingStatus = String(booking.status || '')
      .trim()
      .toLowerCase()
      .replace(/[\s-]+/g, '_')
    if (!['checked_in', 'confirmed', 'reserved'].includes(bookingStatus)) {
      return NextResponse.json(
        { error: 'This booking is no longer active; reject this request and open a new one if needed' },
        { status: 400 },
      )
    }

    if (booking.room_id !== row.from_room_id) {
      return NextResponse.json(
        { error: 'Booking room no longer matches this request (room was changed elsewhere). Reject and open a new request.' },
        { status: 409 },
      )
    }

    const { data: toRoom, error: trErr } = await admin
      .from('rooms')
      .select('id, room_number, status, organization_id, housekeeping_status')
      .eq('id', row.to_room_id)
      .single()
    if (trErr || !toRoom || toRoom.organization_id !== row.organization_id) {
      return NextResponse.json({ error: 'Target room not found' }, { status: 400 })
    }

    const approveBookableReason = roomNotBookableReason({
      status: String(toRoom.status),
      housekeeping_status: (toRoom as { housekeeping_status?: string | null }).housekeeping_status,
    })
    if (approveBookableReason) {
      return NextResponse.json(
        { error: `Room ${toRoom.room_number}: ${approveBookableReason}` },
        { status: 409 },
      )
    }

    if (String(toRoom.status) !== 'available') {
      return NextResponse.json(
        { error: `Room ${toRoom.room_number} is no longer available` },
        { status: 409 },
      )
    }

    const cin = String(booking.check_in || '').slice(0, 10)
    const cout = String(booking.check_out || '').slice(0, 10)
    if (!cin || !cout) {
      return NextResponse.json({ error: 'Booking is missing stay dates' }, { status: 400 })
    }

    const approveConflict = await hasRoomDateConflict(
      admin,
      row.organization_id,
      row.to_room_id,
      cin,
      cout,
      row.booking_id,
    )
    if (approveConflict) {
      return NextResponse.json(
        { error: 'Target room is now assigned for overlapping dates' },
        { status: 409 },
      )
    }

    const { error: bookUpErr } = await admin
      .from('bookings')
      .update({ room_id: row.to_room_id })
      .eq('id', row.booking_id)
      .eq('room_id', row.from_room_id)

    if (bookUpErr) {
      return NextResponse.json({ error: bookUpErr.message }, { status: 500 })
    }

    const approveBookingStatus = String(booking.status || '')
      .trim()
      .toLowerCase()
      .replace(/[\s-]+/g, '_')

    if (approveBookingStatus === 'reserved') {
      await admin.from('rooms').update({ status: 'available', updated_at: decidedAt }).eq('id', row.from_room_id)
      await admin.from('rooms').update({ status: 'available', updated_at: decidedAt }).eq('id', row.to_room_id)
    } else {
      await admin.from('rooms').update({ status: 'available', updated_at: decidedAt }).eq('id', row.from_room_id)
      await admin
        .from('rooms')
        .update({
          ...roomHousekeepingPatchForInHouse(approveBookingStatus, decidedAt),
          updated_at: decidedAt,
        })
        .eq('id', row.to_room_id)
    }

    const noteDescription =
      `Room change (approved): ${row.from_room_label} → ${row.to_room_label}. Reason on request: ${String(row.reason || '').slice(0, 500)}`

    const { error: folioErr } = await admin.from('folio_charges').insert([
      {
        booking_id: row.booking_id,
        description: noteDescription,
        amount: 0,
        charge_type: 'folio_note',
        payment_status: 'paid',
        created_by: caller_id,
      },
    ])
    if (folioErr) {
      console.error('[room-change-requests] folio_note insert failed', folioErr)
    }

    const { data: updated, error: upErr } = await admin
      .from('room_change_requests')
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

    return NextResponse.json({ request: updated, booking_id: row.booking_id })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
