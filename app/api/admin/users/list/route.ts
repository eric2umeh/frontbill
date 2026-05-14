import { createAdminClient } from '@/lib/supabase/admin'
import { NextResponse } from 'next/server'
import { canonicalRoleKey } from '@/lib/permissions'
import { resolveStaffDisplayName } from '@/lib/utils/resolve-staff-display-name'

// GET /api/admin/users/list?caller_id=xxx
// Returns all profiles in the same organization as the caller.
// Uses the admin client to bypass the restrictive RLS policy on profiles
// (which only allows users to see their own row by default).
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const caller_id = searchParams.get('caller_id')

    if (!caller_id) {
      return NextResponse.json({ error: 'caller_id is required' }, { status: 400 })
    }

    const admin = createAdminClient()

    // Fetch caller's profile to get org + verify role
    const { data: callerProfile, error: callerError } = await admin
      .from('profiles')
      .select('role, organization_id')
      .eq('id', caller_id)
      .single()

    if (callerError || !callerProfile) {
      return NextResponse.json({ error: 'Caller profile not found' }, { status: 403 })
    }

    const callerKey = canonicalRoleKey(callerProfile.role)
    if (!callerKey || !['superadmin', 'admin', 'manager'].includes(callerKey)) {
      return NextResponse.json({ error: 'Only superadmins, admins or managers can list users' }, { status: 403 })
    }

    const profileListSelect = 'id, full_name, role, avatar_url, created_at, added_by'

    let hasAddedByColumn = true
    let { data: users, error: usersError }: { data: any[] | null; error: any } = await admin
      .from('profiles')
      .select(profileListSelect)
      .eq('organization_id', callerProfile.organization_id)
      .order('created_at', { ascending: true })

    if (usersError && /added_by/i.test(usersError.message || '')) {
      hasAddedByColumn = false
      const retry = await admin
        .from('profiles')
        .select('id, full_name, role, avatar_url, created_at')
        .eq('organization_id', callerProfile.organization_id)
        .order('created_at', { ascending: true })
      users = retry.data
      usersError = retry.error
    }

    if (usersError) {
      return NextResponse.json({ error: usersError.message }, { status: 500 })
    }

    // Administrator or Superadmin viewing the list: repair NULL added_by for other profiles in the org (legacy rows).
    // (Many accounts use role "admin" / Administrator, not the superadmin key — the old "sole superadmin" check never ran.)
    const canAttributeOrphans = callerKey === 'superadmin' || callerKey === 'admin'
    if (hasAddedByColumn && users?.length && canAttributeOrphans) {
      const hasOrphans = (users as { id: string; added_by?: string | null }[]).some(
        (u) => u.added_by == null && String(u.id) !== String(caller_id),
      )
      if (hasOrphans) {
        const { error: fixErr } = await admin
          .from('profiles')
          .update({ added_by: caller_id, updated_at: new Date().toISOString() })
          .eq('organization_id', callerProfile.organization_id)
          .is('added_by', null)
          .neq('id', caller_id)
        if (fixErr) {
          console.error('[users/list] added_by repair failed:', fixErr.message)
        } else {
          const refetch = await admin
            .from('profiles')
            .select(profileListSelect)
            .eq('organization_id', callerProfile.organization_id)
            .order('created_at', { ascending: true })
          if (!refetch.error && refetch.data) {
            users = refetch.data
          }
        }
      }
    }

    const addedByIds = Array.from(
      new Set((users || []).map((user: any) => user.added_by).filter(Boolean).map((id: string) => String(id))),
    )
    const addedByMap: Record<string, string> = {}

    if (addedByIds.length > 0) {
      const { data: addedByProfiles } = await admin
        .from('profiles')
        .select('id, full_name')
        .in('id', addedByIds)

      for (const profile of addedByProfiles || []) {
        const id = String((profile as { id: string }).id)
        const name = String((profile as { full_name?: string | null }).full_name || '').trim()
        if (name) addedByMap[id] = name
      }

      const unresolved = addedByIds.filter((id) => !addedByMap[id])
      await Promise.all(
        unresolved.map(async (id) => {
          addedByMap[id] = await resolveStaffDisplayName(admin, id, null)
        }),
      )
    }

    const usersWithAddedBy = (users || []).map((user: any) => {
      const addedByKey = user.added_by != null ? String(user.added_by) : null
      return {
        ...user,
        added_by: addedByKey,
        added_by_name: addedByKey ? addedByMap[addedByKey] ?? null : null,
      }
    })

    return NextResponse.json({ users: usersWithAddedBy })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
