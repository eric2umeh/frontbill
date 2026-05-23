import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { ensureExpenseCategories } from '@/lib/expenses/seed-categories'
import { canEditProfitabilityAssumptions, canViewProfitabilityAnalytics } from '@/lib/analytics/profitability-access'
import {
  buildProfitabilityAnalysis,
  mergeAssumptions,
} from '@/lib/analytics/profitability-model'
import type { ProfitabilityAssumptions } from '@/lib/analytics/profitability-types'
import {
  isOutletPaymentNotes,
  outletOrderAmount,
} from '@/lib/outlets/outlet-financial-integration'
import { format, subDays, startOfMonth, endOfMonth } from 'date-fns'

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

function parseYmd(value: string | null): string | null {
  const v = String(value || '').trim().slice(0, 10)
  return DATE_RE.test(v) ? v : null
}

function resolvePeriod(params: URLSearchParams) {
  const period = params.get('period') || '30d'
  const now = new Date()
  const today = format(now, 'yyyy-MM-dd')

  if (period === 'today') {
    return { start: today, end: today }
  }

  if (period === 'day') {
    const d = parseYmd(params.get('date')) || parseYmd(params.get('start_date'))
    if (d) return { start: d, end: d }
    return { start: today, end: today }
  }

  if (period === 'range') {
    const start = parseYmd(params.get('start_date'))
    const end = parseYmd(params.get('end_date')) || start
    if (start && end) {
      return start <= end ? { start, end } : { start: end, end: start }
    }
  }

  if (period === '7d') {
    return {
      start: format(subDays(now, 6), 'yyyy-MM-dd'),
      end: today,
    }
  }
  if (period === 'this_month') {
    return {
      start: format(startOfMonth(now), 'yyyy-MM-dd'),
      end: format(endOfMonth(now), 'yyyy-MM-dd'),
    }
  }

  return {
    start: format(subDays(now, 29), 'yyyy-MM-dd'),
    end: today,
  }
}

async function resolveCaller(callerId: string) {
  const admin = createAdminClient()
  const { data: prof } = await admin
    .from('profiles')
    .select('organization_id, role')
    .eq('id', callerId)
    .single()
  if (!prof?.organization_id || !canViewProfitabilityAnalytics(prof.role)) {
    return { error: 'Forbidden' as const, status: 403 }
  }
  return { admin, orgId: prof.organization_id, role: prof.role, userId: callerId }
}

export async function GET(request: Request) {
  try {
    const params = new URL(request.url).searchParams
    const callerId = params.get('caller_id')
    if (!callerId) {
      return NextResponse.json({ error: 'caller_id is required' }, { status: 400 })
    }

    const ctx = await resolveCaller(callerId)
    if ('error' in ctx) {
      return NextResponse.json({ error: ctx.error }, { status: ctx.status })
    }

    const { start, end } = resolvePeriod(params)
    const startIso = `${start}T00:00:00.000Z`
    const endIso = `${end}T23:59:59.999Z`

    await ensureExpenseCategories(ctx.admin, ctx.orgId)

    const { data: saved } = await ctx.admin
      .from('profitability_assumptions')
      .select('assumptions')
      .eq('organization_id', ctx.orgId)
      .maybeSingle()

    const assumptions = mergeAssumptions(
      (saved?.assumptions as Record<string, unknown>) || undefined,
    )

    const { data: bookings } = await ctx.admin
      .from('bookings')
      .select('check_in, check_out, status, rate_per_night')
      .eq('organization_id', ctx.orgId)
      .lte('check_in', end)
      .gt('check_out', start)

    const { data: expenseEntries } = await ctx.admin
      .from('expense_entries')
      .select('amount, expense_categories ( code, name )')
      .eq('organization_id', ctx.orgId)
      .gte('expense_date', start)
      .lte('expense_date', end)

    const { data: payments } = await ctx.admin
      .from('payments')
      .select('amount, notes')
      .eq('organization_id', ctx.orgId)
      .gte('payment_date', startIso)
      .lte('payment_date', endIso)

    const { data: outletOrders } = await ctx.admin
      .from('outlet_orders')
      .select('subtotal, room_service_fee, status, settled_at, created_at')
      .eq('organization_id', ctx.orgId)
      .eq('status', 'settled')

    const { count: roomCount } = await ctx.admin
      .from('rooms')
      .select('id', { count: 'exact', head: true })
      .eq('organization_id', ctx.orgId)

    const catTotals = new Map<string, { code: string; name: string; amount: number }>()
    for (const row of expenseEntries || []) {
      const cat = (row as { expense_categories?: { code: string; name: string } })
        .expense_categories
      if (!cat?.code) continue
      const prev = catTotals.get(cat.code) || { code: cat.code, name: cat.name, amount: 0 }
      prev.amount += Number((row as { amount: number }).amount) || 0
      catTotals.set(cat.code, prev)
    }

    let outletRevenue = 0
    for (const o of outletOrders || []) {
      const settled = (o as { settled_at?: string | null }).settled_at
      const created = (o as { created_at: string }).created_at
      const instant = settled || created
      const day = String(instant).slice(0, 10)
      if (day < start || day > end) continue
      outletRevenue += outletOrderAmount(
        o as {
          subtotal: number
          is_complimentary?: boolean | null
        },
      )
    }

    const paymentsTotal = (payments || []).reduce((s, p) => {
      if (isOutletPaymentNotes((p as { notes?: string | null }).notes)) return s
      return s + Math.max(0, Number((p as { amount: number }).amount) || 0)
    }, 0)

    const analysis = buildProfitabilityAnalysis({
      periodStart: start,
      periodEnd: end,
      assumptions,
      bookings: (bookings || []) as {
        check_in: string
        check_out: string
        status?: string | null
        rate_per_night?: number | null
      }[],
      expenseCategories: Array.from(catTotals.values()),
      paymentsTotal,
      outletRevenue,
      totalRoomsFromInventory: roomCount ?? undefined,
    })

    return NextResponse.json({
      assumptions,
      analysis,
      can_edit_assumptions: canEditProfitabilityAssumptions(ctx.role),
    })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Server error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

export async function PUT(request: Request) {
  try {
    const body = await request.json().catch(() => ({}))
    const callerId = String(body.caller_id || '')
    if (!callerId) {
      return NextResponse.json({ error: 'caller_id is required' }, { status: 400 })
    }

    const ctx = await resolveCaller(callerId)
    if ('error' in ctx) {
      return NextResponse.json({ error: ctx.error }, { status: ctx.status })
    }
    if (!canEditProfitabilityAssumptions(ctx.role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const assumptions = mergeAssumptions(
      body.assumptions as Record<string, unknown>,
    ) as ProfitabilityAssumptions

    const { error } = await ctx.admin.from('profitability_assumptions').upsert(
      {
        organization_id: ctx.orgId,
        assumptions,
        updated_by: ctx.userId,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'organization_id' },
    )

    if (error) {
      if (/profitability_assumptions/i.test(error.message) && /does not exist/i.test(error.message)) {
        return NextResponse.json(
          { error: 'Run scripts/057_profitability_assumptions.sql in Supabase first.' },
          { status: 400 },
        )
      }
      return NextResponse.json({ error: error.message }, { status: 400 })
    }

    return NextResponse.json({ ok: true, assumptions })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Server error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
