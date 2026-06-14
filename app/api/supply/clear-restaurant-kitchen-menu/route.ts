import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { hasPermission } from '@/lib/permissions'

/**
 * Remove all Restaurant outlet menu items for the org.
 * Categories (`outlet_menu_categories`) are kept.
 */
export async function POST() {
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
  if (!hasPermission(role, 'roles:manage') && !hasPermission(role, 'supply:kitchen')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const organizationId = profile.organization_id as string

  const { data: items, error: fe } = await admin
    .from('outlet_menu_items')
    .select('id, name')
    .eq('organization_id', organizationId)
    .eq('department', 'restaurant')

  if (fe) return NextResponse.json({ error: fe.message }, { status: 400 })

  const rows = items ?? []
  if (!rows.length) {
    return NextResponse.json({
      deleted: 0,
      categoriesKept: true,
      message: 'No restaurant menu items found',
    })
  }

  const ids = rows.map((i) => i.id)
  const { error: de } = await admin.from('outlet_menu_items').delete().in('id', ids)
  if (de) return NextResponse.json({ error: de.message }, { status: 400 })

  return NextResponse.json({
    deleted: ids.length,
    categoriesKept: true,
    names: rows.map((i) => i.name),
  })
}
