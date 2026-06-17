import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import {
  requireSupplyPermission,
  resolveSupplyAuthedUser,
} from '@/lib/supply-chain/supply-api-auth'
import {
  catalogRowToStoreItem,
  storeItemToCatalogInsert,
  type SupplyCatalogRow,
} from '@/lib/supply-chain/supply-db-mappers'
import type { StoreItem } from '@/lib/supply-chain/types'
import { toTitleCaseWords } from '@/lib/supply-chain/title-case'
import { canAddStoreItemDirect, canManageStoreCatalog } from '@/lib/permissions'

function missingTableResponse(message: string) {
  if (/supply_catalog_items|schema cache|does not exist/i.test(message)) {
    return NextResponse.json(
      {
        error:
          'Supply chain tables are not installed. Run scripts/063_supply_chain_persistence.sql in Supabase SQL Editor.',
      },
      { status: 503 },
    )
  }
  return null
}

/** GET — list central store catalogue for caller org. */
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const caller_id = searchParams.get('caller_id') ?? ''
    const auth = await resolveSupplyAuthedUser(request, caller_id)
    if (auth instanceof NextResponse) return auth

    const denied = requireSupplyPermission(auth, 'supply:store')
    if (denied) return denied

    const admin = createAdminClient()
    const { data, error } = await admin
      .from('supply_catalog_items')
      .select('*')
      .eq('organization_id', auth.orgId)
      .order('name', { ascending: true })

    if (error) {
      const missing = missingTableResponse(error.message)
      if (missing) return missing
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    const items = ((data ?? []) as SupplyCatalogRow[]).map(catalogRowToStoreItem)
    return NextResponse.json({ items })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Server error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

/** POST — create catalogue item. */
export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}))
    const caller_id = String(body?.caller_id ?? '')
    const item = body?.item as StoreItem | undefined

    const auth = await resolveSupplyAuthedUser(request, caller_id, body as Record<string, unknown>)
    if (auth instanceof NextResponse) return auth

    if (!canAddStoreItemDirect(auth.role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    if (!item?.name?.trim()) {
      return NextResponse.json({ error: 'Item name is required' }, { status: 400 })
    }

    const normalized: StoreItem = {
      ...item,
      id: item.id || crypto.randomUUID(),
      name: toTitleCaseWords(item.name),
      unit: item.unit?.trim() || 'kg',
      quantityInStore: Math.max(0, Number(item.quantityInStore) || 0),
      reorderLevel: Math.max(0, Number(item.reorderLevel) || 0),
      lastPrice: Math.max(0, Number(item.lastPrice) || 0),
      benchmarkPrice: Math.max(0, Number(item.benchmarkPrice) || Number(item.lastPrice) || 0),
    }

    const admin = createAdminClient()
    const row = storeItemToCatalogInsert(normalized, auth.orgId, auth.userId)
    const { data, error } = await admin
      .from('supply_catalog_items')
      .insert(row)
      .select('*')
      .single()

    if (error) {
      const missing = missingTableResponse(error.message)
      if (missing) return missing
      return NextResponse.json({ error: error.message }, { status: 400 })
    }

    return NextResponse.json({ item: catalogRowToStoreItem(data as SupplyCatalogRow) })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Server error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
