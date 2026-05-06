import { createAdminClient } from '@/lib/supabase/admin'
import { buildBackdateDedupeKey } from '@/lib/backdate/dedupe-key'
import { createBookingFromPayload, type SerializedBookingPayload } from '@/lib/backdate/booking-payload'
import { canonicalRoleKey } from '@/lib/permissions'
import { fetchOrganizationHotelTimeZone } from '@/lib/hotel-date-server'
import { isCalendarDateBeforeHotelToday } from '@/lib/hotel-date'
import { notifyApproversNewBackdateRequest } from '@/lib/email/backdate-request-notify'
import { NextResponse } from 'next/server'

function isBackdateDeciderRole(role: string | null | undefined): boolean {
  const k = canonicalRoleKey(role)
  return k === 'admin' || k === 'superadmin'
}

const DECISION_STATUSES = ['approved', 'rejected']

function isUniqueViolation(err: { code?: string; message?: string } | null) {
  if (!err) return false
  if (err.code === '23505') return true
  const m = err.message || ''
  return m.includes('idx_backdate_requests_org_pending_dedupe') || m.includes('duplicate key')
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const callerId = searchParams.get('caller_id')

    if (!callerId) {
      return NextResponse.json({ error: 'caller_id is required' }, { status: 400 })
    }

    const admin = createAdminClient()
    const { data: callerProfile, error: callerError } = await admin
      .from('profiles')
      .select('role, organization_id')
      .eq('id', callerId)
      .single()

    if (callerError || !callerProfile) {
      return NextResponse.json({ error: 'Caller profile not found' }, { status: 403 })
    }

    let query = admin
      .from('backdate_requests')
      .select('*')
      .eq('organization_id', callerProfile.organization_id)
      .order('created_at', { ascending: false })

    if (!isBackdateDeciderRole(callerProfile.role)) {
      query = query.eq('requested_by', callerId)
    }

    const { data: requests, error } = await query
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    const userIds = Array.from(new Set((requests || []).flatMap((item: any) => [item.requested_by, item.approved_by]).filter(Boolean)))
    const nameMap: Record<string, string> = {}
    if (userIds.length > 0) {
      const { data: profiles } = await admin
        .from('profiles')
        .select('id, full_name')
        .in('id', userIds)

      ;(profiles || []).forEach((profile: any) => {
        nameMap[profile.id] = profile.full_name || `User ${String(profile.id).slice(0, 8)}`
      })
    }

    return NextResponse.json({
      requests: (requests || []).map((item: any) => ({
        ...item,
        requested_by_name: nameMap[item.requested_by] || 'Unknown User',
        approved_by_name: item.approved_by ? nameMap[item.approved_by] || 'Unknown User' : null,
      })),
    })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const { caller_id, request_type, requested_check_in, requested_check_out, reason, metadata: rawMetadata } = body
    const metadata = rawMetadata && typeof rawMetadata === 'object' ? { ...rawMetadata } : {}

    if (!caller_id || !request_type || !requested_check_in || !reason?.trim()) {
      return NextResponse.json({ error: 'caller_id, request_type, requested_check_in and reason are required' }, { status: 400 })
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

    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(requested_check_in).trim())) {
      return NextResponse.json({ error: 'requested_check_in must be YYYY-MM-DD' }, { status: 400 })
    }

    const orgTz = await fetchOrganizationHotelTimeZone(callerProfile.organization_id)
    const now = new Date()
    if (!isCalendarDateBeforeHotelToday(String(requested_check_in).trim(), now, orgTz)) {
      return NextResponse.json(
        { error: 'Backdate requests apply only when check-in is before today on the hotel calendar' },
        { status: 400 },
      )
    }

    const roomId = (metadata as any).room_id ?? (metadata as any).booking_payload?.room_id ?? null
    const bulkFingerprint = (metadata as any).bulk_fingerprint ?? null

    const dedupe_key = buildBackdateDedupeKey({
      organizationId: callerProfile.organization_id,
      requestedBy: caller_id,
      requestType: request_type,
      requestedCheckIn: requested_check_in,
      requestedCheckOut: requested_check_out || null,
      roomId,
      bulkFingerprint,
    })

    const { data: dup } = await admin
      .from('backdate_requests')
      .select('id')
      .eq('organization_id', callerProfile.organization_id)
      .eq('dedupe_key', dedupe_key)
      .eq('status', 'pending')
      .maybeSingle()

    if (dup?.id) {
      return NextResponse.json(
        { error: 'A pending backdate request for this intent already exists', existing_request_id: dup.id },
        { status: 409 },
      )
    }

    ;(metadata as any).dedupe_key = dedupe_key

    const { data, error } = await admin
      .from('backdate_requests')
      .insert([
        {
          organization_id: callerProfile.organization_id,
          requested_by: caller_id,
          request_type,
          requested_check_in,
          requested_check_out: requested_check_out || null,
          reason: reason.trim(),
          metadata,
          dedupe_key,
        },
      ])
      .select()
      .single()

    if (error) {
      if (isUniqueViolation(error)) {
        return NextResponse.json(
          { error: 'A pending backdate request for this intent already exists' },
          { status: 409 },
        )
      }
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    try {
      const { data: requesterProf } = await admin
        .from('profiles')
        .select('full_name')
        .eq('id', caller_id)
        .maybeSingle()
      const requesterLabel = requesterProf?.full_name?.trim() || `User ${String(caller_id).slice(0, 8)}`
      void notifyApproversNewBackdateRequest({
        organizationId: callerProfile.organization_id,
        requestId: data.id,
        requestType: String(request_type),
        requestedCheckIn: requested_check_in,
        requestedByLabel: requesterLabel,
        reasonPreview: reason.trim(),
      })
    } catch (e) {
      console.error('[backdate-requests] notify after insert:', e)
    }

    return NextResponse.json({ request: data })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

export async function PATCH(request: Request) {
  try {
    const { caller_id, request_id, status, decision_note } = await request.json()

    if (!caller_id || !request_id || !DECISION_STATUSES.includes(status)) {
      return NextResponse.json({ error: 'caller_id, request_id and a valid status are required' }, { status: 400 })
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

    if (!isBackdateDeciderRole(callerProfile.role)) {
      return NextResponse.json({ error: 'Only a Superadmin or Administrator can approve or reject backdate requests' }, { status: 403 })
    }

    const { data: fullRow, error: loadErr } = await admin.from('backdate_requests').select('*').eq('id', request_id).single()

    if (loadErr || !fullRow) {
      return NextResponse.json({ error: 'Backdate request not found' }, { status: 404 })
    }

    if (fullRow.organization_id !== callerProfile.organization_id) {
      return NextResponse.json({ error: 'Backdate request not found' }, { status: 404 })
    }

    if (fullRow.status !== 'pending') {
      return NextResponse.json({ error: 'This request has already been decided' }, { status: 400 })
    }

    const decidedAt = new Date().toISOString()
    const meta = (fullRow.metadata && typeof fullRow.metadata === 'object' ? fullRow.metadata : {}) as Record<string, unknown>
    let created_booking_id: string | null = fullRow.created_booking_id ?? null
    let used_at: string | null = fullRow.used_at ?? null
    let nextMetadata = { ...meta }

    if (status === 'approved') {
      if (fullRow.request_type === 'booking' && meta.booking_payload && !created_booking_id) {
        const payload = meta.booking_payload as SerializedBookingPayload
        if (payload.organization_id !== fullRow.organization_id) {
          return NextResponse.json({ error: 'Booking payload does not match organization' }, { status: 400 })
        }
        const created = await createBookingFromPayload(admin, payload, fullRow.requested_by)
        if (!created.ok) {
          return NextResponse.json({ error: created.error }, { status: 422 })
        }
        created_booking_id = created.bookingId
        used_at = decidedAt
        nextMetadata = {
          ...nextMetadata,
          created_folio_id: created.folio_id,
          created_booking_id: created.bookingId,
        }
      }
    }

    const { data, error } = await admin
      .from('backdate_requests')
      .update({
        status,
        decision_note: decision_note?.trim() || null,
        approved_by: caller_id,
        decided_at: decidedAt,
        ...(created_booking_id ? { created_booking_id } : {}),
        ...(used_at ? { used_at } : {}),
        metadata: nextMetadata,
      })
      .eq('id', request_id)
      .select()
      .single()

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ request: data, created_booking_id: created_booking_id || undefined })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
