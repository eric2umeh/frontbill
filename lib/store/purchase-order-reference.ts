import type { SupabaseClient } from '@supabase/supabase-js'

export async function allocatePurchaseOrderReference(
  supabase: SupabaseClient,
  organizationId: string,
): Promise<string> {
  const d = new Date()
  const yyyy = d.getFullYear()
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const prefix = `PO-${yyyy}${mm}`
  const { count, error } = await supabase
    .from('store_purchase_orders')
    .select('id', { count: 'exact', head: true })
    .eq('organization_id', organizationId)
    .like('reference', `${prefix}%`)
  if (error) throw error
  const n = (count ?? 0) + 1
  return `${prefix}-${String(n).padStart(5, '0')}`
}
