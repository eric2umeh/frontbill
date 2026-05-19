import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { resolveOutletAuthed } from '@/lib/outlets/api-auth'
import { findActiveBookingByRoom } from '@/lib/outlets/find-active-booking'

export async function GET(request: Request) {
  const room = new URL(request.url).searchParams.get('room')?.trim() || ''
  if (!room) {
    return NextResponse.json({ error: 'room query required' }, { status: 400 })
  }

  const auth = await resolveOutletAuthed(request, { permission: 'outlet:sell' })
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const admin = createAdminClient()
  const booking = await findActiveBookingByRoom(admin, auth.ctx.organizationId, room)
  if (!booking) {
    return NextResponse.json({ booking: null })
  }
  return NextResponse.json({ booking })
}
