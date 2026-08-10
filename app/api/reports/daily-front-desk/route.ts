import { createAdminClient } from '@/lib/supabase/admin'
import { NextResponse } from 'next/server'
import { canonicalRoleKey } from '@/lib/permissions'
import { resolveHotelTimeZone } from '@/lib/hotel-date'
import { fetchHotelBusinessNightUtcBounds } from '@/lib/payments/business-night-bounds'
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
      .select('timezone, business_date')
      .eq('id', orgId)
      .single()

    const tz = resolveHotelTimeZone(org?.timezone)
    const orgBusinessDate =
      typeof org?.business_date === 'string' ? String(org.business_date).slice(0, 10) : null
    const bounds = await fetchHotelBusinessNightUtcBounds({
      supabase: admin,
      organizationId: orgId,
      ymd: date,
      timeZone: tz,
      orgBusinessDate,
    })

    const emptyLedger = bounds.empty
    const [{ data: bookings, error: bookErr }, txRes, payRes] = await Promise.all([
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
      // select * so missing optional columns (e.g. before/after SQL 076) never zero-out the ledger
      emptyLedger
        ? Promise.resolve({ data: [] as unknown[], error: null })
        : admin
            .from('transactions')
            .select('*')
            .eq('organization_id', orgId)
            .gte('created_at', bounds.startIso)
            .lte('created_at', bounds.endInclusiveIso)
            .limit(5000),
      emptyLedger
        ? Promise.resolve({ data: [] as unknown[], error: null })
        : admin
            .from('payments')
            .select('*')
            .eq('organization_id', orgId)
            .gte('payment_date', bounds.startIso)
            .lte('payment_date', bounds.endInclusiveIso)
            .limit(5000),
    ])

    if (bookErr) {
      console.error('[daily-front-desk] bookings', bookErr.message)
    }
    if (txRes.error) {
      console.error('[daily-front-desk] transactions', txRes.error.message)
    }
    if (payRes.error) {
      console.error('[daily-front-desk] payments', payRes.error.message)
    }

    const transactions = txRes.data || []
    const payments = payRes.data || []

    const guestIds = Array.from(
      new Set((payments || []).map((p: { guest_id?: string | null }) => p.guest_id).filter(Boolean)),
    ) as string[]
    const guestNameById: Record<string, string> = {}
    if (guestIds.length > 0) {
      const { data: guests } = await admin
        .from('guests')
        .select('id, name')
        .in('id', guestIds)
      for (const g of guests || []) {
        guestNameById[(g as { id: string }).id] = (g as { name: string }).name
      }
    }

    const pack = buildDailyFrontDeskPack({
      dateYmd: date,
      bookings: (bookings || []) as any,
      transactions: transactions as any,
      payments: payments as any,
      guestNameById,
    })

    return NextResponse.json({
      ok: true,
      pack,
      meta: {
        bounds,
        transactionCount: transactions.length,
        paymentCount: payments.length,
        bookingCount: (bookings || []).length,
        txError: txRes.error?.message || null,
        payError: payRes.error?.message || null,
      },
      note:
        'Room revenue = sum of rate_per_night for guests occupying that hotel night. Sales collection = cash/POS/transfer from the previous night audit (or day start) until this night’s audit click (or now if still open). City ledger is posted separately and not in the collection total.',
    })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Daily book failed'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
