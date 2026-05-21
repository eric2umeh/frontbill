import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { resolveOutletAuthed } from '@/lib/outlets/api-auth'
import { isOutletDepartmentKey } from '@/lib/outlets/departments'
import { buildOutletDailyReport } from '@/lib/outlets/build-daily-report'
import {
  calendarDateMinusOneDay,
  formatYMDInTimeZone,
  nightAuditClosingDateYmd,
  nightAuditNextBusinessDateYmd,
  resolveHotelTimeZone,
} from '@/lib/hotel-date'

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams
  const department = params.get('department') || ''
  const reportDate = params.get('report_date') || ''
  if (!isOutletDepartmentKey(department)) {
    return NextResponse.json({ error: 'department required' }, { status: 400 })
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(reportDate)) {
    return NextResponse.json({ error: 'report_date (YYYY-MM-DD) required' }, { status: 400 })
  }

  const auth = await resolveOutletAuthed(request, {
    department,
    permission: 'outlet:reports',
  })
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const admin = createAdminClient()
  const { data, error } = await admin
    .from('outlet_daily_reports')
    .select('*')
    .eq('organization_id', auth.ctx.organizationId)
    .eq('department', department)
    .eq('report_date', reportDate)
    .maybeSingle()

  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json({ report: data ?? null })
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}))
  const department = body?.department as string
  if (!isOutletDepartmentKey(department)) {
    return NextResponse.json({ error: 'department required' }, { status: 400 })
  }

  const authDept = await resolveOutletAuthed(request, {
    department,
    permission: 'outlet:reports',
  })
  if ('error' in authDept) return NextResponse.json({ error: authDept.error }, { status: authDept.status })

  const admin = createAdminClient()
  const { data: org } = await admin
    .from('organizations')
    .select('timezone')
    .eq('id', authDept.ctx.organizationId)
    .single()

  const tz = resolveHotelTimeZone(org?.timezone)
  const hotelToday = formatYMDInTimeZone(new Date(), tz)
  let reportDate =
    typeof body?.report_date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(body.report_date)
      ? body.report_date
      : nightAuditClosingDateYmd(new Date(), tz)

  if (reportDate > hotelToday) {
    return NextResponse.json({ error: 'Cannot close a future business date' }, { status: 400 })
  }

  const { data: existing } = await admin
    .from('outlet_daily_reports')
    .select('id')
    .eq('organization_id', authDept.ctx.organizationId)
    .eq('department', department)
    .eq('report_date', reportDate)
    .maybeSingle()

  if (existing?.id) {
    return NextResponse.json(
      { error: `Daily report for ${reportDate} was already completed for this outlet` },
      { status: 409 },
    )
  }

  const fetchFrom = calendarDateMinusOneDay(calendarDateMinusOneDay(reportDate))
  const fetchTo = nightAuditNextBusinessDateYmd(reportDate)

  const { data: orders, error: oe } = await admin
    .from('outlet_orders')
    .select('*, outlet_order_lines(*)')
    .eq('organization_id', authDept.ctx.organizationId)
    .eq('department', department)
    .gte('created_at', `${fetchFrom}T00:00:00.000Z`)
    .lte('created_at', `${fetchTo}T23:59:59.999Z`)

  if (oe) return NextResponse.json({ error: oe.message }, { status: 400 })

  const payload = buildOutletDailyReport(department, reportDate, orders ?? [], tz)

  const { data: saved, error: se } = await admin
    .from('outlet_daily_reports')
    .insert({
      organization_id: authDept.ctx.organizationId,
      department,
      report_date: reportDate,
      order_count: payload.order_count,
      void_count: payload.void_count,
      gross_sales: payload.gross_sales,
      payment_breakdown: payload.payment_breakdown,
      top_items: payload.top_items,
      summary: payload.summary,
      notes: body?.notes || null,
      created_by: authDept.ctx.userId,
    })
    .select()
    .single()

  if (se) return NextResponse.json({ error: se.message }, { status: 400 })

  return NextResponse.json({
    ok: true,
    report: saved,
    payload,
  })
}
