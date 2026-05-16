import { createAdminClient } from '@/lib/supabase/admin'
import { NextResponse } from 'next/server'
import { canAccessExpenseMenu, hasPermission } from '@/lib/permissions'
import { ensureExpenseCategories } from '@/lib/expenses/seed-categories'
import { slugifyExpenseCode } from '@/lib/expenses/default-categories'
import { resolveProfileNames } from '@/lib/expenses/resolve-profile-names'

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const callerId = searchParams.get('caller_id')
    if (!callerId) {
      return NextResponse.json({ error: 'caller_id is required' }, { status: 400 })
    }

    const admin = createAdminClient()
    const { data: prof, error: pe } = await admin
      .from('profiles')
      .select('organization_id, role')
      .eq('id', callerId)
      .single()

    if (pe || !prof?.organization_id) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }
    if (!canAccessExpenseMenu(prof.role) || !hasPermission(prof.role, 'expenses:view')) {
      return NextResponse.json({ error: 'No permission' }, { status: 403 })
    }

    await ensureExpenseCategories(admin, prof.organization_id)

    const { data, error } = await admin
      .from('expense_categories')
      .select('id, code, name, sort_order, department_hint, store_outlet, is_active, created_by, updated_by, created_at')
      .eq('organization_id', prof.organization_id)
      .order('sort_order')

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    const userIds = (data || []).flatMap((c) => [c.created_by, c.updated_by].filter(Boolean) as string[])
    const nameMap = await resolveProfileNames(admin, userIds)
    const categories = (data || []).map((c) => ({
      ...c,
      created_by_name: c.created_by ? nameMap[c.created_by] : null,
      updated_by_name: c.updated_by ? nameMap[c.updated_by] : null,
    }))

    return NextResponse.json({ categories })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const { caller_id, name, code, sort_order, department_hint, store_outlet } = body
    if (!caller_id || !String(name || '').trim()) {
      return NextResponse.json({ error: 'caller_id and name are required' }, { status: 400 })
    }

    const admin = createAdminClient()
    const { data: prof } = await admin
      .from('profiles')
      .select('organization_id, role')
      .eq('id', caller_id)
      .single()

    if (
      !prof?.organization_id ||
      !canAccessExpenseMenu(prof.role) ||
      !hasPermission(prof.role, 'expenses:edit')
    ) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const finalCode = String(code || '').trim() || slugifyExpenseCode(name)

    const { data, error } = await admin
      .from('expense_categories')
      .insert([
        {
          organization_id: prof.organization_id,
          code: finalCode,
          name: String(name).trim(),
          sort_order: Number(sort_order) || 500,
          department_hint: department_hint || null,
          store_outlet: store_outlet || null,
          is_active: true,
          created_by: caller_id,
          updated_by: caller_id,
        },
      ])
      .select()
      .single()

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ category: data })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

export async function PATCH(request: Request) {
  try {
    const body = await request.json()
    const { caller_id, category_id, name, is_active, sort_order } = body
    if (!caller_id || !category_id) {
      return NextResponse.json({ error: 'caller_id and category_id required' }, { status: 400 })
    }

    const admin = createAdminClient()
    const { data: prof } = await admin
      .from('profiles')
      .select('organization_id, role')
      .eq('id', caller_id)
      .single()

    if (
      !prof?.organization_id ||
      !canAccessExpenseMenu(prof.role) ||
      !hasPermission(prof.role, 'expenses:edit')
    ) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const patch: Record<string, unknown> = { updated_by: caller_id }
    if (name != null) patch.name = String(name).trim()
    if (is_active != null) patch.is_active = Boolean(is_active)
    if (sort_order != null) patch.sort_order = Number(sort_order)

    const { data, error } = await admin
      .from('expense_categories')
      .update(patch)
      .eq('id', category_id)
      .eq('organization_id', prof.organization_id)
      .select()
      .single()

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ category: data })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

export async function DELETE(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const callerId = searchParams.get('caller_id')
    const categoryId = searchParams.get('category_id')

    if (!callerId || !categoryId) {
      return NextResponse.json({ error: 'caller_id and category_id required' }, { status: 400 })
    }

    const admin = createAdminClient()
    const { data: prof } = await admin
      .from('profiles')
      .select('organization_id, role')
      .eq('id', callerId)
      .single()

    if (
      !prof?.organization_id ||
      !canAccessExpenseMenu(prof.role) ||
      !hasPermission(prof.role, 'expenses:edit')
    ) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const { count } = await admin
      .from('expense_entries')
      .select('id', { count: 'exact', head: true })
      .eq('organization_id', prof.organization_id)
      .eq('category_id', categoryId)

    if ((count ?? 0) > 0) {
      const { data, error } = await admin
        .from('expense_categories')
        .update({ is_active: false, updated_by: callerId })
        .eq('id', categoryId)
        .eq('organization_id', prof.organization_id)
        .select()
        .single()
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
      return NextResponse.json({
        category: data,
        deactivated: true,
        message: 'Category has expense history and was deactivated instead of deleted.',
      })
    }

    const { error } = await admin
      .from('expense_categories')
      .delete()
      .eq('id', categoryId)
      .eq('organization_id', prof.organization_id)

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true, deleted: true })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
