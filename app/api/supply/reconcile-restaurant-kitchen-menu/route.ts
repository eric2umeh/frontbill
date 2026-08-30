import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { hasPermission } from '@/lib/permissions'

function parseKitchenStockId(serviceCode: string | null | undefined): string | null {
  if (!serviceCode?.startsWith('ks:')) return null
  const id = serviceCode.slice(3).trim()
  return id || null
}

export async function POST(request: Request) {
  const cookieSb = await createClient()
  const {
    data: { user },
  } = await cookieSb.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const admin = createAdminClient()
  const { data: profile, error: pe } = await admin
    .from('profiles')
    .select('role, organization_id')
    .eq('id', user.id)
    .single()

  if (pe || !profile?.organization_id) {
    return NextResponse.json({ error: 'Profile not found' }, { status: 403 })
  }

  const role = String(profile.role || '')
  if (
    !hasPermission(role, 'supply:kitchen') &&
    !hasPermission(role, 'outlet:menu') &&
    !hasPermission(role, 'roles:manage')
  ) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const body = await request.json().catch(() => ({}))
  const validIds = Array.isArray(body?.validKitchenStockIds)
    ? body.validKitchenStockIds.map((id: unknown) => String(id || '').trim()).filter(Boolean)
    : []
  const validSet = new Set(validIds)
  const organizationId = profile.organization_id as string
  const now = new Date().toISOString()

  const { data: items, error: fe } = await admin
    .from('outlet_menu_items')
    .select('id, service_code, is_active, department')
    .eq('organization_id', organizationId)
    .in('department', ['restaurant', 'main_bar'])
    .like('service_code', 'ks:%')

  if (fe) return NextResponse.json({ error: fe.message }, { status: 400 })

  const orphanIds = (items ?? [])
    .filter((item) => {
      if (item.is_active === false) return false
      const ksId = parseKitchenStockId(item.service_code)
      if (!ksId) return false
      return !validSet.has(ksId)
    })
    .map((item) => item.id)

  if (!orphanIds.length) {
    return NextResponse.json({ deactivated: 0 })
  }

  const { error: ue } = await admin
    .from('outlet_menu_items')
    .update({
      is_active: false,
      updated_by: user.id,
      updated_at: now,
    })
    .in('id', orphanIds)

  if (ue) return NextResponse.json({ error: ue.message }, { status: 400 })

  return NextResponse.json({ deactivated: orphanIds.length })
}
