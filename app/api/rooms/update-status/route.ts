import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { resolveRoomStatusAuthed } from '@/lib/rooms/room-status-auth'
import { applyRoomStatusUpdate, validateRoomStatusUpdate, type RoomStatusUpdateSource } from '@/lib/rooms/update-room-status'

export async function PATCH(request: Request) {
  try {
    const auth = await resolveRoomStatusAuthed()
    if ('error' in auth) {
      return NextResponse.json({ error: auth.error }, { status: auth.status })
    }

    const body = await request.json().catch(() => ({}))
    const roomId = String(body?.room_id || '').trim()
    const newStatus = String(body?.status || '').trim().toLowerCase()
    const source = String(body?.source || 'housekeeping').trim() as RoomStatusUpdateSource
    const remark = String(body?.remark || '').trim()
    const roomNumber = String(body?.room_number || '').trim()
    const scheduledDate = body?.scheduled_date ? String(body.scheduled_date) : undefined

    if (!roomId || !newStatus) {
      return NextResponse.json({ error: 'room_id and status are required' }, { status: 400 })
    }

    if (source !== 'housekeeping' && source !== 'maintenance') {
      return NextResponse.json({ error: 'Invalid source' }, { status: 400 })
    }

    const validation = validateRoomStatusUpdate({
      source,
      newStatus,
      role: auth.ctx.role,
    })
    if (!validation.ok) {
      return NextResponse.json({ error: validation.message }, { status: 400 })
    }

    const admin = createAdminClient()
    const result = await applyRoomStatusUpdate(admin, {
      organizationId: auth.ctx.organizationId,
      roomId,
      roomNumber,
      newStatus,
      source,
      userId: auth.ctx.userId,
      userName: auth.ctx.userName,
      remark,
      scheduledDate,
    })

    if (!result.ok) {
      return NextResponse.json({ error: result.message }, { status: 400 })
    }

    return NextResponse.json({ ok: true, status: result.status })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Could not update room status'
    console.error('[rooms/update-status]', error)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
