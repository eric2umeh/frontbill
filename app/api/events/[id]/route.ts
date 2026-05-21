import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { resolveEventsAuthed } from '@/lib/events/api-auth'
import { parseEventPaymentFromBody } from '@/lib/events/record-event-payment'

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
    .select('organization_id, start_date, end_date, estimated_value')
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
  if (body.end_date !== undefined) {
    const startForEnd = String(patch.start_date ?? existing.start_date).trim()
    const endRaw = String(body.end_date || '').trim()
    patch.end_date =
      endRaw && /^\d{4}-\d{2}-\d{2}$/.test(endRaw) ? endRaw : startForEnd
  }
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
  const estimatedForPayment =
    body.estimated_value !== undefined
      ? body.estimated_value === '' || body.estimated_value == null
        ? null
        : Math.max(0, Number(body.estimated_value) || 0)
      : existing.estimated_value

  if (
    body.payment_status != null ||
    body.payment_method != null ||
    body.partial_amount !== undefined ||
    body.pay_above_total !== undefined ||
    body.estimated_value !== undefined
  ) {
    const payment = parseEventPaymentFromBody(body as Record<string, unknown>, estimatedForPayment)
    if (payment.uiPaymentStatus === 'partial' && payment.depositAmount <= 0) {
      return NextResponse.json({ error: 'Enter the amount paid for partial payment' }, { status: 400 })
    }
    patch.payment_method = payment.payment_method
    patch.payment_status = payment.payment_status
    patch.amount_paid = payment.amount_paid
    patch.balance = payment.balance
  }
  if (body.remarks !== undefined) patch.remarks = String(body.remarks || '').trim() || null

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
