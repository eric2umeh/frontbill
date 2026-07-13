import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { hasPermission } from '@/lib/permissions'
import {
  getGuestCashbackBalance,
  recordCashbackAdjust,
  recordCashbackEarn,
  recordCashbackRedeem,
} from '@/lib/cashback/cashback-service'
import { groupEarnTransactionsByRate } from '@/lib/cashback/cashback-earn-breakdown'
import {
  isSupportedCashbackEarnSourceType,
  remainingCashbackEarnPaymentBase,
} from '@/lib/cashback/earn-source-verification'

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
  if (!authed) return null
  const admin = createAdminClient()
  const { data: profile } = await admin
    .from('profiles')
    .select('role, organization_id')
    .eq('id', authed)
    .single()
  if (!profile?.organization_id) return null
  return { userId: authed, role: profile.role ?? '', organizationId: profile.organization_id }
}

async function resolveVerifiedEarnablePaymentAmount(
  admin: ReturnType<typeof createAdminClient>,
  input: {
    organizationId: string
    guestId: string
    sourceType: string
    sourceId: string
    paymentMethod: string
  },
) {
  const sourceType = input.sourceType.trim()
  const sourceId = input.sourceId.trim()
  if (!isSupportedCashbackEarnSourceType(sourceType) || !sourceId) {
    throw new Error('Verified payment source required')
  }

  const { data: booking, error: bookingError } = await admin
    .from('bookings')
    .select('id')
    .eq('id', sourceId)
    .eq('organization_id', input.organizationId)
    .eq('guest_id', input.guestId)
    .maybeSingle()

  if (bookingError) throw new Error(bookingError.message)
  if (!booking) throw new Error('Verified payment source not found')

  const { data: folioRows, error: folioError } = await admin
    .from('folio_charges')
    .select('amount, charge_type, payment_method')
    .eq('booking_id', sourceId)

  if (folioError) throw new Error(folioError.message)

  const { data: earnedRows, error: earnedError } = await admin
    .from('cashback_transactions')
    .select('amount, earn_rate_percent')
    .eq('organization_id', input.organizationId)
    .eq('guest_id', input.guestId)
    .eq('txn_type', 'earn')
    .eq('source_id', sourceId)

  if (earnedError) throw new Error(earnedError.message)

  return remainingCashbackEarnPaymentBase({
    folioRows: folioRows ?? [],
    cashbackTransactions: earnedRows ?? [],
    paymentMethod: input.paymentMethod,
  })
}

/** GET — guest cashback balance + recent transactions. */
export async function GET(request: Request, ctx: RouteCtx) {
  try {
    const { id: guestId } = await ctx.params
    const caller = await resolveCaller(request)
    if (!caller) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (!hasPermission(caller.role, 'cashback:view')) {
      return NextResponse.json({ error: 'Permission denied' }, { status: 403 })
    }

    const admin = createAdminClient()
    const { data: guest } = await admin
      .from('guests')
      .select('id, name')
      .eq('id', guestId)
      .eq('organization_id', caller.organizationId)
      .maybeSingle()

    if (!guest) return NextResponse.json({ error: 'Guest not found' }, { status: 404 })

    const balance = await getGuestCashbackBalance(admin, caller.organizationId, guestId)
    const { data: txns } = await admin
      .from('cashback_transactions')
      .select('*')
      .eq('organization_id', caller.organizationId)
      .eq('guest_id', guestId)
      .order('created_at', { ascending: false })
      .limit(50)

    return NextResponse.json({
      guest,
      balance: balance ?? { guestId, earnedTotal: 0, redeemedTotal: 0, balance: 0 },
      transactions: txns ?? [],
      earnByRate: groupEarnTransactionsByRate(txns ?? []),
    })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to load cashback'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

/** POST — earn, redeem, or adjust cashback. Body: { action, amount?, payment_method?, source_type?, source_id?, description? } */
export async function POST(request: Request, ctx: RouteCtx) {
  try {
    const { id: guestId } = await ctx.params
    const body = await request.json().catch(() => ({}))
    const action = String(body?.action || '').trim().toLowerCase()
    const caller = await resolveCaller(request)
    if (!caller) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const admin = createAdminClient()
    const { data: guest } = await admin
      .from('guests')
      .select('id')
      .eq('id', guestId)
      .eq('organization_id', caller.organizationId)
      .maybeSingle()

    if (!guest) return NextResponse.json({ error: 'Guest not found' }, { status: 404 })

    if (action === 'earn') {
      if (!hasPermission(caller.role, 'payments:create')) {
        return NextResponse.json({ error: 'Permission denied' }, { status: 403 })
      }
      const amount = Number(body?.amount)
      const paymentMethod = String(body?.payment_method || '').trim()
      if (!Number.isFinite(amount) || amount <= 0 || !paymentMethod) {
        return NextResponse.json({ error: 'amount and payment_method required' }, { status: 400 })
      }
      const sourceType = String(body?.source_type || '').trim()
      const sourceId = String(body?.source_id || '').trim()
      const remainingVerifiedPaymentAmount = await resolveVerifiedEarnablePaymentAmount(admin, {
        organizationId: caller.organizationId,
        guestId,
        sourceType,
        sourceId,
        paymentMethod,
      })
      if (amount > remainingVerifiedPaymentAmount + 0.01) {
        return NextResponse.json(
          { error: 'Cashback earn amount exceeds verified payment amount' },
          { status: 400 },
        )
      }
      const result = await recordCashbackEarn(admin, {
        organizationId: caller.organizationId,
        guestId,
        paymentAmount: amount,
        paymentMethod,
        userId: caller.userId,
        sourceType,
        sourceId,
        description: body?.description,
      })
      return NextResponse.json({ ok: true, ...result })
    }

    if (action === 'redeem') {
      if (!hasPermission(caller.role, 'payments:create')) {
        return NextResponse.json({ error: 'Permission denied' }, { status: 403 })
      }
      const amount = Number(body?.amount)
      if (!Number.isFinite(amount) || amount <= 0) {
        return NextResponse.json({ error: 'amount required' }, { status: 400 })
      }
      const result = await recordCashbackRedeem(admin, {
        organizationId: caller.organizationId,
        guestId,
        amount,
        userId: caller.userId,
        sourceType: body?.source_type,
        sourceId: body?.source_id,
        description: body?.description,
      })
      return NextResponse.json({ ok: true, ...result })
    }

    if (action === 'adjust') {
      if (!hasPermission(caller.role, 'cashback:manage')) {
        return NextResponse.json({ error: 'Permission denied' }, { status: 403 })
      }
      const delta = Number(body?.delta)
      if (!Number.isFinite(delta) || delta === 0) {
        return NextResponse.json({ error: 'delta required' }, { status: 400 })
      }
      const result = await recordCashbackAdjust(admin, {
        organizationId: caller.organizationId,
        guestId,
        delta,
        userId: caller.userId,
        description: body?.description,
      })
      return NextResponse.json({ ok: true, ...result })
    }

    return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Cashback action failed'
    return NextResponse.json({ error: message }, { status: 400 })
  }
}
