import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { resolveOutletAuthed } from '@/lib/outlets/api-auth'
import { isOutletDepartmentKey } from '@/lib/outlets/departments'
import { canonicalRoleKey } from '@/lib/permissions'

/** DELETE all outlet orders for a department (admin / superadmin only). */
export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}))
  const department = String(body?.department || '')
  if (!isOutletDepartmentKey(department)) {
    return NextResponse.json({ error: 'department required' }, { status: 400 })
  }

  const auth = await resolveOutletAuthed(request, {
    department,
    permission: 'outlet:edit',
  })
  if ('error' in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status })
  }

  const roleKey = canonicalRoleKey(auth.ctx.role)
  if (roleKey !== 'admin' && roleKey !== 'superadmin') {
    return NextResponse.json(
      { error: 'Only Administrator or Superadmin can clear all outlet orders' },
      { status: 403 },
    )
  }

  const admin = createAdminClient()
  const { data: orders, error: listErr } = await admin
    .from('outlet_orders')
    .select('id')
    .eq('organization_id', auth.ctx.organizationId)
    .eq('department', department)

  if (listErr) {
    return NextResponse.json({ error: listErr.message }, { status: 400 })
  }

  const ids = (orders ?? []).map((o) => o.id)
  if (!ids.length) {
    return NextResponse.json({ ok: true, deleted: 0 })
  }

  const { error: lineErr } = await admin
    .from('outlet_order_lines')
    .delete()
    .in('order_id', ids)
  if (lineErr) {
    return NextResponse.json({ error: lineErr.message }, { status: 400 })
  }

  const { error: orderErr } = await admin
    .from('outlet_orders')
    .delete()
    .eq('organization_id', auth.ctx.organizationId)
    .eq('department', department)
  if (orderErr) {
    return NextResponse.json({ error: orderErr.message }, { status: 400 })
  }

  return NextResponse.json({ ok: true, deleted: ids.length })
}
