import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { resolveOutletAuthed, resolveOutletMenuManage } from '@/lib/outlets/api-auth'
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
    .order('name')

  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json({ categories: data ?? [] })
}

export async function POST(request: Request) {
  const auth = await resolveOutletMenuManage(request)
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

export async function PATCH(request: Request) {
  const auth = await resolveOutletMenuManage(request)
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const body = await request.json().catch(() => ({}))
  const id = body?.id as string
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })

  const admin = createAdminClient()
  const { data: existing, error: fe } = await admin
    .from('outlet_menu_categories')
    .select('department, organization_id')
    .eq('id', id)
    .eq('organization_id', auth.ctx.organizationId)
    .single()

  if (fe || !existing) return NextResponse.json({ error: 'Category not found' }, { status: 404 })
  if (!canAccessOutletDepartment(auth.ctx.role, existing.department)) {
    return NextResponse.json({ error: 'No access' }, { status: 403 })
  }

  const patch: Record<string, unknown> = {
    updated_by: auth.ctx.userId,
    updated_at: new Date().toISOString(),
  }
  if (body.name != null) {
    const name = String(body.name).trim()
    if (!name) return NextResponse.json({ error: 'name cannot be empty' }, { status: 400 })
    patch.name = name
    if (body.slug == null) patch.slug = outletSlugify(name)
  }
  if (body.slug != null) patch.slug = String(body.slug).trim() || outletSlugify(String(patch.name || ''))
  if (body.parent_id !== undefined) patch.parent_id = body.parent_id || null
  if (body.sort_order != null) patch.sort_order = Number(body.sort_order)
  if (body.tag_label !== undefined) patch.tag_label = body.tag_label || null

  const { data, error } = await admin
    .from('outlet_menu_categories')
    .update(patch)
    .eq('id', id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json({ category: data })
}

export async function DELETE(request: Request) {
  const auth = await resolveOutletMenuManage(request)
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const id = new URL(request.url).searchParams.get('id')?.trim()
  if (!id) return NextResponse.json({ error: 'id query required' }, { status: 400 })

  const admin = createAdminClient()
  const { data: existing, error: fe } = await admin
    .from('outlet_menu_categories')
    .select('department')
    .eq('id', id)
    .eq('organization_id', auth.ctx.organizationId)
    .single()

  if (fe || !existing) return NextResponse.json({ error: 'Category not found' }, { status: 404 })
  if (!canAccessOutletDepartment(auth.ctx.role, existing.department)) {
    return NextResponse.json({ error: 'No access' }, { status: 403 })
  }

  const { error } = await admin.from('outlet_menu_categories').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json({ ok: true })
}
