import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { resolveRoomStatusAuthed } from '@/lib/rooms/room-status-auth'
import { fetchRoomStatusRemarks } from '@/lib/rooms/room-status-remarks'

export async function GET(request: Request) {
  try {
    const auth = await resolveRoomStatusAuthed()
    if ('error' in auth) {
      return NextResponse.json({ error: auth.error }, { status: auth.status })
    }

    const roomId = new URL(request.url).searchParams.get('room_id')?.trim()
    if (!roomId) {
      return NextResponse.json({ error: 'room_id is required' }, { status: 400 })
    }

    const admin = createAdminClient()
    const remarks = await fetchRoomStatusRemarks(admin, auth.ctx.organizationId, roomId)
    return NextResponse.json({ remarks })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Could not load remarks'
    console.error('[rooms/status-remarks]', error)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
