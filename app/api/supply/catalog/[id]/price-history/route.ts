import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import {
  requireSupplyKitchenOrStore,
  resolveSupplyAuthedUser,
} from '@/lib/supply-chain/supply-api-auth'
import { getUserDisplayName } from '@/lib/utils/user-display'

function missingTableResponse(message: string) {
  if (/supply_catalog_price_history|schema cache|does not exist/i.test(message)) {
    return NextResponse.json(
      {
        error:
          'Price history table is not installed. Run scripts/088_supply_catalog_price_history.sql in Supabase SQL Editor.',
      },
      { status: 503 },
    )
  }
  return null
}

type RouteParams = { params: Promise<{ id: string }> }

function parseYmdBound(raw: string | null, endOfDay: boolean): string | null {
  if (!raw) return null
  const ymd = raw.trim().slice(0, 10)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(ymd)) return null
  return endOfDay ? `${ymd}T23:59:59.999Z` : `${ymd}T00:00:00.000Z`
}

/** GET — paginated price change log for one catalogue item. */
export async function GET(request: Request, { params }: RouteParams) {
  try {
    const { id: catalogItemId } = await params
    const { searchParams } = new URL(request.url)
    const caller_id = searchParams.get('caller_id') ?? ''

    const auth = await resolveSupplyAuthedUser(request, caller_id)
    if (auth instanceof NextResponse) return auth

    const denied = requireSupplyKitchenOrStore(auth)
    if (denied) return denied

    const page = Math.max(1, Number(searchParams.get('page')) || 1)
    const pageSize = Math.min(50, Math.max(5, Number(searchParams.get('pageSize')) || 15))
    const fromIso = parseYmdBound(searchParams.get('from'), false)
    const toIso = parseYmdBound(searchParams.get('to'), true)
    const fieldFilter = searchParams.get('field')?.trim()
    const field =
      fieldFilter === 'last_price' || fieldFilter === 'benchmark_price'
        ? fieldFilter
        : null

    const admin = createAdminClient()

    const { data: itemRow, error: itemErr } = await admin
      .from('supply_catalog_items')
      .select('id')
      .eq('id', catalogItemId)
      .eq('organization_id', auth.orgId)
      .maybeSingle()

    if (itemErr) {
      const missing = missingTableResponse(itemErr.message)
      if (missing) return missing
      return NextResponse.json({ error: itemErr.message }, { status: 400 })
    }
    if (!itemRow) {
      return NextResponse.json({ error: 'Item not found' }, { status: 404 })
    }

    let query = admin
      .from('supply_catalog_price_history')
      .select(
        'id, catalog_item_id, field, old_price, new_price, changed_by, created_at',
        { count: 'exact' },
      )
      .eq('organization_id', auth.orgId)
      .eq('catalog_item_id', catalogItemId)
      .order('created_at', { ascending: false })

    if (fromIso) query = query.gte('created_at', fromIso)
    if (toIso) query = query.lte('created_at', toIso)
    if (field) query = query.eq('field', field)

    const from = (page - 1) * pageSize
    const to = from + pageSize - 1
    query = query.range(from, to)

    const { data, error, count } = await query
    if (error) {
      const missing = missingTableResponse(error.message)
      if (missing) return missing
      return NextResponse.json({ error: error.message }, { status: 400 })
    }

    const rows = data ?? []
    const actorIds = Array.from(
      new Set(
        rows
          .map((r) => r.changed_by)
          .filter((v): v is string => typeof v === 'string' && v.length > 0),
      ),
    )

    const nameById = new Map<string, string>()
    if (actorIds.length) {
      const { data: profiles } = await admin
        .from('profiles')
        .select('id, full_name')
        .in('id', actorIds)
      for (const p of profiles ?? []) {
        nameById.set(p.id, getUserDisplayName(p, p.id))
      }
    }

    const entries = rows.map((r) => ({
      id: r.id as string,
      catalogItemId: r.catalog_item_id as string,
      field: r.field as 'last_price' | 'benchmark_price',
      oldPrice: Number(r.old_price) || 0,
      newPrice: Number(r.new_price) || 0,
      changedBy: (r.changed_by as string | null) ?? null,
      changedByName: r.changed_by
        ? nameById.get(r.changed_by as string) ||
          getUserDisplayName(null, r.changed_by as string)
        : 'System',
      createdAt: r.created_at as string,
    }))

    const total = count ?? entries.length
    return NextResponse.json({
      entries,
      page,
      pageSize,
      total,
      totalPages: Math.max(1, Math.ceil(total / pageSize)),
    })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Server error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
