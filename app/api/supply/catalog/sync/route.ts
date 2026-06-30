import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import {
  requireSupplyPermission,
  resolveSupplyAuthedUser,
  type SupplyAuthed,
} from '@/lib/supply-chain/supply-api-auth'
import {
  catalogRowToStoreItem,
  storeItemToCatalogInsert,
  type SupplyCatalogRow,
} from '@/lib/supply-chain/supply-db-mappers'
import type { StoreItem } from '@/lib/supply-chain/types'
import { toTitleCaseWords } from '@/lib/supply-chain/title-case'

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

export function requireCatalogSyncPermission(auth: SupplyAuthed) {
  return requireSupplyPermission(auth, 'supply:store')
}

/** POST — upsert full catalogue snapshot (qty updates, bulk import). */
export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}))
    const caller_id = String(body?.caller_id ?? '')
    const items = (body?.items ?? []) as StoreItem[]

    const auth = await resolveSupplyAuthedUser(request, caller_id, body as Record<string, unknown>)
    if (auth instanceof NextResponse) return auth

    const denied = requireCatalogSyncPermission(auth)
    if (denied) return denied

    if (!Array.isArray(items)) {
      return NextResponse.json({ error: 'items must be an array' }, { status: 400 })
    }

    const admin = createAdminClient()
    const rows = items.map((raw) => {
      const item: StoreItem = {
        ...raw,
        id: raw.id || crypto.randomUUID(),
        name: toTitleCaseWords(raw.name),
        unit: raw.unit?.trim() || 'kg',
        quantityInStore: Math.max(0, Number(raw.quantityInStore) || 0),
        reorderLevel: Math.max(0, Number(raw.reorderLevel) || 0),
        lastPrice: Math.max(0, Number(raw.lastPrice) || 0),
        benchmarkPrice: Math.max(0, Number(raw.benchmarkPrice) || Number(raw.lastPrice) || 0),
      }
      return storeItemToCatalogInsert(item, auth.orgId, auth.userId)
    })

    if (rows.length === 0) {
      return NextResponse.json({ items: [] })
    }

    const { data, error } = await admin
      .from('supply_catalog_items')
      .upsert(rows, { onConflict: 'id' })
      .select('*')

    if (error) {
      const missing = missingTableResponse(error.message)
      if (missing) return missing
      return NextResponse.json({ error: error.message }, { status: 400 })
    }

    const mapped = ((data ?? []) as SupplyCatalogRow[]).map(catalogRowToStoreItem)
    return NextResponse.json({ items: mapped })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Server error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
