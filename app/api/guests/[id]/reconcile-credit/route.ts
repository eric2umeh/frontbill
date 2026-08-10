import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { hasPermission } from '@/lib/permissions'
import { reconcileGuestPrepaidCredit } from '@/lib/utils/guest-city-ledger'

type RouteCtx = { params: Promise<{ id: string }> }

/** POST — restore prepaid city-ledger credit when cash-in exceeds deposits but balance is ₦0. */
export async function POST(request: Request, ctx: RouteCtx) {
  try {
    const { id: guestId } = await ctx.params
    const body = await request.json().catch(() => ({}))
    const callerId = String(body?.caller_id || '').trim()

    const cookieSb = await createClient()
    const {
      data: { user },
    } = await cookieSb.auth.getUser()
    const authed = user?.id
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

    const role = profile.role ?? ''
    if (
      !hasPermission(role, 'ledger:manage') &&
      !hasPermission(role, 'payments:create') &&
      !hasPermission(role, 'guests:view')
    ) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const { data: guestRow, error: ge } = await admin
      .from('guests')
      .select('id, name, organization_id')
      .eq('id', guestId)
      .single()

    if (ge || !guestRow || guestRow.organization_id !== profile.organization_id) {
      return NextResponse.json({ error: 'Guest not found' }, { status: 404 })
    }

    const result = await reconcileGuestPrepaidCredit(admin, {
      organizationId: profile.organization_id,
      guestName: guestRow.name,
      guestId: guestRow.id,
    })

    return NextResponse.json({ ok: true, ...result })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Reconcile failed'
    return NextResponse.json({ error: msg }, { status: 400 })
  }
}
