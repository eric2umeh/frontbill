import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { hasPermission } from '@/lib/permissions'
import { outletSlugify } from '@/lib/outlets/slug'
import type { BatchOutletMenuSync } from '@/lib/supply-chain/batch-outlet-sync'

async function upsertKitchenMenuItem(
  admin: ReturnType<typeof createAdminClient>,
  organizationId: string,
  userId: string,
  department: 'restaurant' | 'main_bar',
  batchName: string,
  categoryName: string,
  kitchenStockId: string,
  unitPrice: number,
  menuItemId: string | null,
) {
  const serviceCode = `ks:${kitchenStockId}`

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
        created_by: userId,
        updated_by: userId,
      })
      .select('id')
      .single()
    if (ce) return { error: ce.message }
    categoryId = created.id
  }

  const { data: existingItems } = await admin
    .from('outlet_menu_items')
    .select('id, name, service_code')
    .eq('organization_id', organizationId)
    .eq('department', department)

  const nameNorm = batchName.toLowerCase()
  const existing =
    (department === 'restaurant' && menuItemId
      ? existingItems?.find((i) => i.id === menuItemId)
      : undefined) ??
    existingItems?.find((i) => i.service_code === serviceCode) ??
    existingItems?.find((i) => i.name.trim().toLowerCase() === nameNorm)

  if (existing) {
    const { data: updated, error: ue } = await admin
      .from('outlet_menu_items')
      .update({
        name: batchName,
        category_id: categoryId,
        unit_price: unitPrice,
        service_code: serviceCode,
        is_active: true,
        updated_by: userId,
        updated_at: new Date().toISOString(),
      })
      .eq('id', existing.id)
      .select()
      .single()
    if (ue) return { error: ue.message }
    return { item: updated, categoryId, synced: 'updated' as const }
  }

  const { data: created, error: ie } = await admin
    .from('outlet_menu_items')
    .insert({
      organization_id: organizationId,
      department,
      category_id: categoryId,
      name: batchName,
      description: '',
      unit_price: unitPrice,
      service_code: serviceCode,
      is_active: true,
      sort_order: 0,
      created_by: userId,
      updated_by: userId,
    })
    .select()
    .single()

  if (ie) return { error: ie.message }
  return { item: created, categoryId, synced: 'created' as const }
}

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
    !hasPermission(role, 'supply:kitchen') &&
    !hasPermission(role, 'outlet:menu') &&
    !hasPermission(role, 'roles:manage')
  ) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const body = await request.json().catch(() => ({}))
  const batchName = String(body?.batchName || '').trim()
  const categoryName = String(body?.categoryName || '').trim()
  const kitchenStockId = String(body?.kitchenStockId || '').trim()
  const menuItemId = String(body?.menuItemId || '').trim() || null
  const unitPrice = Number(body?.unitPrice)
  const syncTarget = String(body?.syncTarget || 'restaurant').trim() as BatchOutletMenuSync

  if (!batchName || !categoryName || !kitchenStockId) {
    return NextResponse.json(
      { error: 'batchName, categoryName, and kitchenStockId required' },
      { status: 400 },
    )
  }
  if (!Number.isFinite(unitPrice) || unitPrice < 0) {
    return NextResponse.json({ error: 'Valid unit_price required' }, { status: 400 })
  }

  const organizationId = profile.organization_id as string

  const restaurantRes = await upsertKitchenMenuItem(
    admin,
    organizationId,
    user.id,
    'restaurant',
    batchName,
    categoryName,
    kitchenStockId,
    unitPrice,
    menuItemId,
  )
  if ('error' in restaurantRes) {
    return NextResponse.json({ error: restaurantRes.error }, { status: 400 })
  }

  if (syncTarget === 'restaurant_fnb') {
    const barRes = await upsertKitchenMenuItem(
      admin,
      organizationId,
      user.id,
      'main_bar',
      batchName,
      categoryName,
      kitchenStockId,
      unitPrice,
      null,
    )
    if ('error' in barRes) {
      return NextResponse.json({ error: barRes.error }, { status: 400 })
    }
    return NextResponse.json({
      item: restaurantRes.item,
      categoryId: restaurantRes.categoryId,
      synced: restaurantRes.synced,
      alsoSyncedMainBar: true,
    })
  }

  return NextResponse.json({
    item: restaurantRes.item,
    categoryId: restaurantRes.categoryId,
    synced: restaurantRes.synced,
  })
}
