import { createAdminClient } from '@/lib/supabase/admin'
import { NextResponse } from 'next/server'
import { canonicalRoleKey } from '@/lib/permissions'
import {
  hotelCalendarDayUtcBounds,
  resolveHotelTimeZone,
} from '@/lib/hotel-date'
import { buildDailyFrontDeskPack } from '@/lib/reports/daily-front-desk-pack'

function isYmd(s: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(s)
}

function allowedRole(role: string | null | undefined): boolean {
  const k = canonicalRoleKey(role)
  return (
    k === 'superadmin' ||
    k === 'admin' ||
    k === 'manager' ||
    k === 'accountant' ||
    k === 'cashier' ||
    k === 'front_desk' ||
    k === 'auditor'
  )
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const callerId = searchParams.get('caller_id')
    const date = searchParams.get('date') || ''

    if (!callerId) {
      return NextResponse.json({ error: 'caller_id is required' }, { status: 400 })
    }
    if (!isYmd(date)) {
      return NextResponse.json({ error: 'date must be YYYY-MM-DD' }, { status: 400 })
    }

    const admin = createAdminClient()
    const { data: prof } = await admin
      .from('profiles')
      .select('organization_id, role')
      .eq('id', callerId)
      .single()

    if (!prof?.organization_id || !allowedRole(prof.role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const orgId = prof.organization_id
    const { data: org } = await admin
      .from('organizations')
      .select('timezone')
      .eq('id', orgId)
      .single()

    const tz = resolveHotelTimeZone(org?.timezone)
    const bounds = hotelCalendarDayUtcBounds(date, tz)

    const [{ data: bookings }, { data: transactions }, { data: payments }] =
      await Promise.all([
        admin
          .from('bookings')
          .select(
            'id, check_in, check_out, status, rate_per_night, folio_id, payment_status, guest_id, guests:guest_id(name), rooms:room_id(room_number, room_type)',
          )
          .eq('organization_id', orgId)
          .in('status', ['confirmed', 'checked_in', 'reserved', 'checked_out'])
          .lte('check_in', date)
          .gt('check_out', date)
          .limit(500),
        admin
          .from('transactions')
          .select(
            'id, amount, payment_method, status, booking_id, created_at, transaction_id, guest_name, description, room',
          )
          .eq('organization_id', orgId)
          .gte('created_at', bounds.startIso)
          .lte('created_at', bounds.endInclusiveIso)
          .limit(5000),
        admin
          .from('payments')
          .select(
            'id, amount, payment_method, booking_id, payment_date, reference_number, notes, guest_id',
          )
          .eq('organization_id', orgId)
          .gte('payment_date', bounds.startIso)
          .lte('payment_date', bounds.endInclusiveIso)
          .limit(5000),
      ])

    const guestIds = Array.from(
      new Set((payments || []).map((p: any) => p.guest_id).filter(Boolean)),
    )
    const guestNameById: Record<string, string> = {}
    if (guestIds.length > 0) {
      const { data: guests } = await admin
        .from('guests')
        .select('id, name')
        .in('id', guestIds)
      for (const g of guests || []) {
        guestNameById[(g as any).id] = (g as any).name
      }
    }

    const pack = buildDailyFrontDeskPack({
      dateYmd: date,
      bookings: (bookings || []) as any,
      transactions: (transactions || []) as any,
      payments: (payments || []) as any,
      guestNameById,
    })

    return NextResponse.json({
      ok: true,
      pack,
      note:
        'Room revenue = sum of rate_per_night for guests occupying that hotel night. Sales collection = cash/POS/transfer inflows that day (city ledger posted separately, not in collection total).',
    })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Daily book failed'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
