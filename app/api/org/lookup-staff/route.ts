import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { hasPermission } from '@/lib/permissions'
import { getUserDisplayName } from '@/lib/utils/user-display'

const LOOKUP_PERMISSIONS = [
  'store:issue',
  'supply:store',
  'supply:kitchen',
  'outlet:sell',
  'payments:refund',
  'users:view',
] as const

/** GET /api/org/lookup-staff?caller_id=…&q=… — org staff autocomplete for issue-out, POS, etc. */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const callerId = searchParams.get('caller_id')?.trim()
  const q = searchParams.get('q')?.trim() || ''

  if (!callerId) {
    return NextResponse.json({ error: 'caller_id is required' }, { status: 400 })
  }

  const admin = createAdminClient()
  const { data: caller, error: callerErr } = await admin
    .from('profiles')
    .select('organization_id, role')
    .eq('id', callerId)
    .single()

  if (callerErr || !caller?.organization_id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const allowed = LOOKUP_PERMISSIONS.some((p) => hasPermission(caller.role, p))
  if (!allowed) {
    return NextResponse.json({ error: 'You do not have access to staff lookup' }, { status: 403 })
  }

  let query = admin
    .from('profiles')
    .select('id, full_name, role')
    .eq('organization_id', caller.organization_id)
    .order('full_name')
    .limit(q ? 15 : 25)

  if (q) {
    query = query.ilike('full_name', `%${q}%`)
  }

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })

  const staff = (data ?? []).map((row) => ({
    id: row.id as string,
    name: String(row.full_name || '').trim() || getUserDisplayName(null, row.id),
    role: row.role ? String(row.role) : null,
  }))

  return NextResponse.json({ staff })
}
