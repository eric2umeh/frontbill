import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

/**
 * Auto-checkout cron job.
 *
 * Vercel Crons calls this route. It:
 *  1. Finds all bookings where check_out date < today AND status = 'checked_in'
 *  2. Also finds bookings where check_out = today AND status = 'checked_in'
 *     and the current server time is at or past 14:00 (2 pm) in WAT (UTC+1).
 *  3. Sets those bookings to status = 'checked_out', folio_status = 'checked_out',
 *     check_out = today, and frees the room (status = 'available').
 *
 * Schedule (vercel.json): every hour from 12:00 to 15:00 WAT = 11:00–14:00 UTC
 */
export async function GET(request: Request) {
  // Verify the request is from Vercel Cron (or an authorised internal call)
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = await createClient()

  // WAT = UTC+1. Get current WAT hour.
  const nowUTC = new Date()
  const nowWAT = new Date(nowUTC.getTime() + 60 * 60 * 1000) // +1 hour
  const watHour = nowWAT.getUTCHours()                        // e.g. 14 = 2 pm WAT
  const todayWAT = nowWAT.toISOString().split('T')[0]        // "YYYY-MM-DD"

  // Only proceed if WAT time is at or after 14:00 (2 pm)
  if (watHour < 14) {
    return NextResponse.json({
      message: `Too early — current WAT hour is ${watHour}. Auto-checkout runs at 14:00 WAT.`,
      checked_out: 0,
    })
  }

  // 1. Overdue bookings (check_out date is in the past)
  const { data: overdue, error: overdueErr } = await supabase
    .from('bookings')
    .select('id, room_id, guests(name), rooms(room_number), organization_id')
    .eq('status', 'checked_in')
    .lt('check_out', todayWAT)

  if (overdueErr) {
    console.error('[auto-checkout] Error fetching overdue bookings:', overdueErr.message)
    return NextResponse.json({ error: overdueErr.message }, { status: 500 })
  }

  // 2. Today's bookings past 2 pm
  const { data: todayExpired, error: todayErr } = await supabase
    .from('bookings')
    .select('id, room_id, guests(name), rooms(room_number), organization_id')
    .eq('status', 'checked_in')
    .eq('check_out', todayWAT)

  if (todayErr) {
    console.error('[auto-checkout] Error fetching today expired bookings:', todayErr.message)
    return NextResponse.json({ error: todayErr.message }, { status: 500 })
  }

  const toCheckout = [...(overdue ?? []), ...(todayExpired ?? [])]

  if (toCheckout.length === 0) {
    return NextResponse.json({ message: 'No bookings to auto-checkout.', checked_out: 0 })
  }

  const ids = toCheckout.map((b) => b.id)
  const roomIds = [...new Set(toCheckout.map((b) => b.room_id).filter(Boolean))]

  // Update bookings
  const { error: updateErr } = await supabase
    .from('bookings')
    .update({
      status: 'checked_out',
      folio_status: 'checked_out',
      check_out: todayWAT,
      updated_at: nowUTC.toISOString(),
    })
    .in('id', ids)

  if (updateErr) {
    console.error('[auto-checkout] Error updating bookings:', updateErr.message)
    return NextResponse.json({ error: updateErr.message }, { status: 500 })
  }

  // Free up the rooms
  if (roomIds.length > 0) {
    const { error: roomErr } = await supabase
      .from('rooms')
      .update({ status: 'available' })
      .in('id', roomIds)

    if (roomErr) {
      console.error('[auto-checkout] Error freeing rooms:', roomErr.message)
    }
  }

  console.log(`[auto-checkout] Auto-checked out ${toCheckout.length} booking(s) at WAT ${watHour}:00`)

  return NextResponse.json({
    message: `Auto-checkout complete.`,
    checked_out: toCheckout.length,
    booking_ids: ids,
  })
}
