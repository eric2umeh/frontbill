import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { hasPermission } from '@/lib/permissions'
import { outletSlugify } from '@/lib/outlets/slug'
import { toTitleCaseWords } from '@/lib/supply-chain/title-case'

export async function POST(request: Request) {
  const cookieSb = await createClient()
  const {
    data: { user },
  } = await cookieSb.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const admin = createAdminClient()
  const { data: profile, error: pe } = await admin
    .from('profiles')
    .select('role, organization_id')
    .eq('id', user.id)
    .single()

  if (pe || !profile?.organization_id) {
    return NextResponse.json({ error: 'Profile not found' }, { status: 403 })
  }

  const role = String(profile.role || '')
  if (
    !hasPermission(role, 'supply:fnb') &&
    !hasPermission(role, 'outlet:menu') &&
    !hasPermission(role, 'supply:store')
  ) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const body = await request.json().catch(() => ({}))
  const itemName = String(body?.itemName || '').trim()
  const categoryIdFromBody = String(body?.categoryId || '').trim()
  const barStockId = String(body?.barStockId || '').trim()
  const unitPrice = Number(body?.unitPrice)

  if (!itemName || !barStockId) {
    return NextResponse.json({ error: 'itemName and barStockId required' }, { status: 400 })
  }
  if (!Number.isFinite(unitPrice) || unitPrice < 0) {
    return NextResponse.json({ error: 'Valid unit_price required' }, { status: 400 })
  }

  const organizationId = profile.organization_id as string
  const department = 'main_bar'
  const serviceCode = `bar:${barStockId}`
  const requestedCategoryName = toTitleCaseWords(String(body?.categoryName || '').trim())

  const { data: categories } = await admin
    .from('outlet_menu_categories')
    .select('id, name, slug')
    .eq('organization_id', organizationId)
    .eq('department', department)

  const { data: existingItems } = await admin
    .from('outlet_menu_items')
    .select('id, name, service_code, category_id')
    .eq('organization_id', organizationId)
    .eq('department', department)

  const nameNorm = itemName.toLowerCase()
  const matchingByName =
    existingItems?.filter((i) => i.name.trim().toLowerCase() === nameNorm) ?? []
  const existing =
    existingItems?.find((i) => i.service_code === serviceCode) ??
    matchingByName[0]

  let categoryId: string | null = null
  if (categoryIdFromBody) {
    categoryId =
      categories?.find((c) => c.id === categoryIdFromBody)?.id ?? null
  }
  if (!categoryId && requestedCategoryName) {
    const categoryNorm = requestedCategoryName.toLowerCase()
    const slug = outletSlugify(requestedCategoryName)
    categoryId =
      categories?.find((c) => c.name.trim().toLowerCase() === categoryNorm)?.id ??
      categories?.find((c) => String(c.slug || '') === slug)?.id ??
      null
  }
  if (!categoryId && existing?.category_id) {
    categoryId = String(existing.category_id)
  }

  if (!categoryId) {
    const categoryName = requestedCategoryName || 'Beverages'
    const slug = outletSlugify(categoryName)
    const existingBySlug =
      categories?.find((c) => String(c.slug || '') === slug)?.id ??
      categories?.find((c) => c.name.trim().toLowerCase() === categoryName.toLowerCase())
        ?.id ??
      null
    if (existingBySlug) {
      categoryId = existingBySlug
    } else {
      const { data: created, error: ce } = await admin
        .from('outlet_menu_categories')
        .insert({
          organization_id: organizationId,
          department,
          name: categoryName,
          slug,
          sort_order: 0,
          created_by: user.id,
          updated_by: user.id,
        })
        .select('id')
        .single()
      if (ce) {
        const isDup =
          ce.code === '23505' ||
          /outlet_menu_categories_organization_id_department_slug/i.test(ce.message || '')
        if (!isDup) return NextResponse.json({ error: ce.message }, { status: 400 })
        const { data: raced } = await admin
          .from('outlet_menu_categories')
          .select('id')
          .eq('organization_id', organizationId)
          .eq('department', department)
          .eq('slug', slug)
          .maybeSingle()
        if (!raced?.id) {
          return NextResponse.json({ error: ce.message }, { status: 400 })
        }
        categoryId = raced.id
      } else {
        categoryId = created.id
      }
    }
  }

  const itemPayload = {
    name: itemName,
    category_id: categoryId,
    unit_price: unitPrice,
    service_code: serviceCode,
    is_active: true,
    updated_by: user.id,
    updated_at: new Date().toISOString(),
  }

  if (existing) {
    const { data: updated, error: ue } = await admin
      .from('outlet_menu_items')
      .update(itemPayload)
      .eq('id', existing.id)
      .select()
      .single()
    if (ue) return NextResponse.json({ error: ue.message }, { status: 400 })

    const duplicateIds = matchingByName
      .map((i) => i.id)
      .filter((id) => id !== existing.id)
    if (duplicateIds.length) {
      await admin
        .from('outlet_menu_items')
        .update({
          is_active: false,
          updated_by: user.id,
          updated_at: new Date().toISOString(),
        })
        .in('id', duplicateIds)
    }

    return NextResponse.json({ item: updated, categoryId, synced: 'updated' })
  }

  const { data: created, error: ie } = await admin
    .from('outlet_menu_items')
    .insert({
      organization_id: organizationId,
      department,
      category_id: categoryId,
      name: itemName,
      description: '',
      unit_price: unitPrice,
      service_code: serviceCode,
      is_active: true,
      sort_order: 0,
      created_by: user.id,
      updated_by: user.id,
    })
    .select()
    .single()

  if (ie) {
    const isDup =
      ie.code === '23505' ||
      /duplicate key|unique constraint/i.test(ie.message || '')
    if (!isDup) return NextResponse.json({ error: ie.message }, { status: 400 })
    const { data: racedItem } = await admin
      .from('outlet_menu_items')
      .select()
      .eq('organization_id', organizationId)
      .eq('department', department)
      .eq('service_code', serviceCode)
      .maybeSingle()
    if (racedItem) {
      const { data: updated, error: ue } = await admin
        .from('outlet_menu_items')
        .update(itemPayload)
        .eq('id', racedItem.id)
        .select()
        .single()
      if (ue) return NextResponse.json({ error: ue.message }, { status: 400 })
      return NextResponse.json({ item: updated, categoryId, synced: 'updated' })
    }
    return NextResponse.json({ error: ie.message }, { status: 400 })
  }
  return NextResponse.json({ item: created, categoryId, synced: 'created' })
}
