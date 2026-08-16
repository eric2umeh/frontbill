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
  const categoryName = toTitleCaseWords(String(body?.categoryName || '').trim() || 'Beverages')
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

  const { data: categories } = await admin
    .from('outlet_menu_categories')
    .select('id, name')
    .eq('organization_id', organizationId)
    .eq('department', department)

  const categoryNorm = categoryName.toLowerCase()
  let categoryId =
    categories?.find((c) => c.name.trim().toLowerCase() === categoryNorm)?.id ?? null

  if (!categoryId) {
    const { data: created, error: ce } = await admin
      .from('outlet_menu_categories')
      .insert({
        organization_id: organizationId,
        department,
        name: categoryName,
        slug: outletSlugify(categoryName),
        sort_order: 0,
        created_by: user.id,
        updated_by: user.id,
      })
      .select('id')
      .single()
    if (ce) return NextResponse.json({ error: ce.message }, { status: 400 })
    categoryId = created.id
  }

  const { data: existingItems } = await admin
    .from('outlet_menu_items')
    .select('id, name, service_code')
    .eq('organization_id', organizationId)
    .eq('department', department)

  const nameNorm = itemName.toLowerCase()
  const existing =
    existingItems?.find((i) => i.service_code === serviceCode) ??
    existingItems?.find((i) => i.name.trim().toLowerCase() === nameNorm)

  if (existing) {
    const { data: updated, error: ue } = await admin
      .from('outlet_menu_items')
      .update({
        name: itemName,
        category_id: categoryId,
        unit_price: unitPrice,
        service_code: serviceCode,
        is_active: true,
        updated_by: user.id,
        updated_at: new Date().toISOString(),
      })
      .eq('id', existing.id)
      .select()
      .single()
    if (ue) return NextResponse.json({ error: ue.message }, { status: 400 })
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

  if (ie) return NextResponse.json({ error: ie.message }, { status: 400 })
  return NextResponse.json({ item: created, categoryId, synced: 'created' })
}
