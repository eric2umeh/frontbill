import type { SupabaseClient } from '@supabase/supabase-js'

/** True if trimmed name conflicts with another guest or any organizations row. */
export async function guestOrOrganizationNameTaken(
  supabase: SupabaseClient,
  params: {
    hotelTenantOrganizationId: string
    candidateName: string
    /** When updating an existing guest */
    excludeGuestId?: string
    /** When updating an existing counterparty organization row */
    excludeOrganizationId?: string
  },
): Promise<boolean> {
  const raw = params.candidateName.trim()
  if (!raw || !params.hotelTenantOrganizationId) return false

  let gQuery = supabase
    .from('guests')
    .select('id')
    .eq('organization_id', params.hotelTenantOrganizationId)
    .ilike('name', raw)
    .limit(1)
  if (params.excludeGuestId) gQuery = gQuery.neq('id', params.excludeGuestId)

  const { data: guestHits } = await gQuery
  if (guestHits && guestHits.length > 0) return true

  let oQuery = supabase.from('organizations').select('id').ilike('name', raw)
  if (params.excludeOrganizationId) oQuery = oQuery.neq('id', params.excludeOrganizationId)

  const { data: orgHits } = await oQuery.limit(1)
  return Boolean(orgHits && orgHits.length > 0)
}
