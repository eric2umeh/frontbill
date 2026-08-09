import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { canonicalRoleKey, hasPermission } from '@/lib/permissions'
import {
  formatPaymentAccountLabel,
  type PaymentAccountKind,
} from '@/lib/payments/payment-accounts'

async function resolveCaller(request: Request) {
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

  return {
    admin,
    userId,
    organizationId: profile.organization_id as string,
    role: profile.role as string,
  }
}

function canManageAccounts(role: string | null | undefined): boolean {
  const k = canonicalRoleKey(role)
  return k === 'superadmin' || hasPermission(role, 'settings:manage')
}

type Ctx = { params: Promise<{ id: string }> }

/** PATCH — update or soft-deactivate. */
export async function PATCH(request: Request, ctx: Ctx) {
  try {
    const caller = await resolveCaller(request)
    if ('error' in caller && caller.error) return caller.error
    const { admin, organizationId, role } = caller
    if (!canManageAccounts(role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const { id } = await ctx.params
    const body = await request.json()
    const updates: Record<string, unknown> = { updated_at: new Date().toISOString() }

    if (body.bank_name != null) updates.bank_name = String(body.bank_name).trim()
    if (body.account_number != null) updates.account_number = String(body.account_number).trim()
    if (body.account_name != null) updates.account_name = String(body.account_name).trim()
    if (body.kind != null) {
      const kind = String(body.kind).trim() as PaymentAccountKind
      if (!['pos', 'transfer', 'both'].includes(kind)) {
        return NextResponse.json({ error: 'Invalid kind' }, { status: 400 })
      }
      updates.kind = kind
    }
    if (body.is_active != null) updates.is_active = Boolean(body.is_active)
    if (body.sort_order != null) updates.sort_order = Number(body.sort_order) || 0

    if (updates.bank_name || updates.account_number || updates.account_name) {
      const { data: existing } = await admin
        .from('payment_accounts')
        .select('bank_name, account_number, account_name')
        .eq('id', id)
        .eq('organization_id', organizationId)
        .maybeSingle()
      updates.label = formatPaymentAccountLabel({
        bank_name: (updates.bank_name as string) || existing?.bank_name,
        account_number: (updates.account_number as string) || existing?.account_number,
        account_name: (updates.account_name as string) || existing?.account_name,
      })
    }

    const { data, error } = await admin
      .from('payment_accounts')
      .update(updates)
      .eq('id', id)
      .eq('organization_id', organizationId)
      .select('*')
      .single()

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ account: data })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to update payment account'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

/** DELETE — hard delete (prefer soft-deactivate via PATCH is_active=false). */
export async function DELETE(request: Request, ctx: Ctx) {
  try {
    const caller = await resolveCaller(request)
    if ('error' in caller && caller.error) return caller.error
    const { admin, organizationId, role } = caller
    if (!canManageAccounts(role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const { id } = await ctx.params
    const { error } = await admin
      .from('payment_accounts')
      .delete()
      .eq('id', id)
      .eq('organization_id', organizationId)

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to delete payment account'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
