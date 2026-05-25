import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { hasPermission } from '@/lib/permissions'
import { repairStaleGuestDebt } from '@/lib/utils/guest-city-ledger'

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

/** POST — force-clear stale folio + city ledger balances for a guest (admin). */
export async function POST(request: Request, ctx: RouteCtx) {
  try {
    const { id: guestId } = await ctx.params
    const body = await request.json().catch(() => ({}))
    const callerId = String(body?.caller_id || '').trim()

    if (!callerId) {
      return NextResponse.json({ error: 'caller_id is required' }, { status: 400 })
    }

    const authed = await resolveAuthedUserId(request)
    if (!authed || authed !== callerId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const admin = createAdminClient()
    const { data: callerProfile, error: ce } = await admin
      .from('profiles')
      .select('role, organization_id')
      .eq('id', callerId)
      .single()

    if (ce || !callerProfile?.organization_id) {
      return NextResponse.json({ error: 'Caller profile not found' }, { status: 403 })
    }

    const role = callerProfile.role ?? ''
    if (
      !hasPermission(role, 'ledger:manage') &&
      !hasPermission(role, 'guests:edit')
    ) {
      return NextResponse.json(
        { error: 'You do not have permission to repair guest balances' },
        { status: 403 },
      )
    }

    const { data: guestRow, error: ge } = await admin
      .from('guests')
      .select('id, name, organization_id')
      .eq('id', guestId)
      .single()

    if (ge || !guestRow || guestRow.organization_id !== callerProfile.organization_id) {
      return NextResponse.json({ error: 'Guest not found' }, { status: 404 })
    }

    const result = await repairStaleGuestDebt(admin, {
      organizationId: callerProfile.organization_id,
      guestId: guestRow.id,
      guestName: guestRow.name,
    })

    return NextResponse.json({ ok: true, ...result })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Repair failed'
    return NextResponse.json({ error: msg }, { status: 400 })
  }
}
