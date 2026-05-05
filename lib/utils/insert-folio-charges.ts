import type { SupabaseClient } from '@supabase/supabase-js'

/** True when PostgREST rejects `organization_id` on `folio_charges` (column not in DB / schema cache). */
export function isFolioChargesOrgColumnError(err: { message?: string; details?: string; hint?: string } | null): boolean {
  if (!err) return false
  const blob = `${err.message || ''} ${err.details || ''} ${err.hint || ''}`.toLowerCase()
  return blob.includes('organization_id') && (blob.includes('folio_charges') || blob.includes('schema cache'))
}

/**
 * Inserts folio rows with `organization_id` when the column exists (migration 009).
 * Retries without `organization_id` when the column is missing — same pattern as extend-stay modal.
 */
export async function insertFolioCharges(
  supabase: SupabaseClient,
  rows: Record<string, unknown>[],
): Promise<{ error: { message: string } | null }> {
  let { error } = await supabase.from('folio_charges').insert(rows)
  if (error && isFolioChargesOrgColumnError(error)) {
    const stripped = rows.map((r) => {
      const { organization_id: _omit, ...rest } = r
      return rest
    })
    const retry = await supabase.from('folio_charges').insert(stripped)
    error = retry.error
  }
  return { error }
}
