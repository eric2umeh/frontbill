import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { resolveOutletAuthed } from '@/lib/outlets/api-auth'
import { canAccessOutletDepartment } from '@/lib/outlets/access'
import { outletSlugify } from '@/lib/outlets/slug'
import { isOutletDepartmentKey } from '@/lib/outlets/departments'

export async function GET(request: Request) {
  const department = new URL(request.url).searchParams.get('department') || ''
  if (!isOutletDepartmentKey(department)) {
    return NextResponse.json({ error: 'department query required' }, { status: 400 })
  }
  const auth = await resolveOutletAuthed(request, { department })
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const admin = createAdminClient()
  const { data, error } = await admin
    .from('outlet_menu_categories')
    .select('*')
    .eq('organization_id', auth.ctx.organizationId)
    .eq('department', department)
    .order('sort_order')
    .order('name')

  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json({ categories: data ?? [] })
}

export async function POST(request: Request) {
  const auth = await resolveOutletAuthed(request, { permission: 'outlet:menu' })
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const body = await request.json().catch(() => ({}))
  const department = body?.department as string
  const name = String(body?.name || '').trim()
  if (!isOutletDepartmentKey(department) || !name) {
    return NextResponse.json({ error: 'department and name required' }, { status: 400 })
  }
  if (!canAccessOutletDepartment(auth.ctx.role, department)) {
    return NextResponse.json({ error: 'No access to this outlet' }, { status: 403 })
  }

  const admin = createAdminClient()
  const slug = String(body?.slug || outletSlugify(name))
  const { data, error } = await admin
    .from('outlet_menu_categories')
    .insert({
      organization_id: auth.ctx.organizationId,
      department,
      parent_id: body?.parent_id || null,
      name,
      slug,
      sort_order: Number(body?.sort_order) || 0,
      tag_label: body?.tag_label || null,
      created_by: auth.ctx.userId,
      updated_by: auth.ctx.userId,
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json({ category: data })
}
