import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { resolveSupplyAuthedUser } from '@/lib/supply-chain/supply-api-auth'
import {
  catalogRowToStoreItem,
  storeItemToCatalogUpdate,
  type SupplyCatalogRow,
} from '@/lib/supply-chain/supply-db-mappers'
import type { StoreItem } from '@/lib/supply-chain/types'
import { toTitleCaseWords } from '@/lib/supply-chain/title-case'
import { canManageStoreCatalog } from '@/lib/permissions'

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

type RouteParams = { params: Promise<{ id: string }> }

/** PATCH — update catalogue item. */
export async function PATCH(request: Request, { params }: RouteParams) {
  try {
    const { id } = await params
    const body = await request.json().catch(() => ({}))
    const caller_id = String(body?.caller_id ?? '')
    const patch = (body?.patch ?? {}) as Partial<StoreItem>

    const auth = await resolveSupplyAuthedUser(request, caller_id, body as Record<string, unknown>)
    if (auth instanceof NextResponse) return auth

    if (!canManageStoreCatalog(auth.role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const dbPatch = storeItemToCatalogUpdate(
      {
        id,
        ...patch,
        ...(patch.name != null ? { name: toTitleCaseWords(patch.name) } : {}),
      },
      auth.userId,
    )

    const admin = createAdminClient()
    const { data, error } = await admin
      .from('supply_catalog_items')
      .update(dbPatch)
      .eq('id', id)
      .eq('organization_id', auth.orgId)
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

/** DELETE — remove catalogue item. */
export async function DELETE(request: Request, { params }: RouteParams) {
  try {
    const { id } = await params
    const body = await request.json().catch(() => ({}))
    const caller_id = String(body?.caller_id ?? '')

    const auth = await resolveSupplyAuthedUser(request, caller_id, body as Record<string, unknown>)
    if (auth instanceof NextResponse) return auth

    if (!canManageStoreCatalog(auth.role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const admin = createAdminClient()
    const { error } = await admin
      .from('supply_catalog_items')
      .delete()
      .eq('id', id)
      .eq('organization_id', auth.orgId)

    if (error) {
      const missing = missingTableResponse(error.message)
      if (missing) return missing
      return NextResponse.json({ error: error.message }, { status: 400 })
    }

    return NextResponse.json({ ok: true })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Server error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
