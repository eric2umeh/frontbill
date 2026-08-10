import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { hasPermission } from '@/lib/permissions'

type RouteCtx = { params: Promise<{ id: string }> }

/**
 * DELETE — remove a transactions or payments row (admin client bypasses missing RLS DELETE).
 * City ledger guest payments only live in `transactions`, not `payments`.
 */
export async function DELETE(request: Request, ctx: RouteCtx) {
  try {
    const { id } = await ctx.params
    if (!id) {
      return NextResponse.json({ error: 'Transaction id required' }, { status: 400 })
    }

    const cookieSb = await createClient()
    const {
      data: { user },
    } = await cookieSb.auth.getUser()
    if (!user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const admin = createAdminClient()
    const { data: profile, error: pe } = await admin
      .from('profiles')
      .select('role, organization_id')
      .eq('id', user.id)
      .single()

    if (pe || !profile?.organization_id) {
      return NextResponse.json({ error: 'Profile not found' }, { status: 403 })
    }

    const role = profile.role ?? ''
    if (
      !hasPermission(role, 'transactions:delete') &&
      !hasPermission(role, 'payments:refund') &&
      role !== 'admin' &&
      role !== 'superadmin'
    ) {
      return NextResponse.json(
        { error: 'You do not have permission to delete transactions' },
        { status: 403 },
      )
    }

    const orgId = profile.organization_id

    const { data: txRow } = await admin
      .from('transactions')
      .select('id, organization_id')
      .eq('id', id)
      .maybeSingle()

    if (txRow) {
      if (String(txRow.organization_id) !== String(orgId) && role !== 'superadmin') {
        return NextResponse.json({ error: 'Transaction not found' }, { status: 404 })
      }
      const { error: delErr } = await admin.from('transactions').delete().eq('id', id)
      if (delErr) {
        return NextResponse.json({ error: delErr.message }, { status: 400 })
      }
      return NextResponse.json({ ok: true, source: 'transaction' })
    }

    const { data: payRow } = await admin
      .from('payments')
      .select('id, organization_id')
      .eq('id', id)
      .maybeSingle()

    if (payRow) {
      if (String(payRow.organization_id) !== String(orgId) && role !== 'superadmin') {
        return NextResponse.json({ error: 'Transaction not found' }, { status: 404 })
      }
      const { error: delErr } = await admin.from('payments').delete().eq('id', id)
      if (delErr) {
        return NextResponse.json({ error: delErr.message }, { status: 400 })
      }
      return NextResponse.json({ ok: true, source: 'payment' })
    }

    return NextResponse.json(
      { error: 'Transaction was not found or could not be deleted' },
      { status: 404 },
    )
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Delete failed'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
