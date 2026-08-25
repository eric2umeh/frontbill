import type { SupabaseClient } from "@supabase/supabase-js";
import { resolveHotelTimeZone } from "@/lib/hotel-date";
import {
  isInHouseOnCalendarDay,
  todayYmdHotel,
  bookingYmdHotel,
} from "@/lib/utils/booking-in-house-dates";
import { syncHousekeepingStatusesForOrganization } from "@/lib/rooms/sync-housekeeping-status";

/** Folios that can physically hold a room today. Future arrivals do not hold inventory. */
export const OCCUPYING_BOOKING_STATUSES = [
  "checked_in",
  "confirmed",
] as const;

/** Folios that block a room only on overlapping stay dates (incl. future reservations). */
export const DATE_HOLD_BOOKING_STATUSES = [
  "checked_in",
  "confirmed",
  "reserved",
] as const;

export function isPhysicalInHouseStatus(
  status: string | null | undefined,
): boolean {
  const st = String(status || "")
    .toLowerCase()
    .replace(/-/g, "_");
  return st === "checked_in" || st === "confirmed";
}

/** Room revenue / occupancy for a hotel night — not reserved (unarrived) guests. */
export function countsOnDailyBookForNight(
  status: string | null | undefined,
): boolean {
  const st = String(status || "")
    .toLowerCase()
    .replace(/-/g, "_");
  return st === "checked_in" || st === "confirmed" || st === "checked_out";
}

export type OccupyingBookingRow = {
  id: string;
  room_id?: string | null;
  status: string;
  check_in: string;
  check_out: string;
  folio_status?: string | null;
};

function normStatus(s: string | null | undefined): string {
  return String(s || "")
    .toLowerCase()
    .replace(/-/g, "_");
}

/** Active in-house folio on a room (matches bookings in-house list / outlets charge-to-room). */
export function pickOccupyingBooking<T extends OccupyingBookingRow>(
  rows: T[],
): T | null {
  const today = todayYmdHotel();
  const tz = resolveHotelTimeZone();

  const open = rows.filter((b) => {
    const fs = String(b.folio_status || "active").toLowerCase();
    if (fs === "checked_out" || fs === "cancelled") return false;
    if (b.status === "checked_out" || b.status === "cancelled") return false;
    if (
      !OCCUPYING_BOOKING_STATUSES.includes(
        b.status as (typeof OCCUPYING_BOOKING_STATUSES)[number],
      )
    ) {
      return false;
    }
    const ci = bookingYmdHotel(b.check_in, tz);
    // Future arrival (incl. confirmed) — room stays sellable until check-in day
    if (ci && ci > today) return false;
    return isInHouseOnCalendarDay(b.check_in, b.check_out, today, tz);
  });

  const rank = (s: string) =>
    s === "checked_in" ? 0 : s === "confirmed" ? 1 : 2;
  open.sort((a, b) => rank(a.status) - rank(b.status));
  return open[0] ?? null;
}

/** Occupied only when physically in-house today. Future arrivals do not mark the room reserved. */
export function roomStatusFromOccupyingBooking(
  occupying: Pick<OccupyingBookingRow, "status" | "check_in">,
): "occupied" | "reserved" {
  if (occupying.status === "checked_in") return "occupied";
  const today = todayYmdHotel();
  const ci = bookingYmdHotel(occupying.check_in);
  if (ci && ci > today) return "reserved";
  return "occupied";
}

/** PMS room status from the active folio on that room. Returns null if housekeeping block should stay. */
export function deriveRoomStatusFromOccupying(
  occupying: Pick<OccupyingBookingRow, "status" | "check_in"> | null,
  currentStatus: string | null | undefined,
  housekeepingStatus?: string | null | undefined,
): string | null {
  const cur = normStatus(currentStatus);
  const hk = normStatus(housekeepingStatus);
  if (cur === "maintenance" || cur === "out_of_order") return null;
  if (hk === "out_of_order") return null;

  if (!occupying) {
    if (
      cur === "occupied" ||
      cur === "reserved" ||
      cur === "cleaning" ||
      hk === "checkout" ||
      hk === "reservation"
    ) {
      return "available";
    }
    return null;
  }

  // Future arrival occupying should not happen (filtered in pickOccupyingBooking);
  // if it does, keep the room sellable.
  const next = roomStatusFromOccupyingBooking(occupying);
  if (next === "reserved") return "available";
  return next;
}

/** Status to show in Rooms menu / pickers — always derived from today's active folios. */
export function computeEffectiveRoomStatus(
  currentStatus: string | null | undefined,
  occupying: Pick<OccupyingBookingRow, "status" | "check_in"> | null,
): string {
  const cur = normStatus(currentStatus);
  if (cur === "maintenance" || cur === "out_of_order") return cur;
  if (!occupying) {
    if (cur === "occupied" || cur === "reserved" || cur === "cleaning")
      return "available";
    return cur || "available";
  }
  const next = roomStatusFromOccupyingBooking(occupying);
  if (next === "reserved") return "available";
  return next;
}

/** Distinct rooms with an in-house folio today (aligns with Bookings → Checked in filter). */
export function countInHouseRoomsFromBookings(
  bookings: OccupyingBookingRow[],
): number {
  const byRoom = new Map<string, OccupyingBookingRow[]>();
  for (const b of bookings) {
    if (!b.room_id) continue;
    if (!byRoom.has(b.room_id)) byRoom.set(b.room_id, []);
    byRoom.get(b.room_id)!.push(b);
  }
  let count = 0;
  for (const rows of byRoom.values()) {
    if (pickOccupyingBooking(rows)) count += 1;
  }
  return count;
}

export type ReconcileRoomStatusesResult = {
  updated: number;
  freed: number;
  markedOccupied: number;
  markedReserved: number;
  housekeepingSynced: number;
};

/**
 * Align rooms.status with active folios: free rooms after checkout, mark occupied/reserved from bookings.
 */
export async function reconcileRoomStatusesForOrganization(
  supabase: SupabaseClient,
  organizationId: string,
): Promise<ReconcileRoomStatusesResult> {
  const result: ReconcileRoomStatusesResult = {
    updated: 0,
    freed: 0,
    markedOccupied: 0,
    markedReserved: 0,
    housekeepingSynced: 0,
  };

  const [{ data: rooms, error: roomErr }, { data: bookings, error: bookErr }] =
    await Promise.all([
      supabase
        .from("rooms")
        .select("id, status, housekeeping_status")
        .eq("organization_id", organizationId),
      supabase
        .from("bookings")
        .select("id, room_id, status, check_in, check_out, folio_status")
        .eq("organization_id", organizationId)
        .in("status", [...OCCUPYING_BOOKING_STATUSES]),
    ]);

  if (roomErr) throw roomErr;
  if (bookErr) throw bookErr;

  const byRoom = new Map<string, OccupyingBookingRow[]>();
  for (const b of bookings ?? []) {
    if (!b.room_id) continue;
    if (!byRoom.has(b.room_id)) byRoom.set(b.room_id, []);
    byRoom.get(b.room_id)!.push(b as OccupyingBookingRow);
  }

  const now = new Date().toISOString();

  for (const room of rooms ?? []) {
    const occupying = pickOccupyingBooking(byRoom.get(room.id) ?? []);
    const next = deriveRoomStatusFromOccupying(
      occupying,
      room.status,
      (room as { housekeeping_status?: string | null }).housekeeping_status,
    );
    if (!next || normStatus(next) === normStatus(room.status)) continue;

    const { error } = await supabase
      .from("rooms")
      .update({ status: next, updated_at: now })
      .eq("id", room.id);

    if (error) {
      console.warn("[reconcileRoomStatuses]", room.id, error.message);
      continue;
    }

    result.updated += 1;
    if (next === "available") result.freed += 1;
    else if (next === "occupied") result.markedOccupied += 1;
    else if (next === "reserved") result.markedReserved += 1;
  }

  try {
    result.housekeepingSynced = await syncHousekeepingStatusesForOrganization(
      supabase,
      organizationId,
      (bookings ?? []) as OccupyingBookingRow[],
    );
  } catch (e) {
    console.warn("[reconcileRoomStatuses] housekeeping sync", e);
  }

  return result;
}

/** Room row status after creating/updating a booking. Future reservations stay sellable. */
export function roomStatusForBookingStatus(
  bookingStatus: string,
  checkIn?: string | null,
): "occupied" | "reserved" | "available" {
  const st = String(bookingStatus || "")
    .toLowerCase()
    .replace(/-/g, "_");
  if (st === "reserved") return "available";
  if (st === "checked_in") return "occupied";
  const today = todayYmdHotel();
  const ci = checkIn ? bookingYmdHotel(checkIn) : "";
  // Future confirmed/reserved arrivals must not lock inventory
  if (ci && ci > today) return "available";
  return "occupied";
}
