import { createAdminClient } from '@/lib/supabase/admin'
import { canonicalRoleKey } from '@/lib/permissions'
import { NextResponse } from 'next/server'

/** Receipt header uses org legal/property branding; anon client reads are often blocked by RLS/embed quirks. */
export async function GET(request: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id: bookingId } = await ctx.params
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

    const { data: booking, error: bookingErr } = await admin
      .from('bookings')
      .select('organization_id')
      .eq('id', bookingId)
      .single()

    if (bookingErr || !booking?.organization_id) {
      return NextResponse.json({ error: 'Booking not found' }, { status: 404 })
    }

    const bookingOrgId = booking.organization_id as string
    const rk = canonicalRoleKey(caller.role)
    const callerOrgId = caller.organization_id as string | null | undefined

    const isSuperAdmin = rk === 'superadmin'
    const sameTenant = !!callerOrgId && callerOrgId === bookingOrgId

    if (!isSuperAdmin && !sameTenant) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const { data: org, error: orgErr } = await admin
      .from('organizations')
      .select('name, address, phone, email')
      .eq('id', bookingOrgId)
      .single()

    if (orgErr) {
      return NextResponse.json({ error: orgErr.message }, { status: 500 })
    }

    return NextResponse.json({
      organization_id: bookingOrgId,
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
