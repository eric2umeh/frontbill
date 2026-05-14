import { createAdminClient } from '@/lib/supabase/admin'
import { NextResponse } from 'next/server'
import { canonicalRoleKey } from '@/lib/permissions'

/**
 * POST /api/admin/users/repair-attribution
 * Administrator or Superadmin: sets `profiles.added_by` to the caller for every profile in the same org
 * that still has `added_by` NULL (e.g. legacy rows created before attribution was fixed).
 */
export async function POST(request: Request) {
  try {
    const { caller_id } = await request.json().catch(() => ({}))
    if (!caller_id || typeof caller_id !== 'string') {
      return NextResponse.json({ error: 'caller_id is required' }, { status: 400 })
    }

    const admin = createAdminClient()
    const { data: callerProfile, error: callerError } = await admin
      .from('profiles')
      .select('role, organization_id')
      .eq('id', caller_id)
      .single()

    if (callerError || !callerProfile) {
      return NextResponse.json({ error: 'Caller profile not found' }, { status: 403 })
    }

    if (canonicalRoleKey(callerProfile.role) !== 'superadmin' && canonicalRoleKey(callerProfile.role) !== 'admin') {
      return NextResponse.json({ error: 'Only an Administrator or Superadmin can repair attribution' }, { status: 403 })
    }

    const now = new Date().toISOString()
    const { data, error } = await admin
      .from('profiles')
      .update({ added_by: caller_id, updated_at: now })
      .eq('organization_id', callerProfile.organization_id)
      .is('added_by', null)
      .neq('id', caller_id)
      .select('id')

    if (error) {
      const m = error.message || ''
      if (/added_by/i.test(m) && (m.includes('does not exist') || m.includes('schema cache'))) {
        return NextResponse.json(
          {
            error:
              'Column profiles.added_by is missing. Run scripts/019_add_profiles_added_by.sql in the Supabase SQL editor.',
          },
          { status: 503 },
        )
      }
      return NextResponse.json({ error: m }, { status: 500 })
    }

    return NextResponse.json({ updated: (data || []).length })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
