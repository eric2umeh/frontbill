import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { hasPermission } from '@/lib/permissions'
import { markBookingNoShow } from '@/lib/reservations/mark-no-show'
import {
  calculateNoShowFee,
  describeNoShowPolicy,
  fetchNoShowPolicy,
  isNoShowPolicyColumnError,
} from '@/lib/reservations/no-show-policy'

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

async function resolveCaller(request: Request) {
  const authed = await resolveAuthedUserId(request)
  if (!authed) return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }

  const admin = createAdminClient()
  const { data: profile, error: pe } = await admin
    .from('profiles')
    .select('role, organization_id')
    .eq('id', authed)
    .single()

  if (pe || !profile?.organization_id) {
    return { error: NextResponse.json({ error: 'Profile not found' }, { status: 403 }) }
  }

  if (
    !hasPermission(profile.role, 'reservations:edit') &&
    !hasPermission(profile.role, 'bookings:edit')
  ) {
    return { error: NextResponse.json({ error: 'Permission denied' }, { status: 403 }) }
  }

  return { authed, admin, organizationId: profile.organization_id as string }
}

/** GET — preview no-show policy and suggested fee for a booking. */
export async function GET(request: Request, ctx: RouteCtx) {
  try {
    const { id: bookingId } = await ctx.params
    const caller = await resolveCaller(request)
    if ('error' in caller && caller.error) return caller.error

    const { admin, organizationId } = caller
    const { data: booking, error: be } = await admin
      .from('bookings')
      .select(
        'id, rate_per_night, total_amount, check_in, check_out, number_of_nights',
      )
      .eq('id', bookingId)
      .eq('organization_id', organizationId)
      .maybeSingle()

    if (be) return NextResponse.json({ error: be.message }, { status: 400 })
    if (!booking) return NextResponse.json({ error: 'Booking not found' }, { status: 404 })

    const policy = await fetchNoShowPolicy(admin, organizationId)
    const suggestedFee = calculateNoShowFee(policy, booking)
    const policyLabel = describeNoShowPolicy(policy)

    const { error: policyReadErr } = await admin
      .from('organizations')
      .select('no_show_fee_percent')
      .eq('id', organizationId)
      .maybeSingle()

    const usingDefaultPolicy =
      Boolean(policyReadErr) && isNoShowPolicyColumnError(policyReadErr)

    return NextResponse.json({
      policyLabel,
      suggestedFee,
      policy,
      usingDefaultPolicy,
    })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to load no-show policy'
    return NextResponse.json({ error: message }, { status: 500 })
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

    const caller = await resolveCaller(request)
    if ('error' in caller && caller.error) return caller.error
    const { authed, admin, organizationId } = caller

    if (callerId && authed !== callerId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { data, error } = await markBookingNoShow(admin, {
      bookingId,
      organizationId,
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
