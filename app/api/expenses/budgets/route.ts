import { createAdminClient } from '@/lib/supabase/admin'
import { NextResponse } from 'next/server'
import { canAccessExpenseMenu, hasPermission } from '@/lib/permissions'

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const callerId = searchParams.get('caller_id')
    const year = Number(searchParams.get('year'))
    const month = Number(searchParams.get('month'))

    if (!callerId || !year || !month) {
      return NextResponse.json({ error: 'caller_id, year, month required' }, { status: 400 })
    }

    const admin = createAdminClient()
    const { data: prof } = await admin
      .from('profiles')
      .select('organization_id, role')
      .eq('id', callerId)
      .single()

    if (
      !prof?.organization_id ||
      !canAccessExpenseMenu(prof.role) ||
      !hasPermission(prof.role, 'expenses:view')
    ) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const { data, error } = await admin
      .from('expense_budgets')
      .select('id, category_id, budget_year, budget_month, amount_limit')
      .eq('organization_id', prof.organization_id)
      .eq('budget_year', year)
      .eq('budget_month', month)

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ budgets: data || [] })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const { caller_id, year, month, items } = body

    if (!caller_id || !year || !month || !Array.isArray(items)) {
      return NextResponse.json({ error: 'caller_id, year, month, items[] required' }, { status: 400 })
    }

    const admin = createAdminClient()
    const { data: prof } = await admin
      .from('profiles')
      .select('organization_id, role')
      .eq('id', caller_id)
      .single()

    if (
      !prof?.organization_id ||
      !canAccessExpenseMenu(prof.role) ||
      !hasPermission(prof.role, 'expenses:budget')
    ) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const rows = items
      .map((it: { category_id: string; amount_limit: number }) => ({
        organization_id: prof.organization_id,
        category_id: it.category_id,
        budget_year: year,
        budget_month: month,
        amount_limit: Math.max(0, Number(it.amount_limit) || 0),
        created_by: caller_id,
        updated_at: new Date().toISOString(),
      }))
      .filter((r) => r.category_id && r.amount_limit > 0)

    if (!rows.length) {
      return NextResponse.json({ ok: true, saved: 0 })
    }

    const { error } = await admin.from('expense_budgets').upsert(rows, {
      onConflict: 'organization_id,category_id,budget_year,budget_month',
    })

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true, saved: rows.length })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
