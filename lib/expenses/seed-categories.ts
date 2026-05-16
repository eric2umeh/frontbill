import type { SupabaseClient } from '@supabase/supabase-js'
import { DEFAULT_EXPENSE_CATEGORIES } from './default-categories'

export async function ensureExpenseCategories(
  admin: SupabaseClient,
  organizationId: string,
): Promise<{ error: string | null }> {
  const { count, error: countErr } = await admin
    .from('expense_categories')
    .select('id', { count: 'exact', head: true })
    .eq('organization_id', organizationId)

  if (countErr) {
    if (/expense_categories/i.test(countErr.message) && /does not exist/i.test(countErr.message)) {
      return { error: 'Run migration scripts/044_hotel_expenses.sql in Supabase first.' }
    }
    return { error: countErr.message }
  }

  if ((count ?? 0) > 0) return { error: null }

  const rows = DEFAULT_EXPENSE_CATEGORIES.map((c) => ({
    organization_id: organizationId,
    code: c.code,
    name: c.name,
    sort_order: c.sort_order,
    department_hint: c.department_hint ?? null,
    store_outlet: c.store_outlet ?? null,
    is_active: true,
  }))

  const { error } = await admin.from('expense_categories').insert(rows)
  return { error: error?.message ?? null }
}
