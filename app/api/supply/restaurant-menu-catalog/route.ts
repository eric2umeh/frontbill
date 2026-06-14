import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { hasPermission } from '@/lib/permissions'

/** Restaurant menu items + categories for kitchen batch linking (read-only). */
export async function GET() {
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
    !hasPermission(role, 'outlet:view') &&
    !hasPermission(role, 'outlet:menu')
  ) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const organizationId = profile.organization_id as string
  const department = 'restaurant'

  const [{ data: categories, error: ce }, { data: items, error: ie }] = await Promise.all([
    admin
      .from('outlet_menu_categories')
      .select('id, name')
      .eq('organization_id', organizationId)
      .eq('department', department)
      .order('name'),
    admin
      .from('outlet_menu_items')
      .select('id, name, unit_price, category_id, service_code, is_active')
      .eq('organization_id', organizationId)
      .eq('department', department)
      .order('name'),
  ])

  if (ce) return NextResponse.json({ error: ce.message }, { status: 400 })
  if (ie) return NextResponse.json({ error: ie.message }, { status: 400 })

  return NextResponse.json({
    categories: categories ?? [],
    items: items ?? [],
  })
}
