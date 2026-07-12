import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { hasPermission } from '@/lib/permissions'
import { markBookingNoShow } from '@/lib/reservations/mark-no-show'

type RouteCtx = { params: Promise<{ id: string }> }

async function resolveAuthedUserId(request: Request): Promise<string | null> {
  const cookieSb = await createClient()
  const {
    data: { user },
  } = await cookieSb.auth.getUser()
  if (user?.id) return user.id
  const raw = request.headers.get('authorization')?.trim()
  const bearer = raw?.toLowerCase().startsWith('bearer ') ? raw.slice(7).trim() : null
  if (!bearer) return null
  try {
    const admin = createAdminClient()
    const { data, error } = await admin.auth.getUser(bearer)
    if (error || !data.user?.id) return null
    return data.user.id
  } catch {
    return null
  }
}

/** POST — mark a reserved/confirmed booking as no-show and post the policy fee. */
export async function POST(request: Request, ctx: RouteCtx) {
  try {
    const { id: bookingId } = await ctx.params
    const body = await request.json().catch(() => ({}))
    const callerId = String(body?.caller_id || '').trim()
    const feeOverride =
      body?.fee_override != null ? Number(body.fee_override) : undefined
    const notes = typeof body?.notes === 'string' ? body.notes : undefined

    const authed = await resolveAuthedUserId(request)
    if (!authed || (callerId && authed !== callerId)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const admin = createAdminClient()
    const { data: profile, error: pe } = await admin
      .from('profiles')
      .select('role, organization_id')
      .eq('id', authed)
      .single()

    if (pe || !profile?.organization_id) {
      return NextResponse.json({ error: 'Profile not found' }, { status: 403 })
    }

    if (
      !hasPermission(profile.role, 'reservations:edit') &&
      !hasPermission(profile.role, 'bookings:edit')
    ) {
      return NextResponse.json({ error: 'Permission denied' }, { status: 403 })
    }

    const { data, error } = await markBookingNoShow(admin, {
      bookingId,
      organizationId: profile.organization_id,
      userId: authed,
      feeOverride: Number.isFinite(feeOverride) ? feeOverride : null,
      notes,
    })

    if (error) {
      return NextResponse.json({ error }, { status: 400 })
    }

    return NextResponse.json({ ok: true, ...data })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'No-show failed'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
