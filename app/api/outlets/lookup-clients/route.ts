import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { resolveOutletAuthed } from '@/lib/outlets/api-auth'
import type { OutletClientOptionKind } from '@/lib/outlets/types'

export async function GET(request: Request) {
  const q = new URL(request.url).searchParams.get('q')?.trim() || ''
  if (q.length < 1) {
    return NextResponse.json({ clients: [] })
  }

  const auth = await resolveOutletAuthed(request, { permission: 'outlet:sell' })
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const admin = createAdminClient()
  const orgId = auth.ctx.organizationId
  const pattern = `%${q}%`

  const [guestsRes, orgsRes] = await Promise.all([
    admin
      .from('guests')
      .select('id, name, phone')
      .eq('organization_id', orgId)
      .ilike('name', pattern)
      .order('name')
      .limit(12),
    admin
      .from('organizations')
      .select('id, name, phone, org_type')
      .neq('id', orgId)
      .ilike('name', pattern)
      .order('name')
      .limit(8),
  ])

  const clients: Array<{
    kind: OutletClientOptionKind
    id: string
    name: string
    subtitle: string | null
    balance?: number
  }> = []

  for (const g of guestsRes.data ?? []) {
    clients.push({
      kind: 'guest',
      id: g.id,
      name: g.name,
      subtitle: g.phone ? String(g.phone) : 'Guest',
    })
  }
  const guestNames = new Set(
    clients.map((c) => c.name.trim().toLowerCase()),
  )

  for (const o of orgsRes.data ?? []) {
    const nameKey = o.name.trim().toLowerCase()
    if (guestNames.has(nameKey)) continue
    clients.push({
      kind: 'organization',
      id: o.id,
      name: o.name,
      subtitle: o.org_type ? `Organization · ${o.org_type}` : 'Organization',
    })
  }

  return NextResponse.json({ clients })
}
