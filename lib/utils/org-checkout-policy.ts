import type { SupabaseClient } from '@supabase/supabase-js'
import { DEFAULT_ORG_CHECKOUT_TIME } from '@/lib/utils/booking-checkout-ui'

/** PostgREST/Postgres when `organizations` has no checkout policy columns yet. */
export function isOrgCheckoutPolicyColumnError(
  err: { message?: string; code?: string } | null | undefined,
): boolean {
  const m = (err?.message || '').toLowerCase()
  if (!m) return false
  const mentionsCol =
    m.includes('checkout_time') || m.includes('late_checkout_fee')
  if (!mentionsCol) return false
  return (
    m.includes('does not exist') ||
    m.includes('undefined column') ||
    m.includes('could not find') ||
    m.includes('schema cache') ||
    m.includes('42703')
  )
}

/** Loads standard checkout time; uses default when column is missing (run add-checkout-policy SQL). */
export async function fetchOrgCheckoutTime(
  supabase: SupabaseClient,
  organizationId: string,
): Promise<string> {
  const { data, error } = await supabase
    .from('organizations')
    .select('checkout_time')
    .eq('id', organizationId)
    .maybeSingle()

  if (error) {
    if (!isOrgCheckoutPolicyColumnError(error)) {
      console.warn('[fetchOrgCheckoutTime]', error.message)
    }
    return DEFAULT_ORG_CHECKOUT_TIME
  }

  return data?.checkout_time?.trim() || DEFAULT_ORG_CHECKOUT_TIME
}
