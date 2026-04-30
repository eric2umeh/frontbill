import { createAdminClient } from '@/lib/supabase/admin'
import { NextResponse } from 'next/server'

/**
 * Auto-checkout cron job — Hobby: once daily at 13:00 UTC (~14:00 WAT).
 *
 * Logic:
 *  1. Hard cutoff is 14:00 WAT (2 pm). Nothing runs before that.
 *  2. Finds bookings where check_out <= today (WAT date) and status is:
 *     - checked_in (guests on premises), or
 *     - reserved — release room holds that were never checked in (e.g. bulk blocks).
 *  3. For checked_in — same day only — may apply late checkout fee from org policy.
 *  4. Marks booking checked_out, preserves original scheduled check_out date, frees rooms.
 */
export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let supabase: ReturnType<typeof createAdminClient>
  try {
    supabase = createAdminClient()
  } catch {
    console.error('[auto-checkout] Missing SUPABASE_SERVICE_ROLE_KEY — cron cannot bypass RLS.')
    return NextResponse.json(
      { error: 'Server misconfiguration: service role key required for auto-checkout.' },
      { status: 500 },
    )
  }

  const nowUTC = new Date()
  const nowWAT = new Date(nowUTC.getTime() + 60 * 60 * 1000)
  const watHour = nowWAT.getUTCHours()
  const watMinute = nowWAT.getUTCMinutes()
  const todayWAT = nowWAT.toISOString().split('T')[0]

  if (watHour < 14) {
    return NextResponse.json({
      message: `Too early — WAT time is ${watHour}:${String(watMinute).padStart(2, '0')}. Auto-checkout enforces at 14:00 WAT.`,
      checked_out: 0,
    })
  }

  const selectCols = `
    id, status, room_id, organization_id, folio_id, guest_id,
    check_out, rate_per_night,
    guests (name),
    rooms (room_number)
  `

  const [checkedInRes, reservedRes] = await Promise.all([
    supabase.from('bookings').select(selectCols).eq('status', 'checked_in').lte('check_out', todayWAT),
    supabase.from('bookings').select(selectCols).eq('status', 'reserved').lte('check_out', todayWAT),
  ])

  if (checkedInRes.error) {
    console.error('[auto-checkout] Fetch error (checked_in):', checkedInRes.error.message)
    return NextResponse.json({ error: checkedInRes.error.message }, { status: 500 })
  }
  if (reservedRes.error) {
    console.error('[auto-checkout] Fetch error (reserved):', reservedRes.error.message)
    return NextResponse.json({ error: reservedRes.error.message }, { status: 500 })
  }

  const seen = new Set<string>()
  const toCheckout: NonNullable<typeof checkedInRes.data> = []
  for (const row of [...(checkedInRes.data || []), ...(reservedRes.data || [])]) {
    if (seen.has(row.id)) continue
    seen.add(row.id)
    toCheckout.push(row)
  }

  if (toCheckout.length === 0) {
    return NextResponse.json({ message: 'No bookings to auto-checkout.', checked_out: 0 })
  }

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
    if (booking.status !== 'checked_in') continue
    if (booking.check_out !== todayWAT) continue
    const policy = orgMap[booking.organization_id]
    if (!policy?.late_checkout_fee_per_hour) continue

    const [stdHour, stdMin] = (policy.checkout_time ?? '12:00').split(':').map(Number)
    const standardMinutes = stdHour * 60 + (stdMin ?? 0)
    const currentMinutes = watHour * 60 + watMinute
    const lateMinutes = currentMinutes - standardMinutes
    if (lateMinutes <= 0) continue

    const lateHours = Math.ceil(lateMinutes / 60)
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

  if (lateCharges.length > 0) {
    const { error: chargeErr } = await supabase.from('transactions').insert(lateCharges)
    if (chargeErr) {
      console.error('[auto-checkout] Late charge insert error:', chargeErr.message)
    }
  }

  const { error: updateErr } = await supabase
    .from('bookings')
    .update({
      status: 'checked_out',
      folio_status: 'checked_out',
      updated_at: nowUTC.toISOString(),
    })
    .in('id', ids)

  if (updateErr) {
    console.error('[auto-checkout] Update error:', updateErr.message)
    return NextResponse.json({ error: updateErr.message }, { status: 500 })
  }

  if (roomIds.length > 0) {
    await supabase.from('rooms').update({ status: 'available' }).in('id', roomIds)
  }

  console.log(
    `[auto-checkout] Checked out ${toCheckout.length} booking(s) (incl. overdue reserved), ${lateCharges.length} late fee(s).`
  )

  return NextResponse.json({
    message: 'Auto-checkout complete.',
    checked_out: toCheckout.length,
    late_charges_applied: lateCharges.length,
    booking_ids: ids,
  })
}
