import { createAdminClient } from '@/lib/supabase/admin'
import { NextResponse } from 'next/server'

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

    if (!['superadmin', 'admin', 'manager'].includes(callerProfile.role)) {
      return NextResponse.json({ error: 'Only superadmins, admins or managers can list users' }, { status: 403 })
    }

    // Fetch all profiles in the same org — admin client bypasses RLS
    let { data: users, error: usersError }: { data: any[] | null; error: any } = await admin
      .from('profiles')
      .select('id, full_name, role, avatar_url, created_at, added_by')
      .eq('organization_id', callerProfile.organization_id)
      .order('created_at', { ascending: true })

    if (usersError && /added_by/i.test(usersError.message || '')) {
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

    const addedByIds = Array.from(new Set((users || []).map((user: any) => user.added_by).filter(Boolean)))
    const addedByMap: Record<string, string> = {}

    if (addedByIds.length > 0) {
      const { data: addedByProfiles } = await admin
        .from('profiles')
        .select('id, full_name')
        .in('id', addedByIds)

      ;(addedByProfiles || []).forEach((profile: any) => {
        if (profile.full_name) addedByMap[profile.id] = profile.full_name
      })
    }

    const fallbackCreator = (users || []).find((user: any) => user.role === 'admin' && user.full_name)
      || (users || []).find((user: any) => user.full_name)
    const fallbackCreatorName = fallbackCreator?.full_name || 'Unknown User'

    const usersWithAddedBy = (users || []).map((user: any) => ({
      ...user,
      added_by_name: user.added_by
        ? addedByMap[user.added_by] || fallbackCreatorName
        : fallbackCreatorName,
    }))

    return NextResponse.json({ users: usersWithAddedBy })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
