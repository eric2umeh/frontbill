import { createAdminClient } from '@/lib/supabase/admin'
import { canonicalRoleKey } from '@/lib/permissions'
import { NextResponse } from 'next/server'

function isBackdateDeciderRole(role: string | null | undefined): boolean {
  const k = canonicalRoleKey(role)
  return k === 'admin' || k === 'superadmin'
}

/** Pending backdate queue size for admins; 0 for other roles or errors. */
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const callerId = searchParams.get('caller_id')

    if (!callerId) {
      return NextResponse.json({ error: 'caller_id is required' }, { status: 400 })
    }

    const admin = createAdminClient()
    const { data: callerProfile, error: callerError } = await admin
      .from('profiles')
      .select('role, organization_id')
      .eq('id', callerId)
      .single()

    if (callerError || !callerProfile?.organization_id) {
      return NextResponse.json({ count: 0 })
    }

    if (!isBackdateDeciderRole(callerProfile.role)) {
      return NextResponse.json({ count: 0 })
    }

    const { count, error } = await admin
      .from('backdate_requests')
      .select('*', { count: 'exact', head: true })
      .eq('organization_id', callerProfile.organization_id)
      .eq('status', 'pending')

    if (error) {
      console.error('[backdate-requests/pending-count]', error.message)
      return NextResponse.json({ count: 0 })
    }

    return NextResponse.json({ count: count ?? 0 })
  } catch (err: any) {
    console.error('[backdate-requests/pending-count]', err)
    return NextResponse.json({ count: 0 })
  }
}
