import { createAdminClient } from '@/lib/supabase/admin'
import { NextResponse } from 'next/server'
import { canAccessExpenseMenu, hasPermission } from '@/lib/permissions'
import { parseExpenditureGrid } from '@/lib/expenses/parse-expenditure-import'
import { ensureExpenseCategories } from '@/lib/expenses/seed-categories'
import { slugifyExpenseCode } from '@/lib/expenses/default-categories'

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const { caller_id, rows } = body

    if (!caller_id || !Array.isArray(rows)) {
      return NextResponse.json({ error: 'caller_id and rows[][] required' }, { status: 400 })
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
      !hasPermission(prof.role, 'expenses:export')
    ) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const orgId = prof.organization_id
    await ensureExpenseCategories(admin, orgId)

    const parsed = parseExpenditureGrid(rows as string[][])

    const { data: existingCats } = await admin
      .from('expense_categories')
      .select('id, code, name')
      .eq('organization_id', orgId)

    const codeToId = new Map((existingCats || []).map((c: any) => [c.code, c.id]))
    const nameToId = new Map(
      (existingCats || []).map((c: any) => [String(c.name).toLowerCase(), c.id]),
    )

    for (const cat of parsed.categories) {
      if (codeToId.has(cat.code)) continue
      const { data: ins } = await admin
        .from('expense_categories')
        .insert([
          {
            organization_id: orgId,
            code: cat.code,
            name: cat.name,
            sort_order: cat.sort_order,
            is_active: true,
          },
        ])
        .select('id, code, name')
        .single()
      if (ins) codeToId.set(ins.code, ins.id)
    }

    const upserts: Record<string, unknown>[] = []
    for (const cell of parsed.cells) {
      let catId = codeToId.get(cell.category_code)
      if (!catId) catId = nameToId.get(cell.category_name.toLowerCase())
      if (!catId) {
        const code = slugifyExpenseCode(cell.category_name)
        const { data: ins } = await admin
          .from('expense_categories')
          .insert([
            {
              organization_id: orgId,
              code,
              name: cell.category_name,
              sort_order: 900,
              is_active: true,
            },
          ])
          .select('id')
          .single()
        if (ins) {
          catId = ins.id
          codeToId.set(code, catId)
        }
      }
      if (!catId) continue
      upserts.push({
        organization_id: orgId,
        expense_date: cell.expense_date,
        category_id: catId,
        amount: cell.amount,
        recorded_by: caller_id,
        updated_at: new Date().toISOString(),
      })
    }

    for (const note of parsed.dayNotes) {
      await admin.from('expense_day_notes').upsert(
        [
          {
            organization_id: orgId,
            expense_date: note.expense_date,
            description: note.description,
            updated_by: caller_id,
            updated_at: new Date().toISOString(),
          },
        ],
        { onConflict: 'organization_id,expense_date' },
      )
    }

    if (upserts.length) {
      const { error } = await admin.from('expense_entries').upsert(upserts, {
        onConflict: 'organization_id,expense_date,category_id',
      })
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({
      ok: true,
      imported_cells: upserts.length,
      imported_notes: parsed.dayNotes.length,
      categories_seen: parsed.categories.length,
    })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
