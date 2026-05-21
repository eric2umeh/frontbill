import { createAdminClient } from '@/lib/supabase/admin'
import { canonicalRoleKey, canPrintPaymentReceipt } from '@/lib/receipts/can-print-payment-receipt'
import { NextResponse } from 'next/server'

export async function GET(request: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id: eventId } = await ctx.params
    const callerId = new URL(request.url).searchParams.get('caller_id')
    if (!callerId) {
      return NextResponse.json({ error: 'caller_id is required' }, { status: 400 })
    }

    const admin = createAdminClient()

    const { data: caller, error: callerErr } = await admin
      .from('profiles')
      .select('role, organization_id')
      .eq('id', callerId)
      .single()

    if (callerErr || !caller) {
      return NextResponse.json({ error: 'Caller profile not found' }, { status: 403 })
    }

    if (!canPrintPaymentReceipt(caller.role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const { data: event, error: eventErr } = await admin
      .from('hotel_events')
      .select('organization_id')
      .eq('id', eventId)
      .single()

    if (eventErr || !event?.organization_id) {
      return NextResponse.json({ error: 'Event not found' }, { status: 404 })
    }

    const eventOrgId = event.organization_id as string
    const rk = canonicalRoleKey(caller.role)
    const callerOrgId = caller.organization_id as string | null | undefined
    const isSuperAdmin = rk === 'superadmin'
    const sameTenant = !!callerOrgId && callerOrgId === eventOrgId

    if (!isSuperAdmin && !sameTenant) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const { data: org, error: orgErr } = await admin
      .from('organizations')
      .select('name, address, phone, email')
      .eq('id', eventOrgId)
      .single()

    if (orgErr) {
      return NextResponse.json({ error: orgErr.message }, { status: 500 })
    }

    return NextResponse.json({
      organization_id: eventOrgId,
      hotelName: String(org?.name ?? '').trim(),
      address: org?.address ?? '',
      phone: org?.phone ?? '',
      email: org?.email ?? '',
    })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Server error'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
