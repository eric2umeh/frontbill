import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import {
  requireSupplyPermission,
  resolveSupplyAuthedUser,
} from '@/lib/supply-chain/supply-api-auth'
import { SUPPLY_SNAPSHOT_KEYS, type SupplySnapshotKey } from '@/lib/supply-chain/supply-db-mappers'

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

/** GET — load JSON snapshots (kitchen, PO, bar, etc.). */
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
      .from('supply_chain_snapshots')
      .select('snapshot_key, data')
      .eq('organization_id', auth.orgId)

    if (error) {
      const missing = missingTableResponse(error.message)
      if (missing) return missing
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    const snapshots: Partial<Record<SupplySnapshotKey, unknown>> = {}
    for (const row of data ?? []) {
      const key = row.snapshot_key as SupplySnapshotKey
      if (SUPPLY_SNAPSHOT_KEYS.includes(key)) {
        snapshots[key] = row.data
      }
    }

    return NextResponse.json({ snapshots })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Server error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

/** PUT — upsert JSON snapshots (partial update). */
export async function PUT(request: Request) {
  try {
    const body = await request.json().catch(() => ({}))
    const caller_id = String(body?.caller_id ?? '')
    const snapshots = (body?.snapshots ?? {}) as Partial<Record<SupplySnapshotKey, unknown>>

    const auth = await resolveSupplyAuthedUser(request, caller_id, body as Record<string, unknown>)
    if (auth instanceof NextResponse) return auth

    const denied = requireSupplyPermission(auth, 'supply:store')
    if (denied) return denied

    const admin = createAdminClient()
    const now = new Date().toISOString()

    for (const key of Object.keys(snapshots) as SupplySnapshotKey[]) {
      if (!SUPPLY_SNAPSHOT_KEYS.includes(key)) continue
      const data = snapshots[key]
      const { error } = await admin.from('supply_chain_snapshots').upsert(
        {
          organization_id: auth.orgId,
          snapshot_key: key,
          data: data ?? [],
          updated_at: now,
        },
        { onConflict: 'organization_id,snapshot_key' },
      )
      if (error) {
        const missing = missingTableResponse(error.message)
        if (missing) return missing
        return NextResponse.json({ error: error.message }, { status: 400 })
      }
    }

    return NextResponse.json({ ok: true })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Server error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
