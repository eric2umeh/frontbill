import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { hasPermission } from '@/lib/permissions'
import { syncMainBarMenuItemFromStore } from '@/lib/outlets/sync-main-bar-menu-item'

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
  const barStockId = String(body?.barStockId || '').trim()
  const unitPrice = Number(body?.unitPrice)
  const storeItemId = barStockId.startsWith('bar-') ? barStockId.slice(4).trim() : barStockId

  if (!itemName || !barStockId || !storeItemId) {
    return NextResponse.json({ error: 'itemName and barStockId required' }, { status: 400 })
  }
  if (!Number.isFinite(unitPrice) || unitPrice < 0) {
    return NextResponse.json({ error: 'Valid unit_price required' }, { status: 400 })
  }

  const organizationId = profile.organization_id as string
  const requestedCategoryName = String(body?.categoryName || '').trim()

  const [{ data: categories }, { data: existingItems }] = await Promise.all([
    admin
      .from('outlet_menu_categories')
      .select('id, name, slug')
      .eq('organization_id', organizationId)
      .eq('department', 'main_bar'),
    admin
      .from('outlet_menu_items')
      .select('id, name, service_code, category_id, is_active, unit_price')
      .eq('organization_id', organizationId)
      .eq('department', 'main_bar'),
  ])

  const ctx = { categories: categories ?? [], existingItems: existingItems ?? [] }

  const result = await syncMainBarMenuItemFromStore(
    admin,
    {
      organizationId,
      userId: user.id,
      storeItemId,
      itemName,
      unitPrice,
      categoryName: requestedCategoryName || undefined,
    },
    ctx,
  )

  if ('error' in result) {
    return NextResponse.json({ error: result.error }, { status: 400 })
  }

  if (result.synced === 'skipped') {
    return NextResponse.json({
      synced: 'skipped',
      reason: 'Item was removed from Main Bar menu',
    })
  }

  const serviceCode = `bar:${barStockId}`
  const { data: item } = await admin
    .from('outlet_menu_items')
    .select('*')
    .eq('organization_id', organizationId)
    .eq('department', 'main_bar')
    .eq('service_code', serviceCode)
    .maybeSingle()

  return NextResponse.json({
    item,
    categoryId: item?.category_id ?? null,
    synced: result.synced,
  })
}
