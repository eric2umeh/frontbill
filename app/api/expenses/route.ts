import { createAdminClient } from '@/lib/supabase/admin'
import { NextResponse } from 'next/server'
import { canAccessExpenseMenu, hasPermission } from '@/lib/permissions'
import { ensureExpenseCategories } from '@/lib/expenses/seed-categories'
import { resolveProfileNames } from '@/lib/expenses/resolve-profile-names'
import { EXPENSE_PAYMENT_METHODS } from '@/lib/payments/payment-methods'

const PAYMENT_METHODS = EXPENSE_PAYMENT_METHODS

async function logExpenseAudit(
  admin: ReturnType<typeof createAdminClient>,
  orgId: string,
  actorId: string,
  action: string,
  entryId: string | null,
  payload: Record<string, unknown>,
) {
  try {
    await admin.from('expense_audit_log').insert([
      {
        organization_id: orgId,
        expense_entry_id: entryId,
        action,
        payload,
        actor_id: actorId,
      },
    ])
  } catch {
    /* non-fatal */
  }
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const callerId = searchParams.get('caller_id')
    const start = searchParams.get('start_date') || ''
    const end = searchParams.get('end_date') || ''

    if (!callerId) {
      return NextResponse.json({ error: 'caller_id is required' }, { status: 400 })
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

    await ensureExpenseCategories(admin, prof.organization_id)

    let entriesQuery = admin
      .from('expense_entries')
      .select(
        `id, expense_date, category_id, amount, description, payment_method, reference, receipt_url,
         store_movement_id, recorded_by, updated_by, created_at, updated_at,
         expense_categories ( id, name, code )`,
      )
      .eq('organization_id', prof.organization_id)
      .order('created_at', { ascending: false })

    if (start) entriesQuery = entriesQuery.gte('expense_date', start)
    if (end) entriesQuery = entriesQuery.lte('expense_date', end)

    const [{ data: entries, error: ee }, { data: notes, error: ne }] = await Promise.all([
      entriesQuery,
      admin
        .from('expense_day_notes')
        .select('expense_date, description')
        .eq('organization_id', prof.organization_id)
        .gte('expense_date', start || '1900-01-01')
        .lte('expense_date', end || '2999-12-31'),
    ])

    if (ee) return NextResponse.json({ error: ee.message }, { status: 500 })
    if (ne) return NextResponse.json({ error: ne.message }, { status: 500 })

    const userIds = (entries || []).flatMap((e) => [e.recorded_by, e.updated_by].filter(Boolean) as string[])
    const nameMap = await resolveProfileNames(admin, userIds)

    const enriched = (entries || []).map((e) => ({
      ...e,
      created_by: e.recorded_by,
      created_by_name: e.recorded_by ? nameMap[e.recorded_by] : null,
      updated_by_name: e.updated_by ? nameMap[e.updated_by] : null,
    }))

    return NextResponse.json({ entries: enriched, day_notes: notes || [] })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

/** Bulk save month grid: { caller_id, year, month, days: [{ date, description?, cells: { category_id: amount } }] } */
export async function POST(request: Request) {
  try {
    const body = await request.json()
    const { caller_id, bulk, entry, delete_id } = body

    if (!caller_id) {
      return NextResponse.json({ error: 'caller_id is required' }, { status: 400 })
    }

    const admin = createAdminClient()
    const { data: prof } = await admin
      .from('profiles')
      .select('organization_id, role')
      .eq('id', caller_id)
      .single()

    if (!prof?.organization_id || !canAccessExpenseMenu(prof.role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const orgId = prof.organization_id

    if (delete_id) {
      if (!hasPermission(prof.role, 'expenses:edit')) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
      }
      const { error } = await admin
        .from('expense_entries')
        .delete()
        .eq('id', delete_id)
        .eq('organization_id', orgId)
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
      await logExpenseAudit(admin, orgId, caller_id, 'delete', delete_id, {})
      return NextResponse.json({ ok: true })
    }

    if (bulk) {
      if (!hasPermission(prof.role, 'expenses:create')) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
      }
      const days = bulk.days as Array<{
        date: string
        description?: string
        cells?: Record<string, number | string>
      }>
      if (!Array.isArray(days)) {
        return NextResponse.json({ error: 'bulk.days required' }, { status: 400 })
      }

      const upserts: Record<string, unknown>[] = []

      for (const day of days) {
        const date = String(day.date || '').slice(0, 10)
        if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) continue

        if (day.description !== undefined) {
          await admin.from('expense_day_notes').upsert(
            [
              {
                organization_id: orgId,
                expense_date: date,
                description: String(day.description || '').trim() || null,
                updated_by: caller_id,
                updated_at: new Date().toISOString(),
              },
            ],
            { onConflict: 'organization_id,expense_date' },
          )
        }

        const cells = day.cells || {}

        for (const [categoryId, rawAmt] of Object.entries(cells)) {
          const amt = Number(rawAmt)
          if (!categoryId) continue
          if (!Number.isFinite(amt) || amt <= 0) {
            await admin
              .from('expense_entries')
              .delete()
              .eq('organization_id', orgId)
              .eq('expense_date', date)
              .eq('category_id', categoryId)
            continue
          }
          upserts.push({
            organization_id: orgId,
            expense_date: date,
            category_id: categoryId,
            amount: amt,
            recorded_by: caller_id,
            updated_at: new Date().toISOString(),
          })
        }
      }

      if (upserts.length) {
        const { error } = await admin.from('expense_entries').upsert(upserts, {
          onConflict: 'organization_id,expense_date,category_id',
        })
        if (error) return NextResponse.json({ error: error.message }, { status: 500 })
        await logExpenseAudit(admin, orgId, caller_id, 'bulk_upsert', null, {
          count: upserts.length,
        })
      }

      return NextResponse.json({ ok: true, saved: upserts.length })
    }

    if (entry) {
      const canWrite =
        hasPermission(prof.role, 'expenses:create') || hasPermission(prof.role, 'expenses:edit')
      if (!canWrite) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
      }

      const {
        id: entryId,
        expense_date,
        category_id,
        amount,
        description,
        payment_method,
        reference,
        receipt_url,
        store_movement_id,
      } = entry

      const amt = Number(amount)
      if (!expense_date || !category_id || !Number.isFinite(amt) || amt <= 0) {
        return NextResponse.json({ error: 'Category, date and amount are required' }, { status: 400 })
      }
      if (payment_method && !PAYMENT_METHODS.includes(payment_method)) {
        return NextResponse.json({ error: 'Invalid payment_method' }, { status: 400 })
      }

      const row = {
        expense_date: String(expense_date).slice(0, 10),
        category_id,
        amount: amt,
        description: description?.trim() || null,
        payment_method: payment_method || null,
        reference: reference?.trim() || null,
        receipt_url: receipt_url?.trim() || null,
        store_movement_id: store_movement_id || null,
        updated_at: new Date().toISOString(),
        updated_by: caller_id,
      }

      if (entryId) {
        const { data, error } = await admin
          .from('expense_entries')
          .update(row)
          .eq('id', entryId)
          .eq('organization_id', orgId)
          .select(
            `id, expense_date, category_id, amount, description, payment_method, reference, receipt_url,
             recorded_by, updated_by, created_at, updated_at, expense_categories ( id, name, code )`,
          )
          .single()
        if (error) return NextResponse.json({ error: error.message }, { status: 500 })
        await logExpenseAudit(admin, orgId, caller_id, 'update', entryId, row)
        const names = await resolveProfileNames(admin, [data?.recorded_by, data?.updated_by].filter(Boolean) as string[])
        return NextResponse.json({
          entry: data
            ? {
                ...data,
                created_by: data.recorded_by,
                created_by_name: data.recorded_by ? names[data.recorded_by] : null,
                updated_by_name: data.updated_by ? names[data.updated_by] : null,
              }
            : data,
        })
      }

      const insertRow = {
        ...row,
        organization_id: orgId,
        recorded_by: caller_id,
      }

      const { data, error } = await admin
        .from('expense_entries')
        .insert([insertRow])
        .select(
          `id, expense_date, category_id, amount, description, payment_method, reference, receipt_url,
           recorded_by, updated_by, created_at, updated_at, expense_categories ( id, name, code )`,
        )
        .single()

      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
      await logExpenseAudit(admin, orgId, caller_id, 'create', data?.id ?? null, insertRow)
      const names = await resolveProfileNames(admin, [data?.recorded_by].filter(Boolean) as string[])
      return NextResponse.json({
        entry: data
          ? {
              ...data,
              created_by: data.recorded_by,
              created_by_name: data.recorded_by ? names[data.recorded_by] : null,
              updated_by_name: null,
            }
          : data,
      })
    }

    return NextResponse.json({ error: 'bulk or entry required' }, { status: 400 })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
