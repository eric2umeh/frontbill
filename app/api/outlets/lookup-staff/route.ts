import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { resolveOutletAuthed } from '@/lib/outlets/api-auth'
import { getUserDisplayName } from '@/lib/utils/user-display'

export async function GET(request: Request) {
  const q = new URL(request.url).searchParams.get('q')?.trim() || ''
  if (q.length < 1) {
    return NextResponse.json({ staff: [] })
  }

  const auth = await resolveOutletAuthed(request, { permission: 'outlet:sell' })
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const admin = createAdminClient()
  const pattern = `%${q}%`

  const { data, error } = await admin
    .from('profiles')
    .select('id, full_name, role')
    .eq('organization_id', auth.ctx.organizationId)
    .ilike('full_name', pattern)
    .order('full_name')
    .limit(15)

  if (error) return NextResponse.json({ error: error.message }, { status: 400 })

  const staff = (data ?? []).map((row) => ({
    id: row.id as string,
    name: String(row.full_name || '').trim() || getUserDisplayName(null, row.id),
    role: row.role ? String(row.role) : null,
  }))

  return NextResponse.json({ staff })
}
