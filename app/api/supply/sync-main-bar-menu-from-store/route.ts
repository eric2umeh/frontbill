import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { hasPermission } from '@/lib/permissions'
import {
  catalogRowToStoreItem,
  type SupplyCatalogRow,
} from '@/lib/supply-chain/supply-db-mappers'
import { storeItemMatchesDept } from '@/lib/supply-chain/types'
import { syncMainBarMenuItemFromStore } from '@/lib/outlets/sync-main-bar-menu-item'

/** Mirror all Central Store main_bar catalogue rows onto the Main Bar outlet menu (qty 0 until issue-out). */
export async function POST() {
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
    !hasPermission(role, 'outlet:view') &&
    !hasPermission(role, 'supply:store') &&
    !hasPermission(role, 'supply:fnb')
  ) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const organizationId = profile.organization_id as string

  const [{ data: catalogRows, error: ce }, { data: categories }, { data: existingItems }] =
    await Promise.all([
      admin.from('supply_catalog_items').select('*').eq('organization_id', organizationId),
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

  if (ce) {
    if (/supply_catalog_items|schema cache|does not exist/i.test(ce.message || '')) {
      return NextResponse.json(
        {
          error:
            'Supply chain tables are not installed. Run scripts/063_supply_chain_persistence.sql in Supabase SQL Editor.',
        },
        { status: 503 },
      )
    }
    return NextResponse.json({ error: ce.message }, { status: 500 })
  }

  const mainBarStoreItems = ((catalogRows ?? []) as SupplyCatalogRow[])
    .map(catalogRowToStoreItem)
    .filter((item) => storeItemMatchesDept(item, 'main_bar'))

  const ctx = {
    categories: categories ?? [],
    existingItems: existingItems ?? [],
  }

  let created = 0
  let updated = 0
  let skipped = 0
  const errors: string[] = []

  for (const storeItem of mainBarStoreItems) {
    const result = await syncMainBarMenuItemFromStore(
      admin,
      {
        organizationId,
        userId: user.id,
        storeItemId: storeItem.id,
        itemName: storeItem.name,
        unitPrice: storeItem.lastPrice,
        unit: storeItem.unit,
      },
      ctx,
    )
    if ('error' in result) {
      errors.push(`${storeItem.name}: ${result.error}`)
      continue
    }
    if (result.synced === 'created') created += 1
    else if (result.synced === 'updated') updated += 1
    else skipped += 1
  }

  return NextResponse.json({
    ok: true,
    storeItems: mainBarStoreItems.length,
    created,
    updated,
    skipped,
    errors: errors.slice(0, 5),
  })
}
