import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { hasPermission } from '@/lib/permissions'
import { OUTLET_DEPARTMENTS } from '@/lib/outlets/departments'

/** Delete all outlet menu items and categories for the org (fresh start). */
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
  if (!hasPermission(role, 'roles:manage') && !hasPermission(role, 'supply:store')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const organizationId = profile.organization_id as string
  const departments = OUTLET_DEPARTMENTS.map((d) => d.key)

  const { count: itemCount, error: itemCountErr } = await admin
    .from('outlet_menu_items')
    .select('id', { count: 'exact', head: true })
    .eq('organization_id', organizationId)
    .in('department', departments)

  if (itemCountErr) {
    return NextResponse.json({ error: itemCountErr.message }, { status: 400 })
  }

  const { count: categoryCount, error: catCountErr } = await admin
    .from('outlet_menu_categories')
    .select('id', { count: 'exact', head: true })
    .eq('organization_id', organizationId)
    .in('department', departments)

  if (catCountErr) {
    return NextResponse.json({ error: catCountErr.message }, { status: 400 })
  }

  const { error: itemDeleteErr } = await admin
    .from('outlet_menu_items')
    .delete()
    .eq('organization_id', organizationId)
    .in('department', departments)

  if (itemDeleteErr) {
    return NextResponse.json({ error: itemDeleteErr.message }, { status: 400 })
  }

  const { error: catDeleteErr } = await admin
    .from('outlet_menu_categories')
    .delete()
    .eq('organization_id', organizationId)
    .in('department', departments)

  if (catDeleteErr) {
    return NextResponse.json({ error: catDeleteErr.message }, { status: 400 })
  }

  return NextResponse.json({
    deletedItems: itemCount ?? 0,
    deletedCategories: categoryCount ?? 0,
    departments,
    message: 'All outlet menu categories and items cleared',
  })
}
