import { createAdminClient } from '@/lib/supabase/admin'
import { NextResponse } from 'next/server'

const SUPERADMIN_ROLE = 'superadmin'
const DECISION_STATUSES = ['approved', 'rejected']

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

    if (callerProfile.role !== SUPERADMIN_ROLE && callerProfile.role !== 'admin') {
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
    const { caller_id, request_type, requested_check_in, requested_check_out, reason, metadata } = body

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

    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const requestedDate = new Date(`${requested_check_in}T00:00:00`)
    if (Number.isNaN(requestedDate.getTime()) || requestedDate >= today) {
      return NextResponse.json({ error: 'Backdate requests are only needed for past check-in dates' }, { status: 400 })
    }

    const { data, error } = await admin
      .from('backdate_requests')
      .insert([{
        organization_id: callerProfile.organization_id,
        requested_by: caller_id,
        request_type,
        requested_check_in,
        requested_check_out: requested_check_out || null,
        reason: reason.trim(),
        metadata: metadata || {},
      }])
      .select()
      .single()

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
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

    if (callerProfile.role !== SUPERADMIN_ROLE) {
      return NextResponse.json({ error: 'Only superadmins can approve or reject backdate requests' }, { status: 403 })
    }

    const { data: existing } = await admin
      .from('backdate_requests')
      .select('organization_id, status')
      .eq('id', request_id)
      .single()

    if (!existing || existing.organization_id !== callerProfile.organization_id) {
      return NextResponse.json({ error: 'Backdate request not found' }, { status: 404 })
    }

    if (existing.status !== 'pending') {
      return NextResponse.json({ error: 'This request has already been decided' }, { status: 400 })
    }

    const { data, error } = await admin
      .from('backdate_requests')
      .update({
        status,
        decision_note: decision_note?.trim() || null,
        approved_by: caller_id,
        decided_at: new Date().toISOString(),
      })
      .eq('id', request_id)
      .select()
      .single()

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ request: data })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
