import { createAdminClient } from '@/lib/supabase/admin'
import { DEFAULT_HOTEL_TIMEZONE, resolveHotelTimeZone } from '@/lib/hotel-date'

/**
 * Reads `organizations.timezone` when set to a valid IANA zone; otherwise hotel default env.
 */
export async function fetchOrganizationHotelTimeZone(organizationId: string): Promise<string> {
  if (!organizationId) return resolveHotelTimeZone()
  try {
    const admin = createAdminClient()
    const { data, error } = await admin
      .from('organizations')
      .select('timezone')
      .eq('id', organizationId)
      .maybeSingle()
    if (error || !data?.timezone) return resolveHotelTimeZone()
    return resolveHotelTimeZone(String(data.timezone).trim() || DEFAULT_HOTEL_TIMEZONE)
  } catch {
    return resolveHotelTimeZone()
  }
}
