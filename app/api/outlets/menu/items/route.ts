import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { resolveOutletAuthed, resolveOutletMenuManage } from '@/lib/outlets/api-auth'
import { canAccessOutletDepartment } from '@/lib/outlets/access'
import { isOutletDepartmentKey } from '@/lib/outlets/departments'
import { normalizeOutletItemTags } from '@/lib/outlets/item-display'

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams
  const department = params.get('department') || ''
  if (!isOutletDepartmentKey(department)) {
    return NextResponse.json({ error: 'department query required' }, { status: 400 })
  }
  const auth = await resolveOutletAuthed(request, { department })
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const admin = createAdminClient()
  let q = admin
    .from('outlet_menu_items')
    .select('*')
    .eq('organization_id', auth.ctx.organizationId)
    .eq('department', department)
    .order('name')

  const categoryId = params.get('category_id')
  if (categoryId) q = q.eq('category_id', categoryId)
  if (params.get('active_only') === '1') q = q.eq('is_active', true)

  const { data, error } = await q
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json({ items: data ?? [] })
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
  if (department === 'restaurant') {
    return NextResponse.json(
      {
        error:
          'Restaurant menu items are created from Kitchen → New batch only. Use categories here; dishes sync automatically.',
      },
      { status: 403 },
    )
  }
  if (!canAccessOutletDepartment(auth.ctx.role, department)) {
    return NextResponse.json({ error: 'No access to this outlet' }, { status: 403 })
  }

  const unitPrice = Number(body?.unit_price)
  if (!Number.isFinite(unitPrice) || unitPrice < 0) {
    return NextResponse.json({ error: 'Valid unit_price required' }, { status: 400 })
  }

  const admin = createAdminClient()
  const { data, error } = await admin
    .from('outlet_menu_items')
    .insert({
      organization_id: auth.ctx.organizationId,
      department,
      category_id: body?.category_id || null,
      name,
      description: String(body?.description ?? '').trim(),
      unit_price: unitPrice,
      sku: body?.sku || null,
      tags: normalizeOutletItemTags(body?.tags),
      is_active: body?.is_active !== false,
      sort_order: Number(body?.sort_order) || 0,
      service_code: body?.service_code || null,
      price_editable: body?.price_editable === true,
      created_by: auth.ctx.userId,
      updated_by: auth.ctx.userId,
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json({ item: data })
}

export async function PATCH(request: Request) {
  const auth = await resolveOutletMenuManage(request)
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const body = await request.json().catch(() => ({}))
  const id = body?.id as string
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })

  const admin = createAdminClient()
  const { data: existing, error: fe } = await admin
    .from('outlet_menu_items')
    .select('department')
    .eq('id', id)
    .eq('organization_id', auth.ctx.organizationId)
    .single()

  if (fe || !existing) return NextResponse.json({ error: 'Item not found' }, { status: 404 })
  if (!canAccessOutletDepartment(auth.ctx.role, existing.department)) {
    return NextResponse.json({ error: 'No access' }, { status: 403 })
  }

  const patch: Record<string, unknown> = { updated_by: auth.ctx.userId, updated_at: new Date().toISOString() }
  if (body.name != null) patch.name = String(body.name).trim()
  if (body.description != null) patch.description = String(body.description).trim()
  if (body.unit_price != null) patch.unit_price = Number(body.unit_price)
  if (body.category_id !== undefined) patch.category_id = body.category_id || null
  if (body.tags != null) patch.tags = normalizeOutletItemTags(body.tags)
  if (body.is_active != null) patch.is_active = Boolean(body.is_active)
  if (body.sort_order != null) patch.sort_order = Number(body.sort_order)
  if (body.service_code !== undefined) patch.service_code = body.service_code ? String(body.service_code).trim() : null
  if (body.price_editable !== undefined) patch.price_editable = body.price_editable === true

  const { data, error } = await admin
    .from('outlet_menu_items')
    .update(patch)
    .eq('id', id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json({ item: data })
}

export async function DELETE(request: Request) {
  const auth = await resolveOutletMenuManage(request)
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const id = new URL(request.url).searchParams.get('id')?.trim()
  if (!id) return NextResponse.json({ error: 'id query required' }, { status: 400 })

  const admin = createAdminClient()
  const { data: existing, error: fe } = await admin
    .from('outlet_menu_items')
    .select('department')
    .eq('id', id)
    .eq('organization_id', auth.ctx.organizationId)
    .single()

  if (fe || !existing) return NextResponse.json({ error: 'Item not found' }, { status: 404 })
  if (!canAccessOutletDepartment(auth.ctx.role, existing.department)) {
    return NextResponse.json({ error: 'No access' }, { status: 403 })
  }

  const { error } = await admin.from('outlet_menu_items').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json({ ok: true })
}
