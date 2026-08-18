import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { resolveHousekeepingStatusWriteAuthed } from '@/lib/rooms/room-status-auth'
import {
  applyHousekeepingStatusUpdate,
  parseHousekeepingStatusInput,
} from '@/lib/rooms/update-housekeeping-status'

export async function PATCH(request: Request) {
  try {
    const auth = await resolveHousekeepingStatusWriteAuthed()
    if ('error' in auth) {
      return NextResponse.json({ error: auth.error }, { status: auth.status })
    }

    const body = await request.json().catch(() => ({}))
    const roomId = String(body?.room_id || '').trim()
    const roomNumber = String(body?.room_number || '').trim()
    const remark = String(body?.remark || '').trim()
    const scheduledDate = body?.scheduled_date ? String(body.scheduled_date) : undefined
    const hkStatus = parseHousekeepingStatusInput(String(body?.housekeeping_status || body?.status || ''))

    if (!roomId || !hkStatus) {
      return NextResponse.json(
        { error: 'room_id and a valid housekeeping_status are required' },
        { status: 400 },
      )
    }

    const admin = createAdminClient()
    const result = await applyHousekeepingStatusUpdate(admin, {
      organizationId: auth.ctx.organizationId,
      roomId,
      roomNumber,
      newStatus: hkStatus,
      userId: auth.ctx.userId,
      userName: auth.ctx.userName,
      remark: remark || undefined,
      scheduledDate,
    })

    if (!result.ok) {
      return NextResponse.json({ error: result.message }, { status: 400 })
    }

    return NextResponse.json({ ok: true, housekeeping_status: result.status })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Could not update housekeeping status'
    console.error('[rooms/housekeeping-status]', error)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
