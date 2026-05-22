import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { resolveOutletAuthed } from '@/lib/outlets/api-auth'
import { mapOccupyingBookingsByRoomId } from '@/lib/outlets/occupying-booking'

export async function GET(request: Request) {
  const q = new URL(request.url).searchParams.get('q')?.trim() || ''

  const auth = await resolveOutletAuthed(request, { permission: 'outlet:sell' })
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const admin = createAdminClient()
  const orgId = auth.ctx.organizationId

  let roomQuery = admin
    .from('rooms')
    .select('id, room_number, status')
    .eq('organization_id', orgId)
    .order('room_number')
    .limit(25)

  if (q) {
    roomQuery = roomQuery.ilike('room_number', `%${q}%`)
  }

  const { data: rooms, error } = await roomQuery
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })

  const roomIds = (rooms ?? []).map((r) => r.id)
  const bookingByRoomId = await mapOccupyingBookingsByRoomId(admin, orgId, roomIds)

  return NextResponse.json({
    rooms: (rooms ?? []).map((r) => {
      const booking = bookingByRoomId.get(r.id)
      return {
        id: r.id,
        room_number: r.room_number,
        status: r.status,
        booking: booking
          ? {
              id: booking.id,
              guest_name: booking.guest_name,
              folio_id: booking.folio_id,
            }
          : null,
      }
    }),
  })
}
