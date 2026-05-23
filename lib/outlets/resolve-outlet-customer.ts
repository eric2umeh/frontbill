import type { SupabaseClient } from '@supabase/supabase-js'
import { findActiveBookingByRoom } from '@/lib/outlets/find-active-booking'

export type ResolvedOutletCustomer = {
  bookingId: string | null
  guestName: string | null
  roomNumber: string | null
}

/** Link room to in-house booking and fill guest name from the booking when missing. */
export async function resolveOutletCustomerContext(
  admin: SupabaseClient,
  organizationId: string,
  input: {
    bookingId?: string | null
    guestName?: string | null
    roomNumber?: string | null
  },
): Promise<ResolvedOutletCustomer> {
  const roomNumber = input.roomNumber?.trim() || null
  let bookingId = input.bookingId?.trim() || null
  let guestName = input.guestName?.trim() || null

  if (!bookingId && roomNumber) {
    const found = await findActiveBookingByRoom(admin, organizationId, roomNumber)
    if (found) {
      bookingId = found.id
      if (found.guest_name) guestName = found.guest_name
    }
  } else if (bookingId && !guestName) {
    const { data: bk } = await admin
      .from('bookings')
      .select('guests(name)')
      .eq('id', bookingId)
      .eq('organization_id', organizationId)
      .maybeSingle()
    const g = bk?.guests as { name?: string } | null
    if (g?.name) guestName = g.name.trim()
  }

  return { bookingId, guestName, roomNumber }
}

/** After resolve: city ledger needs a booking, named guest, or ledger account (room alone must have matched a stay). */
export function hasOutletCityLedgerChargeTarget(
  ctx: ResolvedOutletCustomer,
  cityLedgerAccountId: string | null | undefined,
): boolean {
  if (ctx.bookingId) return true
  if (cityLedgerAccountId?.trim()) return true
  if (ctx.guestName) return true
  return false
}
