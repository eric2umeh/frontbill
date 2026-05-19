import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { resolveOutletAuthed } from '@/lib/outlets/api-auth'
import { canAccessOutletDepartment } from '@/lib/outlets/access'
import { isOutletDepartmentKey } from '@/lib/outlets/departments'
import { flattenSeedCategories } from '@/lib/outlets/default-menu-seed'
import type { OutletDepartmentKey } from '@/lib/outlets/departments'

/** POST — seed default categories for an outlet (idempotent on slug). */
export async function POST(request: Request) {
  const auth = await resolveOutletAuthed(request, { permission: 'outlet:menu' })
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const body = await request.json().catch(() => ({}))
  const department = body?.department as string
  if (!isOutletDepartmentKey(department)) {
    return NextResponse.json({ error: 'department required' }, { status: 400 })
  }
  if (!canAccessOutletDepartment(auth.ctx.role, department)) {
    return NextResponse.json({ error: 'No access' }, { status: 403 })
  }

  const admin = createAdminClient()
  const { data: existing } = await admin
    .from('outlet_menu_categories')
    .select('slug')
    .eq('organization_id', auth.ctx.organizationId)
    .eq('department', department)

  const existingSlugs = new Set((existing ?? []).map((r) => r.slug))
  const tree = flattenSeedCategories(
    department as OutletDepartmentKey,
    auth.ctx.organizationId,
    auth.ctx.userId,
  )

  let inserted = 0
  for (const row of tree) {
    if (existingSlugs.has(row.slug)) continue
    const { data: parent, error: pe } = await admin
      .from('outlet_menu_categories')
      .insert({
        organization_id: row.organization_id,
        department: row.department,
        parent_id: null,
        name: row.name,
        slug: row.slug,
        sort_order: row.sort_order,
        tag_label: row.tag_label,
        created_by: row.created_by,
        updated_by: row.updated_by,
      })
      .select('id')
      .single()
    if (pe) continue
    inserted += 1
    existingSlugs.add(row.slug)

    for (const ch of row._children ?? []) {
      if (existingSlugs.has(ch.slug)) continue
      const { error: ce } = await admin.from('outlet_menu_categories').insert({
        ...ch,
        parent_id: parent.id,
      })
      if (!ce) {
        inserted += 1
        existingSlugs.add(ch.slug)
      }
    }
  }

  return NextResponse.json({ ok: true, inserted })
}
