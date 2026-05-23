import { createAdminClient } from '@/lib/supabase/admin'
import { NextResponse } from 'next/server'
import { hasPermission } from '@/lib/permissions'
import {
  formatYMDInTimeZone,
  nightAuditClosingDateYmd,
  nightAuditNextBusinessDateYmd,
  resolveHotelTimeZone,
} from '@/lib/hotel-date'

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const { caller_id, audit_date: auditDateOverride } = body

    if (!caller_id) {
      return NextResponse.json({ error: 'caller_id is required' }, { status: 400 })
    }

    const admin = createAdminClient()
    const { data: prof } = await admin
      .from('profiles')
      .select('organization_id, role')
      .eq('id', caller_id)
      .single()

    if (!prof?.organization_id || !hasPermission(prof.role, 'night_audit:run')) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const orgId = prof.organization_id
    const now = new Date()

    const { data: org } = await admin
      .from('organizations')
      .select('timezone, business_date')
      .eq('id', orgId)
      .single()

    const tz = resolveHotelTimeZone(org?.timezone)
    const hotelToday = formatYMDInTimeZone(now, tz)

    let closingDate =
      typeof auditDateOverride === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(auditDateOverride)
        ? auditDateOverride
        : nightAuditClosingDateYmd(now, tz)

    if (closingDate > hotelToday) {
      return NextResponse.json(
        { error: 'Cannot audit a future business date' },
        { status: 400 },
      )
    }

    const nextBusinessDate = nightAuditNextBusinessDateYmd(closingDate)

    const { data: existing } = await admin
      .from('night_audits')
      .select('id')
      .eq('organization_id', orgId)
      .eq('audit_date', closingDate)
      .maybeSingle()

    if (existing?.id) {
      return NextResponse.json(
        { error: `Night audit for ${closingDate} was already completed` },
        { status: 409 },
      )
    }

    const [
      { data: checkedInBookings },
      { data: payments },
      { data: allRooms },
      { data: arrivals },
      { data: overdueBookings },
      { data: occupiedRooms },
    ] = await Promise.all([
      admin
        .from('bookings')
        .select('*, rooms(id, room_number), guests:guest_id(name)')
        .eq('organization_id', orgId)
        .eq('status', 'checked_in'),
      admin
        .from('payments')
        .select('*')
        .eq('organization_id', orgId)
        .gte('payment_date', `${closingDate}T00:00:00.000Z`)
        .lte('payment_date', `${closingDate}T23:59:59.999Z`),
      admin
        .from('rooms')
        .select('id, room_number, status')
        .eq('organization_id', orgId)
        .neq('status', 'maintenance'),
      admin
        .from('bookings')
        .select('id, folio_id, guests:guest_id(name), rooms:room_id(room_number), check_in')
        .eq('organization_id', orgId)
        .eq('status', 'reserved')
        .eq('check_in', nextBusinessDate),
      admin
        .from('bookings')
        .select('id, folio_id, guests:guest_id(name), rooms:room_id(room_number), check_out, balance, payment_status')
        .eq('organization_id', orgId)
        .eq('payment_status', 'pending')
        .lt('check_out', closingDate),
      admin.from('rooms').select('id, room_number').eq('organization_id', orgId).eq('status', 'occupied'),
    ])

    const anomalies: Array<{ type: string; severity: string; description: string; bookingId?: string }> = []

    overdueBookings?.forEach((b: Record<string, unknown>) => {
      const guests = b.guests as { name?: string } | null
      const rooms = b.rooms as { room_number?: string } | null
      anomalies.push({
        type: 'Overdue checkout',
        severity: 'high',
        description: `Booking ${(b.folio_id as string) || String(b.id).slice(0, 8)} – ${guests?.name || 'Unknown guest'} (Room ${rooms?.room_number || '?'}) was due to check out on or before ${b.check_out} but payment is still pending.`,
        bookingId: b.id as string,
      })
    })

    checkedInBookings?.forEach((b: Record<string, unknown>) => {
      const balance = Number(b.balance) || 0
      const total = Number(b.total_amount) || 0
      if (balance > total * 0.5) {
        const guests = b.guests as { name?: string } | null
        anomalies.push({
          type: 'High outstanding balance',
          severity: 'medium',
          description: `Booking ${(b.folio_id as string) || (b.booking_number as string) || String(b.id).slice(0, 8)} – ${guests?.name || 'Unknown guest'} has outstanding balance above 50% of folio total.`,
          bookingId: b.id as string,
        })
      }
    })

    const checkedInRoomIds = new Set(checkedInBookings?.map((b) => b.room_id as string) || [])
    occupiedRooms?.forEach((room: Record<string, unknown>) => {
      if (!checkedInRoomIds.has(room.id as string)) {
        anomalies.push({
          type: 'Room status mismatch',
          severity: 'high',
          description: `Room ${room.room_number} is marked occupied but has no active checked-in booking.`,
        })
      }
    })

    const totalRooms = allRooms?.length || 0
    const occupiedCount = checkedInBookings?.length || 0
    const totalRevenue = payments?.reduce((sum, p) => sum + (Number(p.amount) || 0), 0) || 0
    const occupancyRate = totalRooms > 0 ? Math.round((occupiedCount / totalRooms) * 100) : 0

    const pendingCheckouts =
      checkedInBookings?.filter((b) => String(b.check_out).slice(0, 10) === closingDate) || []

    const { data: auditRow, error: insertErr } = await admin
      .from('night_audits')
      .insert([
        {
          organization_id: orgId,
          audit_date: closingDate,
          total_checkouts: pendingCheckouts.length,
          total_checkins: arrivals?.length || 0,
          occupancy_rate: occupancyRate,
          actual_revenue: totalRevenue,
          variance: 0,
          issues: anomalies.map((a) => a.type),
          notes: anomalies.length
            ? anomalies.map((a) => a.description).join('\n')
            : null,
          created_by: caller_id,
        },
      ])
      .select('id, audit_date')
      .single()

    if (insertErr) {
      return NextResponse.json({ error: insertErr.message }, { status: 500 })
    }

    const { error: bizDateErr } = await admin
      .from('organizations')
      .update({ business_date: nextBusinessDate, updated_at: new Date().toISOString() })
      .eq('id', orgId)
    if (bizDateErr && !String(bizDateErr.message).includes('business_date')) {
      return NextResponse.json({ error: bizDateErr.message }, { status: 500 })
    }

    return NextResponse.json({
      ok: true,
      audit: auditRow,
      closing_date: closingDate,
      next_business_date: nextBusinessDate,
      hotel_today: hotelToday,
      summary: {
        occupancyRate,
        totalRooms,
        occupiedRooms: occupiedCount,
        totalRevenue,
        revenues: {
          cash:
            payments?.filter((p) => p.payment_method === 'cash').reduce((s, p) => s + Number(p.amount), 0) || 0,
          pos:
            payments?.filter((p) => p.payment_method === 'pos').reduce((s, p) => s + Number(p.amount), 0) || 0,
          transfer:
            payments
              ?.filter((p) => ['transfer', 'bank_transfer'].includes(String(p.payment_method)))
              .reduce((s, p) => s + Number(p.amount), 0) || 0,
          cityLedger:
            payments?.filter((p) => p.payment_method === 'city_ledger').reduce((s, p) => s + Number(p.amount), 0) ||
            0,
        },
        pendingCheckouts,
        expectedArrivals: arrivals || [],
        anomalies,
      },
    })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Night audit failed'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
