import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { hasPermission } from '@/lib/permissions'
import { resolveRoomStatusReadAuthed } from '@/lib/rooms/room-status-auth'
import { todayYmdHotel } from '@/lib/utils/booking-in-house-dates'
import { buildHousekeepingFloorReport } from '@/lib/reports/housekeeping-floor-report'

export async function GET() {
  try {
    const auth = await resolveRoomStatusReadAuthed()
    if ('error' in auth) {
      return NextResponse.json({ error: auth.error }, { status: auth.status })
    }

    if (!hasPermission(auth.ctx.role, 'housekeeping:view')) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const admin = createAdminClient()
    const orgId = auth.ctx.organizationId
    const asOfDate = todayYmdHotel()

    const [{ data: rooms, error: roomErr }, { data: bookings, error: bookErr }] =
      await Promise.all([
        admin
          .from('rooms')
          .select('id, room_number, room_type, status, housekeeping_status')
          .eq('organization_id', orgId)
          .order('room_number'),
        admin
          .from('bookings')
          .select(
            'id, room_id, check_in, check_out, status, folio_id, folio_status, guests:guest_id(name), rooms:room_id(room_number, room_type)',
          )
          .eq('organization_id', orgId)
          .in('status', ['reserved', 'confirmed', 'checked_in'])
          .limit(5000),
      ])

    if (roomErr) {
      return NextResponse.json({ error: roomErr.message }, { status: 500 })
    }
    if (bookErr) {
      return NextResponse.json({ error: bookErr.message }, { status: 500 })
    }

    const report = buildHousekeepingFloorReport({
      asOfDate,
      rooms: rooms || [],
      bookings: bookings || [],
    })

    return NextResponse.json({ ok: true, report })
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : 'Could not load housekeeping report'
    console.error('[reports/housekeeping-floor]', error)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
