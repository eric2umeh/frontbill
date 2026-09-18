import { isPhysicalInHouseStatus } from "@/lib/rooms/room-occupancy";
import { bookingYmdHotel } from "@/lib/utils/booking-in-house-dates";

/** Same in-house set as Bookings / occupancy: walk-ins are `confirmed`, arrivals are `checked_in`. */
export const NIGHT_AUDIT_IN_HOUSE_STATUSES = ["checked_in", "confirmed"] as const;

export type NightAuditStayRow = {
  id?: string;
  room_id?: string | null;
  status?: string | null;
  check_in?: string | null;
  check_out?: string | null;
  folio_status?: string | null;
  balance?: unknown;
  total_amount?: unknown;
  folio_id?: unknown;
  booking_number?: unknown;
  guests?: { name?: string } | null;
};

/**
 * Guest still in-house when the hotel closes `closingDateYmd`.
 * Walk-in / same-day New Booking folios stay `confirmed` (not `checked_in`).
 * Future arrivals are not in-house yet.
 */
export function isInHouseForNightAudit(
  booking: NightAuditStayRow,
  closingDateYmd: string,
): boolean {
  const st = String(booking.status || "")
    .toLowerCase()
    .replace(/-/g, "_");
  const fs = String(booking.folio_status || "")
    .toLowerCase()
    .replace(/-/g, "_");
  if (st === "checked_out" || st === "cancelled") return false;
  if (fs === "checked_out" || fs === "cancelled") return false;
  if (!isPhysicalInHouseStatus(st)) return false;

  const closing = String(closingDateYmd || "").slice(0, 10);
  const ci = bookingYmdHotel(booking.check_in);
  if (ci && closing && ci > closing) return false;
  return true;
}

export function selectInHouseForNightAudit<T extends NightAuditStayRow>(
  bookings: T[] | null | undefined,
  closingDateYmd: string,
): T[] {
  return (bookings || []).filter((b) => isInHouseForNightAudit(b, closingDateYmd));
}

export function nightAuditOccupiedRoomIds<T extends NightAuditStayRow>(
  inHouse: T[],
): Set<string> {
  const ids = new Set<string>();
  for (const b of inHouse) {
    if (b.room_id) ids.add(b.room_id);
  }
  return ids;
}

export function nightAuditPendingCheckouts<T extends NightAuditStayRow>(
  inHouse: T[],
  closingDateYmd: string,
): T[] {
  const closing = String(closingDateYmd || "").slice(0, 10);
  return inHouse.filter((b) => bookingYmdHotel(b.check_out) === closing);
}

export function occupiedRoomsMissingInHouseStay<
  T extends { id: string; room_number?: unknown },
>(
  occupiedRooms: T[] | null | undefined,
  inHouseRoomIds: Set<string>,
): T[] {
  return (occupiedRooms || []).filter((room) => !inHouseRoomIds.has(room.id));
}
