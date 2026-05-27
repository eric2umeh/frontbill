import { createAdminClient } from '@/lib/supabase/admin'
import { NextResponse } from 'next/server'
import { resolveAuthedUserId } from '@/lib/api/resolve-authed-user-id'
import { fetchNightAuditPendingNotificationItems } from '@/lib/night-audit/pending-notification-items'

export async function GET(request: Request) {
  try {
    const callerId = new URL(request.url).searchParams.get('caller_id')
    if (!callerId) {
      return NextResponse.json({ error: 'caller_id is required' }, { status: 400 })
    }

    const authedUserId = await resolveAuthedUserId(request)
    if (!authedUserId || authedUserId !== callerId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const admin = createAdminClient()
    const { data: callerProfile, error: callerError } = await admin
      .from('profiles')
      .select('role, organization_id')
      .eq('id', callerId)
      .single()

    if (callerError || !callerProfile?.organization_id) {
      return NextResponse.json({ notifications: [] })
    }

    const notifications = await fetchNightAuditPendingNotificationItems(
      admin,
      callerProfile.organization_id,
      callerProfile.role,
    )

    return NextResponse.json({ notifications })
  } catch (err) {
    console.error('[night-audit/pending-notifications]', err)
    return NextResponse.json({ notifications: [] })
  }
}
