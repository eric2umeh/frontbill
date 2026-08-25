"use client";

import { useState, useEffect, useMemo } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogScrollableBody,
  DialogScrollableFooter,
  DialogScrollableHeader,
  DialogTitle,
  dialogScrollableContentClass,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { roomHousekeepingPatchForInHouse } from "@/lib/rooms/sync-housekeeping-status";
import { reconcileRoomStatusesClient } from "@/lib/rooms/reconcile-room-status-client";
import {
  roomIdsBlockedForStay,
  occupyingStayBlocksRoom,
  stayDatesFromActualArrival,
} from "@/lib/booking/edit-booking-patch";
import { todayYmdHotel } from "@/lib/utils/booking-in-house-dates";
import { formatPersonName, normalizeNameKey } from "@/lib/utils/name-format";
import { guestOrOrganizationNameTaken } from "@/lib/utils/guest-org-name-uniqueness";
import { isRoomAssignable } from "@/lib/utils/room-bookability";

export interface ReserveCheckInBooking {
  id: string;
  organization_id: string;
  folio_id: string;
  check_in: string;
  check_out: string;
  number_of_nights?: number | null;
  guest_id?: string | null;
  room_id?: string | null;
  rate_per_night?: number | null;
  guests?: { name?: string | null } | null;
  rooms?: { id?: string; room_number?: string; room_type?: string } | null;
}

interface Props {
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
  booking: ReserveCheckInBooking | null;
  userId: string;
}

export function ReserveCheckInModal({
  open,
  onClose,
  onSuccess,
  booking,
  userId,
}: Props) {
  const [loading, setLoading] = useState(false);
  const [roomsFetch, setRoomsFetch] = useState<
    Array<{
      id: string;
      room_number: string;
      room_type: string;
      status: string;
      housekeeping_status?: string | null;
    }>
  >([]);
  const [bookingsFetch, setBookingsFetch] = useState<
    Array<{
      id: string;
      room_id: string | null;
      check_in: string;
      check_out: string;
      status: string;
    }>
  >([]);
  const [guestNameOpt, setGuestNameOpt] = useState("");
  const [guestPhoneOpt, setGuestPhoneOpt] = useState("");
  const [selectedRoomId, setSelectedRoomId] = useState("");

  const stay = useMemo(() => {
    if (!booking) return null;
    return stayDatesFromActualArrival({
      originalCheckIn: booking.check_in,
      originalCheckOut: booking.check_out,
      actualArrivalYmd: todayYmdHotel(),
      numberOfNights: booking.number_of_nights,
    });
  }, [
    booking?.check_in,
    booking?.check_out,
    booking?.number_of_nights,
    booking?.id,
  ]);
  const cin = stay?.check_in ?? "";
  const cout = stay?.check_out ?? "";
  const orgId = booking?.organization_id ?? "";

  useEffect(() => {
    if (!open || !booking) return;
    setGuestNameOpt((booking.guests as any)?.name || "");
    setGuestPhoneOpt("");
    (async () => {
      const supabase = createClient();
      if (!supabase) return;
      const [{ data: rms }, { data: bks }] = await Promise.all([
        supabase
          .from("rooms")
          .select("id, room_number, room_type, status, housekeeping_status")
          .eq("organization_id", orgId)
          .neq("status", "maintenance")
          .order("room_number"),
        supabase
          .from("bookings")
          .select("id, room_id, check_in, check_out, status")
          .eq("organization_id", orgId)
          .in("status", ["confirmed", "checked_in"]),
      ]);
      setRoomsFetch((rms || []) as any[]);
      setBookingsFetch(
        ((bks || []) as any[]).filter((b) => b.id !== booking.id),
      );
    })();
  }, [open, booking?.id, orgId]);

  const bookedOverlapRoomIds = useMemo(() => {
    if (!cin || !cout) return new Set<string>();
    return roomIdsBlockedForStay(
      bookingsFetch,
      cin,
      cout,
      booking?.id,
    );
  }, [bookingsFetch, cin, cout, booking?.id]);

  const availableRooms = useMemo(() => {
    return roomsFetch.filter((r) => {
      if (!r.id) return false;
      if (bookedOverlapRoomIds.has(r.id)) return false;
      return isRoomAssignable(r.status, r.housekeeping_status);
    });
  }, [roomsFetch, bookedOverlapRoomIds]);

  const byTypeCounts = useMemo(() => {
    const m: Record<string, number> = {};
    for (const r of availableRooms) {
      const t = r.room_type || "Other";
      m[t] = (m[t] || 0) + 1;
    }
    return m;
  }, [availableRooms]);

  useEffect(() => {
    if (!open || !booking || availableRooms.length === 0) {
      setSelectedRoomId("");
      return;
    }
    const hasCurrent =
      booking.room_id && availableRooms.some((r) => r.id === booking.room_id);
    if (hasCurrent && booking.room_id) {
      setSelectedRoomId(booking.room_id);
      return;
    }
    const preferredRows = booking.rooms?.room_type
      ? sortByRoomNumber(
          availableRooms.filter(
            (r) =>
              r.room_type === booking.rooms?.room_type &&
              r.id !== booking.room_id,
          ),
        )
      : [];

    const excludingCurrent = sortByRoomNumber(
      booking.room_id
        ? availableRooms.filter((r) => r.id !== booking.room_id)
        : [...availableRooms],
    );
    const pick =
      preferredRows[0]?.id ??
      excludingCurrent[0]?.id ??
      availableRooms[0]?.id ??
      "";
    setSelectedRoomId(pick);
  }, [
    open,
    booking?.id,
    booking?.room_id,
    booking?.rooms?.room_type,
    availableRooms,
  ]);

  const handleConfirm = async () => {
    if (!booking?.id || !selectedRoomId) {
      toast.error("Select an available room");
      return;
    }
    const supabase = createClient();
    if (!supabase) return;

    setLoading(true);
    try {
      let finalGuestId = booking.guest_id || null;
      const nameInput = guestNameOpt.trim();
      const phoneInput = guestPhoneOpt.trim();

      if (nameInput) {
        const formatted = formatPersonName(nameInput);
        const nk = normalizeNameKey(formatted);
        if (!finalGuestId && nk) {
          const { data: existing } = await supabase
            .from("guests")
            .select("id")
            .eq("organization_id", orgId)
            .ilike("name", formatted)
            .maybeSingle();
          if (existing?.id) {
            finalGuestId = existing.id;
          } else {
            const dup = await guestOrOrganizationNameTaken(supabase, {
              hotelTenantOrganizationId: orgId,
              candidateName: formatted,
            });
            if (dup) {
              toast.error(
                "This name is already used by a guest or organization",
              );
              return;
            }

            const { data: inserted, error: ge } = await supabase
              .from("guests")
              .insert([
                {
                  organization_id: orgId,
                  name: formatted,
                  phone: phoneInput || null,
                },
              ])
              .select("id")
              .single();
            if (ge) throw ge;
            finalGuestId = inserted.id;
          }
        }
      }

      if (!stay) {
        toast.error("Could not compute stay dates");
        return;
      }

      const { data: occupyingNow } = await supabase
        .from("bookings")
        .select("id, room_id, check_in, check_out, status")
        .eq("organization_id", orgId)
        .eq("room_id", selectedRoomId)
        .neq("id", booking.id)
        .in("status", ["confirmed", "checked_in"]);

      const blocked = (occupyingNow || []).some((row) =>
        occupyingStayBlocksRoom(
          row,
          selectedRoomId,
          stay.check_in,
          stay.check_out,
          booking.id,
        ),
      );
      if (blocked) {
        toast.error(
          "That room is already occupied for these stay dates. Pick another room.",
        );
        return;
      }

      const patch: Record<string, unknown> = {
        status: "checked_in",
        room_id: selectedRoomId,
        check_in: stay.check_in,
        check_out: stay.check_out,
        number_of_nights: stay.number_of_nights,
        updated_at: new Date().toISOString(),
      };
      if (finalGuestId) patch.guest_id = finalGuestId;

      const { error: be } = await supabase
        .from("bookings")
        .update(patch)
        .eq("id", booking.id);
      if (be) throw be;

      await supabase
        .from("rooms")
        .update(roomHousekeepingPatchForInHouse("checked_in"))
        .eq("id", selectedRoomId);

      await reconcileRoomStatusesClient();

      toast.success(
        stay.check_in !== String(booking.check_in).slice(0, 10)
          ? `Guest checked in — stay is now ${stay.check_in} → ${stay.check_out} (${stay.number_of_nights} night${stay.number_of_nights === 1 ? "" : "s"})`
          : "Guest checked in",
      );
      onSuccess();
      onClose();
    } catch (e: any) {
      toast.error(e?.message || "Check-in failed");
    } finally {
      setLoading(false);
    }
  };

  if (!booking) return null;

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v) onClose();
      }}
    >
      <DialogContent className={cn(dialogScrollableContentClass, "max-w-md")}>
        <DialogScrollableHeader>
          <DialogTitle>Check in from reservation</DialogTitle>
          <DialogDescription>
            Folio {booking.folio_id} · reserved {String(booking.check_in).slice(0, 10)}{" "}
            → {String(booking.check_out).slice(0, 10)}.
            {stay
              ? ` Stay will be ${stay.check_in} → ${stay.check_out} (${stay.number_of_nights} night${stay.number_of_nights === 1 ? "" : "s"}).`
              : ""}{" "}
            Rooms already occupied for those dates are hidden. Guest details are
            optional if the reservation already has a contact.
          </DialogDescription>
        </DialogScrollableHeader>

        <DialogScrollableBody className="space-y-4">
          <div>
            <p className="text-xs font-medium text-muted-foreground mb-2">
              Available by type
            </p>
            <div className="flex flex-wrap gap-2">
              {Object.entries(byTypeCounts).length === 0 ? (
                <span className="text-sm text-destructive">
                  No free rooms for these dates.
                </span>
              ) : (
                Object.entries(byTypeCounts).map(([rt, count]) => (
                  <Badge key={rt} variant="outline" className="text-xs">
                    {rt}: {count}
                  </Badge>
                ))
              )}
            </div>
          </div>

          <div className="space-y-2">
            <Label>Room</Label>
            <Select value={selectedRoomId} onValueChange={setSelectedRoomId}>
              <SelectTrigger>
                <SelectValue placeholder="Select room" />
              </SelectTrigger>
              <SelectContent className="max-h-[220px]">
                {sortByRoomNumber([...availableRooms]).map((r) => (
                  <SelectItem key={r.id} value={r.id}>
                    Room {r.room_number} · {r.room_type}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Guest name (optional)</Label>
            <Input
              value={guestNameOpt}
              onChange={(e) => setGuestNameOpt(e.target.value)}
              placeholder="Override / add guest staying in this room"
            />
          </div>
          <div className="space-y-2">
            <Label>Phone (optional)</Label>
            <Input
              value={guestPhoneOpt}
              onChange={(e) => setGuestPhoneOpt(e.target.value)}
              placeholder="Guest phone"
            />
          </div>
        </DialogScrollableBody>

        <DialogScrollableFooter>
          <Button variant="outline" onClick={onClose} disabled={loading}>
            Cancel
          </Button>
          <Button
            onClick={handleConfirm}
            disabled={loading || availableRooms.length === 0}
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Confirm check-in
          </Button>
        </DialogScrollableFooter>
      </DialogContent>
    </Dialog>
  );
}

function sortByRoomNumber<T extends { room_number?: string | number | null }>(
  rows: T[],
) {
  return [...rows].sort((a, b) =>
    String(a.room_number ?? "").localeCompare(
      String(b.room_number ?? ""),
      undefined,
      { numeric: true },
    ),
  );
}
