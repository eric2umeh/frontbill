import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { hasPermission } from '@/lib/permissions'
import {
  guestFolioOutstandingTotal,
  recordGuestLedgerCashMovement,
} from '@/lib/utils/guest-city-ledger'

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

/** POST — settle or top-up a guest city ledger (admin client for reliable folio writes). */
export async function POST(request: Request, ctx: RouteCtx) {
  try {
    const { id: guestId } = await ctx.params
    const body = await request.json().catch(() => ({}))
    const callerId = String(body?.caller_id || '').trim()
    const amount = Number(body?.amount)
    const paymentMethod = String(body?.payment_method || '').trim()
    const notes = typeof body?.notes === 'string' ? body.notes : ''
    const transactionType = String(body?.transaction_type || 'City Ledger Settlement').trim()
    const ledgerAccountId =
      body?.ledger_account_id != null ? String(body.ledger_account_id) : null
    const currentLedgerBalance = Number(body?.current_ledger_balance ?? 0)

    if (!callerId || !paymentMethod || !Number.isFinite(amount) || amount <= 0) {
      return NextResponse.json(
        { error: 'caller_id, amount, and payment_method are required' },
        { status: 400 },
      )
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
      !hasPermission(role, 'payments:create')
    ) {
      return NextResponse.json(
        { error: 'You do not have permission to record ledger payments' },
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

    const folioBefore = await guestFolioOutstandingTotal(
      admin,
      guestRow.id,
      callerProfile.organization_id,
    )

    await recordGuestLedgerCashMovement(admin, {
      organizationId: callerProfile.organization_id,
      accountName: guestRow.name,
      guestId: guestRow.id,
      amount,
      paymentMethod,
      notes,
      transactionType,
      userId: callerId,
      ledgerAccountId,
      currentLedgerBalance,
      syncGuestProfile: true,
    })

    const folioAfter = await guestFolioOutstandingTotal(
      admin,
      guestRow.id,
      callerProfile.organization_id,
    )

    return NextResponse.json({
      ok: true,
      folio_before: folioBefore,
      folio_after: folioAfter,
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Payment failed'
    return NextResponse.json({ error: msg }, { status: 400 })
  }
}
