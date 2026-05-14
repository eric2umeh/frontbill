import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { hasPermission } from '@/lib/permissions'

async function resolveAuthedUserId(request: Request): Promise<string | null> {
  const cookieSb = await createClient()
  const {
    data: { user },
  } = await cookieSb.auth.getUser()
  if (user?.id) return user.id
  const raw = request.headers.get('authorization')?.trim()
  const bearer = raw?.toLowerCase().startsWith('bearer ') ? raw.slice(7).trim() : null
  if (!bearer) return null
  try {
    const admin = createAdminClient()
    const { data, error } = await admin.auth.getUser(bearer)
    if (error || !data.user?.id) return null
    return data.user.id
  } catch {
    return null
  }
}

type BulkLine = { item_id: string; qty: number }

/** POST — atomic bulk stock in/out (central store). Requires `store:adjust` and scripts/043. */
export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}))
    const caller_id = body?.caller_id as string | undefined
    const movement_type = body?.movement_type as string | undefined
    const movement_at = body?.movement_at as string | undefined
    const reference = typeof body?.reference === 'string' ? body.reference : ''
    const notes = typeof body?.notes === 'string' ? body.notes : ''
    const lines = body?.lines as BulkLine[] | undefined

    if (!caller_id || !movement_at || !Array.isArray(lines) || lines.length === 0) {
      return NextResponse.json(
        { error: 'caller_id, movement_at, and non-empty lines[] are required' },
        { status: 400 },
      )
    }
    if (movement_type !== 'in' && movement_type !== 'out') {
      return NextResponse.json({ error: 'movement_type must be in or out' }, { status: 400 })
    }

    const authed = await resolveAuthedUserId(request)
    if (!authed || authed !== caller_id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const admin = createAdminClient()
    const { data: profile, error: pe } = await admin
      .from('profiles')
      .select('role, organization_id')
      .eq('id', caller_id)
      .single()

    if (pe || !profile?.organization_id) {
      return NextResponse.json({ error: 'Profile not found' }, { status: 403 })
    }

    if (!hasPermission(profile.role, 'store:adjust')) {
      return NextResponse.json({ error: 'You do not have permission to adjust store stock' }, { status: 403 })
    }

    const orgId = profile.organization_id as string
    const cleaned: { item_id: string; qty: number }[] = []
    for (const row of lines) {
      const item_id = typeof row?.item_id === 'string' ? row.item_id.trim() : ''
      const qty = Number(row?.qty)
      if (!item_id || !Number.isFinite(qty) || qty <= 0) {
        return NextResponse.json({ error: 'Each line needs item_id and a positive qty' }, { status: 400 })
      }
      cleaned.push({ item_id, qty })
    }

    const { data, error } = await admin.rpc('apply_store_movement_bulk', {
      p_organization_id: orgId,
      p_actor_id: caller_id,
      p_movement_type: movement_type,
      p_movement_at: movement_at,
      p_reference: reference,
      p_notes: notes,
      p_lines: cleaned,
    })

    if (error) {
      const m = error.message || ''
      if (/apply_store_movement_bulk|function .* does not exist|schema cache/i.test(m)) {
        return NextResponse.json(
          {
            error:
              'Bulk movements are not installed. Run scripts/043_store_movement_at_and_bulk_rpc.sql in the Supabase SQL editor.',
          },
          { status: 503 },
        )
      }
      return NextResponse.json({ error: m }, { status: 400 })
    }

    return NextResponse.json({ ok: true, result: data })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Server error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
