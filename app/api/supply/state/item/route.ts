import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import {
  requireSupplyKitchenOrStore,
  resolveSupplyAuthedUser,
  writableSupplySnapshotKeys,
} from '@/lib/supply-chain/supply-api-auth'
import { SUPPLY_SNAPSHOT_KEYS, type SupplySnapshotKey } from '@/lib/supply-chain/supply-db-mappers'

const STOCK_COUNT_KEYS = new Set<SupplySnapshotKey>([
  'kitchen_stock',
  'kitchen_raw_stock',
  'bar_stock',
])

function missingTableResponse(message: string) {
  if (/supply_chain_snapshots|schema cache|does not exist/i.test(message)) {
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

function asRowArray(data: unknown): Record<string, unknown>[] {
  if (!Array.isArray(data)) return []
  return data.filter(
    (row): row is Record<string, unknown> =>
      !!row && typeof row === 'object' && !Array.isArray(row),
  )
}

function rowMatches(
  row: Record<string, unknown>,
  match: { id?: string; storeItemId?: string },
): boolean {
  const id = typeof match.id === 'string' ? match.id.trim() : ''
  const storeItemId =
    typeof match.storeItemId === 'string' ? match.storeItemId.trim() : ''
  if (id && String(row.id ?? '') === id) return true
  if (storeItemId && String(row.storeItemId ?? '') === storeItemId) return true
  return false
}

/**
 * PATCH — merge one stock row into a snapshot array (egress-friendly stock counts).
 * Client sends a tiny patch; server read-modify-writes the JSONB blob.
 */
export async function PATCH(request: Request) {
  try {
    const body = await request.json().catch(() => ({}))
    const caller_id = String(body?.caller_id ?? '')
    const snapshotKey = String(body?.snapshot_key ?? '').trim() as SupplySnapshotKey
    const match = (body?.match ?? {}) as { id?: string; storeItemId?: string }
    const patch = (body?.patch ?? {}) as Record<string, unknown>
    const upsertRow =
      body?.upsert_row && typeof body.upsert_row === 'object' && !Array.isArray(body.upsert_row)
        ? (body.upsert_row as Record<string, unknown>)
        : null

    if (!(SUPPLY_SNAPSHOT_KEYS as readonly string[]).includes(snapshotKey)) {
      return NextResponse.json({ error: 'Invalid snapshot_key' }, { status: 400 })
    }
    if (!STOCK_COUNT_KEYS.has(snapshotKey)) {
      return NextResponse.json(
        { error: 'Item patch only supported for kitchen_stock, kitchen_raw_stock, bar_stock' },
        { status: 400 },
      )
    }
    if (!match.id && !match.storeItemId && !upsertRow) {
      return NextResponse.json(
        { error: 'match.id, match.storeItemId, or upsert_row is required' },
        { status: 400 },
      )
    }
    if (!patch || Object.keys(patch).length === 0) {
      return NextResponse.json({ error: 'patch is required' }, { status: 400 })
    }

    const auth = await resolveSupplyAuthedUser(
      request,
      caller_id,
      body as Record<string, unknown>,
    )
    if (auth instanceof NextResponse) return auth

    const denied = requireSupplyKitchenOrStore(auth)
    if (denied) return denied

    const writable = writableSupplySnapshotKeys(auth.role)
    if (!writable?.has(snapshotKey)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const admin = createAdminClient()
    const { data: existingRow, error: readError } = await admin
      .from('supply_chain_snapshots')
      .select('data')
      .eq('organization_id', auth.orgId)
      .eq('snapshot_key', snapshotKey)
      .maybeSingle()

    if (readError) {
      const missing = missingTableResponse(readError.message)
      if (missing) return missing
      return NextResponse.json({ error: readError.message }, { status: 500 })
    }

    const rows = asRowArray(existingRow?.data)
    const idx = rows.findIndex((row) => rowMatches(row, match))

    if (idx >= 0) {
      rows[idx] = { ...rows[idx], ...patch }
    } else if (upsertRow) {
      rows.push({ ...upsertRow, ...patch })
    } else {
      return NextResponse.json({ error: 'Stock item not found in snapshot' }, { status: 404 })
    }

    const now = new Date().toISOString()
    const { error: writeError } = await admin.from('supply_chain_snapshots').upsert(
      {
        organization_id: auth.orgId,
        snapshot_key: snapshotKey,
        data: rows,
        updated_at: now,
      },
      { onConflict: 'organization_id,snapshot_key' },
    )

    if (writeError) {
      const missing = missingTableResponse(writeError.message)
      if (missing) return missing
      return NextResponse.json({ error: writeError.message }, { status: 400 })
    }

    return NextResponse.json({ ok: true, snapshot_key: snapshotKey })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Server error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
