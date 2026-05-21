import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { resolveEventsAuthed } from '@/lib/events/api-auth'
import {
  parseEventPaymentFromBody,
  recordEventPaymentSideEffects,
} from '@/lib/events/record-event-payment'
import type { HotelEventStatus } from '@/lib/events/types'

const STATUSES: HotelEventStatus[] = ['planned', 'confirmed', 'cancelled', 'completed']

function parseEventBody(body: Record<string, unknown>) {
  const title = String(body.title || '').trim()
  const start_date = String(body.start_date || '').trim()
  const endRaw = String(body.end_date || '').trim()
  const end_date = endRaw && /^\d{4}-\d{2}-\d{2}$/.test(endRaw) ? endRaw : start_date
  if (!title || !/^\d{4}-\d{2}-\d{2}$/.test(start_date)) {
    return { error: 'title and start_date (YYYY-MM-DD) are required' }
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(end_date)) {
    return { error: 'end_date must be YYYY-MM-DD when provided' }
  }
  if (end_date < start_date) {
    return { error: 'end_date must be on or after start_date' }
  }
  return {
    title,
    description: body.description != null ? String(body.description).trim() || null : null,
    venue: body.venue != null ? String(body.venue).trim() || null : null,
    start_date,
    end_date,
    start_time: body.start_time != null ? String(body.start_time).trim() || null : null,
    end_time: body.end_time != null ? String(body.end_time).trim() || null : null,
    status: 'planned' as HotelEventStatus,
    client_name: body.client_name != null ? String(body.client_name).trim() || null : null,
    client_phone: body.client_phone != null ? String(body.client_phone).trim() || null : null,
    client_email: body.client_email != null ? String(body.client_email).trim() || null : null,
    expected_attendees:
      body.expected_attendees != null && body.expected_attendees !== ''
        ? Math.max(0, parseInt(String(body.expected_attendees), 10) || 0)
        : null,
    estimated_value:
      body.estimated_value != null && body.estimated_value !== ''
        ? Math.max(0, Number(body.estimated_value) || 0)
        : null,
  }
}

export async function GET(request: Request) {
  const auth = await resolveEventsAuthed(request)
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const params = new URL(request.url).searchParams
  const admin = createAdminClient()
  let q = admin
    .from('hotel_events')
    .select('*')
    .eq('organization_id', auth.ctx.organizationId)
    .order('start_date', { ascending: false })
    .order('created_at', { ascending: false })

  const from = params.get('from')
  const to = params.get('to')
  if (from && /^\d{4}-\d{2}-\d{2}$/.test(from)) {
    q = q.gte('end_date', from)
  }
  if (to && /^\d{4}-\d{2}-\d{2}$/.test(to)) {
    q = q.lte('start_date', to)
  }
  const { data, error } = await q
  if (error) {
    if (/hotel_events/i.test(error.message) && /does not exist/i.test(error.message)) {
      return NextResponse.json({ events: [] })
    }
    return NextResponse.json({ error: error.message }, { status: 400 })
  }
  return NextResponse.json({ events: data ?? [] })
}

export async function POST(request: Request) {
  const auth = await resolveEventsAuthed(request, { requireManage: true })
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const body = await request.json().catch(() => ({}))
  const raw = body as Record<string, unknown>
  const parsed = parseEventBody(raw)
  if ('error' in parsed) return NextResponse.json({ error: parsed.error }, { status: 400 })

  const payment = parseEventPaymentFromBody(raw, parsed.estimated_value)
  if (payment.uiPaymentStatus === 'partial' && payment.depositAmount <= 0) {
    return NextResponse.json({ error: 'Enter the amount paid for partial payment' }, { status: 400 })
  }

  const guestId =
    raw.guest_id != null && String(raw.guest_id).trim()
      ? String(raw.guest_id).trim()
      : null

  const admin = createAdminClient()
  const now = new Date().toISOString()
  const { data, error } = await admin
    .from('hotel_events')
    .insert({
      organization_id: auth.ctx.organizationId,
      ...parsed,
      payment_method: payment.payment_method,
      payment_status: payment.payment_status,
      amount_paid: payment.amount_paid,
      balance: payment.balance,
      remarks: payment.remarks,
      created_by: auth.ctx.userId,
      updated_by: auth.ctx.userId,
      updated_at: now,
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 400 })

  const side = await recordEventPaymentSideEffects(admin, {
    organizationId: auth.ctx.organizationId,
    userId: auth.ctx.userId,
    eventId: data.id,
    title: data.title,
    clientName: data.client_name,
    venue: data.venue,
    guestId,
    estimatedValue: data.estimated_value,
    paymentMethod: payment.payment_method,
    storedPaymentStatus: payment.payment_status,
    depositAmount: payment.depositAmount,
    balanceAmount: payment.balance,
  })
  if (side.error) {
    return NextResponse.json(
      { event: data, warning: `Event saved but payment ledger failed: ${side.error}` },
      { status: 201 },
    )
  }

  return NextResponse.json({ event: data })
}
