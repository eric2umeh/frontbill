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

    if (!['admin', 'manager'].includes(callerProfile.role)) {
      return NextResponse.json({ error: 'Only admins or managers can list users' }, { status: 403 })
    }

    // Fetch all profiles in the same org — admin client bypasses RLS
    const { data: users, error: usersError } = await admin
      .from('profiles')
      .select('id, full_name, role, avatar_url, created_at')
      .eq('organization_id', callerProfile.organization_id)
      .order('created_at', { ascending: true })

    if (usersError) {
      return NextResponse.json({ error: usersError.message }, { status: 500 })
    }

    return NextResponse.json({ users: users || [] })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
