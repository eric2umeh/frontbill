import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * Monthly sequential reference, e.g. REQ-202605-00001 (Lagos calendar month).
 */
export async function allocateRequisitionReference(
  supabase: SupabaseClient,
  organizationId: string,
): Promise<string> {
  const d = new Date()
  const yyyy = d.getFullYear()
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const prefix = `REQ-${yyyy}${mm}`
  const { count, error } = await supabase
    .from('store_requisitions')
    .select('id', { count: 'exact', head: true })
    .eq('organization_id', organizationId)
    .like('reference', `${prefix}%`)
  if (error) throw error
  const n = (count ?? 0) + 1
  return `${prefix}-${String(n).padStart(5, '0')}`
}
