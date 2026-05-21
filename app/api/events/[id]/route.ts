import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { resolveEventsAuthed } from '@/lib/events/api-auth'

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await resolveEventsAuthed(request, { requireManage: true })
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const { id } = await params
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })

  const body = await request.json().catch(() => ({}))
  const admin = createAdminClient()

  const { data: existing, error: fe } = await admin
    .from('hotel_events')
    .select('organization_id, start_date, end_date')
    .eq('id', id)
    .single()

  if (fe || !existing || existing.organization_id !== auth.ctx.organizationId) {
    return NextResponse.json({ error: 'Event not found' }, { status: 404 })
  }

  const patch: Record<string, unknown> = {
    updated_by: auth.ctx.userId,
    updated_at: new Date().toISOString(),
  }

  if (body.title != null) patch.title = String(body.title).trim()
  if (body.description !== undefined) patch.description = String(body.description || '').trim() || null
  if (body.venue !== undefined) patch.venue = String(body.venue || '').trim() || null
  if (body.start_date != null) patch.start_date = String(body.start_date).trim()
  if (body.end_date != null) patch.end_date = String(body.end_date).trim()
  if (body.start_time !== undefined) patch.start_time = String(body.start_time || '').trim() || null
  if (body.end_time !== undefined) patch.end_time = String(body.end_time || '').trim() || null
  if (body.client_name !== undefined) patch.client_name = String(body.client_name || '').trim() || null
  if (body.client_phone !== undefined) patch.client_phone = String(body.client_phone || '').trim() || null
  if (body.client_email !== undefined) patch.client_email = String(body.client_email || '').trim() || null
  if (body.expected_attendees !== undefined) {
    patch.expected_attendees =
      body.expected_attendees === '' || body.expected_attendees == null
        ? null
        : Math.max(0, parseInt(String(body.expected_attendees), 10) || 0)
  }
  if (body.estimated_value !== undefined) {
    patch.estimated_value =
      body.estimated_value === '' || body.estimated_value == null
        ? null
        : Math.max(0, Number(body.estimated_value) || 0)
  }
  if (body.notes !== undefined) patch.notes = String(body.notes || '').trim() || null

  const start = String(patch.start_date ?? existing.start_date)
  const end = String(patch.end_date ?? existing.end_date)
  if (end < start) {
    return NextResponse.json({ error: 'end_date must be on or after start_date' }, { status: 400 })
  }

  const { data, error } = await admin
    .from('hotel_events')
    .update(patch)
    .eq('id', id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json({ event: data })
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await resolveEventsAuthed(_request, { requireManage: true })
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const { id } = await params
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })

  const admin = createAdminClient()
  const { data: existing } = await admin
    .from('hotel_events')
    .select('id, organization_id')
    .eq('id', id)
    .single()

  if (!existing || existing.organization_id !== auth.ctx.organizationId) {
    return NextResponse.json({ error: 'Event not found' }, { status: 404 })
  }

  const { error } = await admin.from('hotel_events').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json({ ok: true })
}
