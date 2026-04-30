import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

/**
 * Auto-checkout cron job — Hobby: once daily at 13:00 UTC (~14:00 WAT).
 *
 * Logic:
 *  1. Hard cutoff is 14:00 WAT (2 pm). Nothing runs before that.
 *  2. Finds all bookings where check_out <= today AND status = 'checked_in'.
 *  3. For each booking, calculates how many hours past the hotel's standard
 *     checkout_time the guest has stayed and — if late_checkout_fee_per_hour
 *     is set — auto-creates a "Late Checkout Fee" charge transaction.
 *  4. Marks booking as checked_out and frees the room.
 */
export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = await createClient()

  // WAT = UTC+1
  const nowUTC = new Date()
  const nowWAT = new Date(nowUTC.getTime() + 60 * 60 * 1000)
  const watHour = nowWAT.getUTCHours()   // 14 = 2 pm WAT
  const watMinute = nowWAT.getUTCMinutes()
  const todayWAT = nowWAT.toISOString().split('T')[0]

  // Hard gate — nothing runs before 14:00 WAT
  if (watHour < 14) {
    return NextResponse.json({
      message: `Too early — WAT time is ${watHour}:${String(watMinute).padStart(2, '0')}. Auto-checkout enforces at 14:00 WAT.`,
      checked_out: 0,
    })
  }

  // Fetch all overdue checked-in bookings (check_out date <= today)
  const { data: toCheckout, error: fetchErr } = await supabase
    .from('bookings')
    .select(`
      id, room_id, organization_id, folio_id, guest_id,
      check_out, rate_per_night,
      guests (name),
      rooms (room_number)
    `)
    .eq('status', 'checked_in')
    .lte('check_out', todayWAT)

  if (fetchErr) {
    console.error('[auto-checkout] Fetch error:', fetchErr.message)
    return NextResponse.json({ error: fetchErr.message }, { status: 500 })
  }

  if (!toCheckout || toCheckout.length === 0) {
    return NextResponse.json({ message: 'No bookings to auto-checkout.', checked_out: 0 })
  }

  // Group by organization to fetch each org's checkout policy once
  const orgIds = [...new Set(toCheckout.map((b) => b.organization_id).filter(Boolean))]
  const { data: orgs } = await supabase
    .from('organizations')
    .select('id, checkout_time, late_checkout_fee_per_hour')
    .in('id', orgIds)

  const orgMap: Record<string, { checkout_time: string; late_checkout_fee_per_hour: number | null }> = {}
  for (const org of orgs ?? []) {
    orgMap[org.id] = {
      checkout_time: org.checkout_time ?? '12:00',
      late_checkout_fee_per_hour: org.late_checkout_fee_per_hour ?? null,
    }
  }

  const ids = toCheckout.map((b) => b.id)
  const roomIds = [...new Set(toCheckout.map((b) => b.room_id).filter(Boolean))]

  // For today's checkouts — calculate late fee hours
  // Standard checkout is e.g. "12:00", auto-checkout fires at 14:00 = 2 hours late
  const lateCharges: Array<{
    organization_id: string
    booking_id: string
    folio_id: string | null
    guest_id: string | null
    amount: number
    description: string
    transaction_type: string
    payment_method: string
    created_at: string
  }> = []

  for (const booking of toCheckout) {
    if (booking.check_out !== todayWAT) continue // overdue from previous days — no extra fee
    const policy = orgMap[booking.organization_id]
    if (!policy?.late_checkout_fee_per_hour) continue

    const [stdHour, stdMin] = (policy.checkout_time ?? '12:00').split(':').map(Number)
    const standardMinutes = stdHour * 60 + (stdMin ?? 0)
    const currentMinutes = watHour * 60 + watMinute
    const lateMinutes = currentMinutes - standardMinutes
    if (lateMinutes <= 0) continue

    const lateHours = Math.ceil(lateMinutes / 60) // round up to next hour
    const feeAmount = lateHours * policy.late_checkout_fee_per_hour

    lateCharges.push({
      organization_id: booking.organization_id,
      booking_id: booking.id,
      folio_id: booking.folio_id ?? null,
      guest_id: booking.guest_id ?? null,
      amount: feeAmount,
      description: `Late checkout fee — ${lateHours} hour${lateHours > 1 ? 's' : ''} past ${policy.checkout_time} (auto-charged at 2:00 PM)`,
      transaction_type: 'charge',
      payment_method: 'cash',
      created_at: nowUTC.toISOString(),
    })
  }

  // Insert late charges
  if (lateCharges.length > 0) {
    const { error: chargeErr } = await supabase.from('transactions').insert(lateCharges)
    if (chargeErr) {
      console.error('[auto-checkout] Late charge insert error:', chargeErr.message)
    }
  }

  // Mark all as checked out
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
    console.error('[auto-checkout] Update error:', updateErr.message)
    return NextResponse.json({ error: updateErr.message }, { status: 500 })
  }

  // Free the rooms
  if (roomIds.length > 0) {
    await supabase.from('rooms').update({ status: 'available' }).in('id', roomIds)
  }

  console.log(`[auto-checkout] Checked out ${toCheckout.length} booking(s), ${lateCharges.length} late fee(s) applied.`)

  return NextResponse.json({
    message: 'Auto-checkout complete.',
    checked_out: toCheckout.length,
    late_charges_applied: lateCharges.length,
    booking_ids: ids,
  })
}
