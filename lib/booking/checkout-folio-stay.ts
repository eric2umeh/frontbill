import type { SupabaseClient } from '@supabase/supabase-js'
import { resolvedCheckoutDateForClosing } from '@/lib/utils/booking-checkout-ui'

export type StayCheckoutPatch = {
  status: 'checked_out'
  folio_status: 'checked_out'
  check_out: string
  updated_by?: string
}

/** Booking fields written by Check Out Folio — same close as Bookings checkout. */
export function stayCheckoutPatch(
  booking: { check_out: string },
  updatedBy?: string | null,
): StayCheckoutPatch {
  const patch: StayCheckoutPatch = {
    status: 'checked_out',
    folio_status: 'checked_out',
    check_out: resolvedCheckoutDateForClosing(booking),
  }
  if (updatedBy) patch.updated_by = updatedBy
  return patch
}

/**
 * Close every stay on this folio. Room PMS/HK is left to reconcile so a historical
 * folio does not vacate a room another guest now occupies.
 */
export async function applyFolioStayCheckout(
  supabase: SupabaseClient,
  opts: {
    folioId: string
    organizationId?: string | null
    updatedBy?: string | null
  },
): Promise<{ updated: number; checkOut: string }> {
  let query = supabase
    .from('bookings')
    .select('id, check_out')
    .eq('folio_id', opts.folioId)
  if (opts.organizationId) {
    query = query.eq('organization_id', opts.organizationId)
  }

  const { data: rows, error: loadError } = await query
  if (loadError) throw loadError
  if (!rows?.length) throw new Error('Folio not found')

  let checkOut = ''
  for (const row of rows) {
    const patch = stayCheckoutPatch(row, opts.updatedBy)
    checkOut = patch.check_out
    const { error } = await supabase.from('bookings').update(patch).eq('id', row.id)
    if (error) throw error
  }

  return { updated: rows.length, checkOut }
}
