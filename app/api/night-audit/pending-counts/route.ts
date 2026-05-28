import { createAdminClient } from '@/lib/supabase/admin'
import { NextResponse } from 'next/server'
import {
  EMPTY_NIGHT_AUDIT_PENDING_COUNTS,
  fetchNightAuditPendingCounts,
} from '@/lib/night-audit/pending-approval-counts'
import { resolveAuthedUserId } from '@/lib/auth/resolve-authed-user-id'

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
      return NextResponse.json({ counts: EMPTY_NIGHT_AUDIT_PENDING_COUNTS })
    }

    const counts = await fetchNightAuditPendingCounts(
      admin,
      callerProfile.organization_id,
      callerProfile.role,
    )

    return NextResponse.json({ counts })
  } catch (err) {
    console.error('[night-audit/pending-counts]', err)
    return NextResponse.json({ counts: EMPTY_NIGHT_AUDIT_PENDING_COUNTS })
  }
}
