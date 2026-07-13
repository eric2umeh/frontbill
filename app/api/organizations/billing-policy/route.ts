import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { hasPermission } from '@/lib/permissions'
import {
  fetchNoShowPolicy,
  isNoShowPolicyColumnError,
  type NoShowPolicy,
} from '@/lib/reservations/no-show-policy'

async function resolveAuthedProfile(request: Request) {
  const cookieSb = await createClient()
  const {
    data: { user },
  } = await cookieSb.auth.getUser()

  let userId = user?.id ?? null
  const admin = createAdminClient()

  if (!userId) {
    const raw = request.headers.get('authorization')?.trim()
    const bearer = raw?.toLowerCase().startsWith('bearer ') ? raw.slice(7).trim() : null
    if (!bearer) return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }
    const { data, error } = await admin.auth.getUser(bearer)
    if (error || !data.user?.id) {
      return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }
    }
    userId = data.user.id
  }

  const { data: profile, error: pe } = await admin
    .from('profiles')
    .select('role, organization_id')
    .eq('id', userId)
    .single()

  if (pe || !profile?.organization_id) {
    return { error: NextResponse.json({ error: 'Profile not found' }, { status: 403 }) }
  }

  return { admin, userId, organizationId: profile.organization_id as string, role: profile.role }
}

function policyToJson(policy: NoShowPolicy, dbAvailable: boolean) {
  return {
    dbAvailable,
    policy: {
      feeMode: policy.feeMode,
      feePercent: policy.feePercent,
      feeFlatAmount: policy.feeFlatAmount,
    },
    no_show_fee_mode: policy.feeMode,
    no_show_fee_percent: policy.feePercent,
    no_show_fee_flat_amount: policy.feeFlatAmount,
  }
}

/** GET — no-show billing policy for the caller's hotel (service role read). */
export async function GET(request: Request) {
  try {
    const caller = await resolveAuthedProfile(request)
    if ('error' in caller && caller.error) return caller.error

    const { admin, organizationId } = caller
    const { data: row, error: probeErr } = await admin
      .from('organizations')
      .select(
        'no_show_fee_mode, no_show_fee_percent, no_show_fee_flat_amount, cashback_enabled, cashback_percent',
      )
      .eq('id', organizationId)
      .maybeSingle()

    const dbAvailable = !probeErr || !isNoShowPolicyColumnError(probeErr)
    const policy = await fetchNoShowPolicy(admin, organizationId)

    return NextResponse.json({
      ...policyToJson(policy, dbAvailable),
      cashback_enabled: row?.cashback_enabled !== false,
      cashback_percent: Number(row?.cashback_percent ?? 2),
      usingDefaultPolicy: !dbAvailable,
    })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to load billing policy'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

/** PUT — save no-show + cashback policy (settings:manage). */
export async function PUT(request: Request) {
  try {
    const caller = await resolveAuthedProfile(request)
    if ('error' in caller && caller.error) return caller.error

    const { admin, organizationId, role } = caller
    if (!hasPermission(role, 'settings:manage')) {
      return NextResponse.json({ error: 'Permission denied' }, { status: 403 })
    }

    const body = await request.json().catch(() => ({}))
    const mode = String(body?.no_show_fee_mode || body?.feeMode || 'percent')
    const feeMode =
      mode === 'flat_night' || mode === 'flat_stay' ? mode : 'percent'
    const feePercent = Math.max(
      0,
      Math.min(100, parseFloat(String(body?.no_show_fee_percent ?? body?.feePercent ?? 100)) || 100),
    )
    const flatRaw = body?.no_show_fee_flat_amount ?? body?.feeFlatAmount
    const feeFlat =
      flatRaw === null || flatRaw === '' || flatRaw === undefined
        ? null
        : Math.max(0, parseFloat(String(flatRaw)) || 0)

    const patch: Record<string, unknown> = {
      no_show_fee_mode: feeMode,
      no_show_fee_percent: feePercent,
      no_show_fee_flat_amount: feeFlat,
    }

    if (body?.cashback_enabled !== undefined) {
      patch.cashback_enabled = Boolean(body.cashback_enabled)
    }
    if (body?.cashback_percent !== undefined) {
      patch.cashback_percent = Math.max(0, parseFloat(String(body.cashback_percent)) || 0)
    }

    const { error } = await admin.from('organizations').update(patch).eq('id', organizationId)
    if (error) {
      if (isNoShowPolicyColumnError(error)) {
        return NextResponse.json(
          {
            error:
              'Run scripts/073_no_show_cashback_policy.sql in Supabase SQL editor first.',
          },
          { status: 400 },
        )
      }
      return NextResponse.json({ error: error.message }, { status: 400 })
    }

    const policy = await fetchNoShowPolicy(admin, organizationId)
    return NextResponse.json({ ok: true, ...policyToJson(policy, true) })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to save billing policy'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
