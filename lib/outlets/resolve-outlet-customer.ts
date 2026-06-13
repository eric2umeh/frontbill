import type { SupabaseClient } from '@supabase/supabase-js'
import { findActiveBookingByRoom } from '@/lib/outlets/find-active-booking'
import {
  OCCUPYING_BOOKING_STATUSES,
  pickOccupyingBooking,
} from '@/lib/rooms/room-occupancy'

export type ResolvedOutletCustomer = {
  bookingId: string | null
  guestName: string | null
  roomNumber: string | null
}

function guestNameFromJoin(guests: { name?: string } | { name?: string }[] | null): string | null {
  if (!guests) return null
  if (Array.isArray(guests)) return guests[0]?.name ?? null
  return guests.name ?? null
}

function roomNumberFromJoin(rooms: { room_number?: string } | { room_number?: string }[] | null): string | null {
  if (!rooms) return null
  if (Array.isArray(rooms)) return rooms[0]?.room_number ?? null
  return rooms.room_number ?? null
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
  let roomNumber = input.roomNumber?.trim() || null
  let bookingId = input.bookingId?.trim() || null
  let guestName = input.guestName?.trim() || null

  if (!bookingId && roomNumber) {
    const found = await findActiveBookingByRoom(admin, organizationId, roomNumber)
    if (found) {
      bookingId = found.id
      if (found.guest_name) guestName = found.guest_name
    }
  } else if (bookingId) {
    const { data, error } = await admin
      .from('bookings')
      .select('id, room_id, status, check_in, check_out, folio_status, guests(name), rooms(room_number)')
      .eq('id', bookingId)
      .eq('organization_id', organizationId)
      .in('status', [...OCCUPYING_BOOKING_STATUSES])
      .limit(1)

    if (error) throw new Error(error.message)

    const booking = pickOccupyingBooking(data ?? [])
    if (!booking || booking.id !== bookingId) {
      throw new Error('Booking is not an active in-house stay in this organization')
    }

    const g = guestNameFromJoin(booking.guests as { name?: string } | { name?: string }[] | null)
    if (g) guestName = g.trim()
    roomNumber = roomNumberFromJoin(booking.rooms as { room_number?: string } | { room_number?: string }[] | null) ?? roomNumber
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
