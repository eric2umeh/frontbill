import { createClient } from '@/lib/supabase/server'
import { reconcileRoomStatusesForOrganization } from '@/lib/rooms/room-occupancy'
import { NextResponse } from 'next/server'

/** POST — sync rooms.status with active in-house folios (fixes stuck occupied after checkout). */
export async function POST() {
  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { data: profile } = await supabase
      .from('profiles')
      .select('organization_id')
      .eq('id', user.id)
      .maybeSingle()

    const organizationId = profile?.organization_id
    if (!organizationId) {
      return NextResponse.json({ error: 'No organization' }, { status: 400 })
    }

    const result = await reconcileRoomStatusesForOrganization(supabase, organizationId)
    return NextResponse.json({ ok: true, ...result })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Reconcile failed'
    console.error('[rooms/reconcile-status]', error)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
