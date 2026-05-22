import { createAdminClient } from '@/lib/supabase/admin'
import { NextResponse } from 'next/server'

export async function POST(request: Request) {
  try {
    const { caller_id, user_ids } = await request.json()
    const userIds = Array.from(new Set((user_ids || []).filter(Boolean))) as string[]

    if (!caller_id) {
      return NextResponse.json({ error: 'caller_id is required' }, { status: 400 })
    }

    if (userIds.length === 0) {
      return NextResponse.json({ names: {} })
    }

    const admin = createAdminClient()
    const { data: callerProfile, error: callerError } = await admin
      .from('profiles')
      .select('organization_id')
      .eq('id', caller_id)
      .single()

    if (callerError || !callerProfile?.organization_id) {
      return NextResponse.json({ error: 'Caller profile not found' }, { status: 403 })
    }

    const { data: profiles, error: profilesError } = await admin
      .from('profiles')
      .select('id, full_name')
      .eq('organization_id', callerProfile.organization_id)
      .in('id', userIds)

    if (profilesError) {
      return NextResponse.json({ error: profilesError.message }, { status: 500 })
    }

    const names: Record<string, string> = {}
    const missingNameIds: string[] = []

    ;(profiles || []).forEach((profile: any) => {
      const name = String(profile.full_name || '').trim()
      if (name) {
        names[profile.id] = name
      } else {
        missingNameIds.push(profile.id)
      }
    })

    // Skip slow Auth Admin lookups on list pages — fall back to profile id labels in the UI.
    for (const id of missingNameIds) {
      if (!names[id]) {
        names[id] = id.slice(0, 8)
      }
    }

    return NextResponse.json({ names })
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Failed to resolve profile names' }, { status: 500 })
  }
}
