import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { hasPermission } from '@/lib/permissions'
import type { BatchOutletMenuSync } from '@/lib/supply-chain/batch-outlet-sync'

async function deactivateKitchenMenuItem(
  admin: ReturnType<typeof createAdminClient>,
  organizationId: string,
  userId: string,
  department: 'restaurant' | 'main_bar',
  kitchenStockId: string,
) {
  const serviceCode = `ks:${kitchenStockId}`
  const { data: items, error: fe } = await admin
    .from('outlet_menu_items')
    .select('id, is_active')
    .eq('organization_id', organizationId)
    .eq('department', department)
    .eq('service_code', serviceCode)

  if (fe) return { error: fe.message }
  const active = (items ?? []).filter((i) => i.is_active !== false)
  if (!active.length) return { deactivated: 0 }

  const { error: ue } = await admin
    .from('outlet_menu_items')
    .update({
      is_active: false,
      updated_by: userId,
      updated_at: new Date().toISOString(),
    })
    .eq('organization_id', organizationId)
    .eq('department', department)
    .eq('service_code', serviceCode)

  if (ue) return { error: ue.message }
  return { deactivated: active.length }
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
  const kitchenStockId = String(body?.kitchenStockId || '').trim()
  const syncTarget = String(body?.syncTarget || 'restaurant').trim() as BatchOutletMenuSync

  if (!kitchenStockId) {
    return NextResponse.json({ error: 'kitchenStockId required' }, { status: 400 })
  }

  const organizationId = profile.organization_id as string
  let deactivated = 0

  const restaurantRes = await deactivateKitchenMenuItem(
    admin,
    organizationId,
    user.id,
    'restaurant',
    kitchenStockId,
  )
  if ('error' in restaurantRes) {
    return NextResponse.json({ error: restaurantRes.error }, { status: 400 })
  }
  deactivated += restaurantRes.deactivated

  if (syncTarget === 'restaurant_fnb') {
    const barRes = await deactivateKitchenMenuItem(
      admin,
      organizationId,
      user.id,
      'main_bar',
      kitchenStockId,
    )
    if ('error' in barRes) {
      return NextResponse.json({ error: barRes.error }, { status: 400 })
    }
    deactivated += barRes.deactivated
  }

  return NextResponse.json({ deactivated })
}
