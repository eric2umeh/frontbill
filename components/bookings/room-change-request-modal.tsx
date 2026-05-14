"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";

type RoomRow = {
  id: string;
  room_number: string;
  room_type: string;
  status: string;
};

interface Props {
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
  userId: string | null | undefined;
  organizationId: string | null | undefined;
  bookingId: string;
  currentRoomId: string | null | undefined;
  currentRoomLabel: string;
  checkIn: string;
  checkOut: string;
}

export function RoomChangeRequestModal({
  open,
  onClose,
  onSuccess,
  userId,
  organizationId,
  bookingId,
  currentRoomId,
  currentRoomLabel,
  checkIn,
  checkOut,
}: Props) {
  const [rooms, setRooms] = useState<RoomRow[]>([]);
  const [loadingRooms, setLoadingRooms] = useState(false);
  const [toRoomId, setToRoomId] = useState("");
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const supabase = createClient();

  useEffect(() => {
    if (!open || !organizationId || !supabase) return;
    let cancelled = false;
    (async () => {
      setLoadingRooms(true);
      try {
        const { data, error } = await supabase
          .from("rooms")
          .select("id, room_number, room_type, status")
          .eq("organization_id", organizationId)
          .eq("status", "available")
          .order("room_number");
        if (error) throw error;
        const rows = (data || []) as RoomRow[];
        const filtered = currentRoomId
          ? rows.filter((r) => r.id !== currentRoomId)
          : rows;
        if (!cancelled) setRooms(filtered);
      } catch (e: any) {
        if (!cancelled) toast.error(e.message || "Failed to load rooms");
      } finally {
        if (!cancelled) setLoadingRooms(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, organizationId, supabase, currentRoomId]);

  useEffect(() => {
    if (!open) {
      setToRoomId("");
      setReason("");
    }
  }, [open]);

  const overlapSet = useMemo(() => {
    const cin = String(checkIn || "").slice(0, 10);
    const cout = String(checkOut || "").slice(0, 10);
    return { cin, cout };
  }, [checkIn, checkOut]);

  const selectableRooms = useMemo(() => {
    return rooms;
  }, [rooms]);

  const handleSubmit = async () => {
    if (!userId) {
      toast.error("You must be signed in");
      return;
    }
    if (!toRoomId) {
      toast.error("Select the room to move the guest to");
      return;
    }
    if (!reason.trim()) {
      toast.error("Describe the reason (e.g. faulty AC, leakage)");
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch("/api/room-change-requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          caller_id: userId,
          booking_id: bookingId,
          to_room_id: toRoomId,
          reason: reason.trim(),
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(
          typeof json.error === "string" ? json.error : "Request failed",
        );
        return;
      }
      toast.success("Room change request sent for approval");
      onSuccess();
      onClose();
    } catch {
      toast.error("Network error");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Request room change</DialogTitle>
          <DialogDescription>
            Current room assignment:{" "}
            <span className="font-medium text-foreground">
              {currentRoomLabel}
            </span>
            . A Superadmin, Administrator, or Manager must approve before the
            booking&apos;s room is updated. You can submit this before or after
            the guest is checked in (for example wrong room type or
            maintenance). Dates and rates stay the same.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="text-xs text-muted-foreground">
            Stay {overlapSet.cin} → {overlapSet.cout} (only available rooms are
            listed)
          </div>
          <div className="space-y-2">
            <Label>Move to room</Label>
            {loadingRooms ? (
              <div
                className="flex items-center gap-2 py-2"
                role="status"
                aria-label="Loading rooms"
              >
                <Loader2 className="h-5 w-5 animate-spin text-primary" />
              </div>
            ) : (
              <Select value={toRoomId} onValueChange={setToRoomId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select target room" />
                </SelectTrigger>
                <SelectContent>
                  {selectableRooms.length === 0 ? (
                    <div className="px-2 py-3 text-sm text-muted-foreground">
                      No available rooms
                    </div>
                  ) : (
                    selectableRooms.map((r) => (
                      <SelectItem key={r.id} value={r.id}>
                        {r.room_number} · {r.room_type}
                      </SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>
            )}
          </div>
          <div className="space-y-2">
            <Label htmlFor="room_change_reason">Reason for approvers</Label>
            <Textarea
              id="room_change_reason"
              placeholder="e.g. AC faulty — guest agreed to move to another room"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={3}
            />
          </div>
        </div>
        <DialogFooter className="gap-2 sm:gap-0">
          <Button
            type="button"
            variant="outline"
            onClick={onClose}
            disabled={submitting}
          >
            Cancel
          </Button>
          <Button
            type="button"
            onClick={() => void handleSubmit()}
            disabled={submitting || loadingRooms}
          >
            {submitting ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Submitting…
              </>
            ) : (
              "Submit request"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
