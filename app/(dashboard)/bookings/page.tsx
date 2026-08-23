"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { EnhancedDataTable } from "@/components/shared/enhanced-data-table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CardContent } from "@/components/ui/card";
import { NewBookingModal } from "@/components/bookings/new-booking-modal";
import { BulkBookingModal } from "@/components/reservations/bulk-booking-modal";
import {
  ReserveCheckInModal,
  type ReserveCheckInBooking,
} from "@/components/reservations/reserve-checkin-modal";
import { ExtendStayModal } from "@/components/bookings/extend-stay-modal";
import { AddChargeModal } from "@/components/bookings/add-charge-modal";
import { CheckoutConfirmDialog } from "@/components/bookings/checkout-confirm-dialog";
import { formatNaira } from "@/lib/utils/currency";
import { fetchHotelBusinessNightUtcBounds } from "@/lib/payments/business-night-bounds";
import {
  sumRoomRevenueForHotelNight,
} from "@/lib/reports/day-page-stats";
import { usePageData } from "@/hooks/use-page-data";
import { useAuth } from "@/lib/auth-context";
import { hasPermission } from "@/lib/permissions";
import {
  Plus,
  Loader2,
  Users,
  LogOut,
  DoorOpen,
  Bed,
  AlertTriangle,
  CalendarClock,
  CalendarDays,
  Receipt,
  Banknote,
} from "lucide-react";
import { CompactStatBadgeRow } from "@/components/shared/compact-stat-badges";
import {
  parseBookingNotesMeta,
  formatBookingPaymentMethodLabel,
  bookingAmountPaid,
} from "@/lib/booking/parse-booking-notes";
import { paymentMethodRequiresAccount } from "@/lib/payments/payment-accounts";
import { enrichBookingsList } from "@/lib/booking/enrich-bookings-list";
import { buildDailyFrontDeskPack } from "@/lib/reports/daily-front-desk-pack";
import {
  TABLE_ACTIONS_ROW,
  TABLE_STACKED_CELL,
  TABLE_META_TEXT,
  TABLE_CELL_TRUNCATE,
} from "@/lib/utils/table-row-inline";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { getUserDisplayName } from "@/lib/utils/user-display";
import { fetchUserDisplayNameMap } from "@/lib/utils/fetch-user-display-names";
import { getBulkGroupId } from "@/lib/utils/bulk-booking";
import {
  manualCheckoutEligible,
  resolvedCheckoutDateForClosing,
  hideChargeExtendInBookingsTable,
  DEFAULT_ORG_CHECKOUT_TIME,
  isPastCheckoutCutoff,
} from "@/lib/utils/booking-checkout-ui";
import { fetchOrgCheckoutTime } from "@/lib/utils/org-checkout-policy";
import {
  folioGuestCreditAmount,
} from "@/lib/utils/booking-bill-balance";
import {
  calendarPickerYmd,
  todayYmdHotel,
} from "@/lib/utils/booking-in-house-dates";
import { frontOfficeTodayYmd, resolveHotelTimeZone } from "@/lib/hotel-date";
import { cancelBookingReservation } from "@/lib/reservations/cancel-reservation";
import { reconcileRoomStatusesClient } from "@/lib/rooms/reconcile-room-status-client";
import { roomHousekeepingPatchAfterCheckout } from "@/lib/rooms/sync-housekeeping-status";
import {
  classifyFrontOfficeStay,
  computeFrontOfficeStayStats,
  countPhysicallyHeldRooms,
  isShownOnDefaultBookingsList,
} from "@/lib/rooms/front-office-stay";
import { networkFetchHint, withFetchRetry } from "@/lib/utils/fetch-retry";
import {
  formatShortStayDates,
  MobileTableSubdetail,
} from "@/lib/utils/table-mobile";

const BOOKINGS_SCOPE_LIMIT = 500;

function describeFetchError(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (err && typeof err === "object") {
    const row = err as { message?: string; code?: string; details?: string };
    if (row.message) return row.message;
    if (row.code) return row.code;
    if (row.details) return row.details;
  }
  try {
    return JSON.stringify(err);
  } catch {
    return String(err);
  }
}

interface Booking {
  id: string;
  folio_id: string;
  guest_id?: string | null;
  room_id?: string | null;
  check_in: string;
  check_out: string;
  number_of_nights: number;
  status: string;
  payment_status: string;
  payment_method?: string;
  ledger_account_name?: string;
  payment_account_label?: string;
  last_reschedule?: string | null;
  guestName?: string;
  guestPhone?: string;
  organization_id?: string;
  rate_per_night: number;
  total_amount: number;
  balance: number;
  folio_credit?: number;
  deposit: number;
  created_by?: string;
  created_by_name?: string;
  updated_by?: string;
  updated_by_name?: string;
  updated_at?: string;
  notes?: string;
  is_bulk?: boolean;
  bulk_group_id?: string;
  /** Folios in this bulk group (for grouped rows only) */
  bulk_members?: Booking[];
  room_count?: number;
  guest_count?: number;
  guests?: { name: string; phone: string };
  rooms?: { id?: string; room_number: string; room_type: string };
  folio_status?: string | null;
}

type BookingsCheckoutDraft =
  | { kind: "single"; booking: Booking }
  | { kind: "bulk"; bulkRow: Booking; targets: Booking[] };

export default function BookingsPage() {
  /** Default table view: in-house stays (fast). */
  const [inHouseBookings, setInHouseBookings] = useState<Booking[]>([]);
  /** Full folio catalog for search (last 90 days). */
  const [allBookingsCatalog, setAllBookingsCatalog] = useState<Booking[]>([]);
  const [modalOpen, setModalOpen] = useState(false);
  const [bulkModalOpen, setBulkModalOpen] = useState(false);
  const [extendModalOpen, setExtendModalOpen] = useState(false);
  const [addChargeModalOpen, setAddChargeModalOpen] = useState(false);
  const [selectedBooking, setSelectedBooking] = useState<any>(null);
  const [checkoutLoadingId, setCheckoutLoadingId] = useState<string | null>(
    null,
  );
  const [checkoutLoadingGroupId, setCheckoutLoadingGroupId] = useState<
    string | null
  >(null);
  const [checkoutDraft, setCheckoutDraft] =
    useState<BookingsCheckoutDraft | null>(null);
  const [cancelReserveLoadingId, setCancelReserveLoadingId] = useState<
    string | null
  >(null);
  const [reserveCheckInBooking, setReserveCheckInBooking] =
    useState<ReserveCheckInBooking | null>(null);
  const [reserveCheckInOpen, setReserveCheckInOpen] = useState(false);
  const { initialLoading, startFetch, endFetch } = usePageData();
  const { organizationId, role, userId } = useAuth();
  const router = useRouter();
  const canManageFolio =
    role === "superadmin" || role === "admin" || role === "front_desk";
  const canCheckInReserved = hasPermission(role, "bookings:checkin");
  const canCancelReservation = hasPermission(role, "reservations:delete");

  const [orgCheckoutTime, setOrgCheckoutTime] = useState(
    DEFAULT_ORG_CHECKOUT_TIME,
  );
  /** Drives server fetch scope; default shows only in-house checked-in guests (fast). */
  const [tableFilters, setTableFilters] = useState<Record<string, string>>({
    status: "checked_in",
    payment_status: "all",
  });
  const [tableSearchQuery, setTableSearchQuery] = useState("");
  const [catalogScopeLoaded, setCatalogScopeLoaded] = useState<string | null>(
    null,
  );
  const inHouseEnrichRef = useRef(0);
  const catalogEnrichRef = useRef(0);
  const [catalogLoading, setCatalogLoading] = useState(false);
  /** When set, table shows in-house guests for that hotel night (not arrivals-only). */
  const [stayDateYmd, setStayDateYmd] = useState<string | null>(null);
  const [frontOfficeToday, setFrontOfficeToday] = useState(() => todayYmdHotel());
  const [roomStats, setRoomStats] = useState<{
    total: number;
    occupied: number;
    reserved: number;
    availableForCheckin: number;
    outOfOrder: number;
    dueOutToday: number;
    roomRevenue: number;
    netProfit: number;
    statsDate: string;
  } | null>(null);

  const statsDateYmd = stayDateYmd ?? frontOfficeToday;

  useEffect(() => {
    if (!organizationId) return;
    let cancelled = false;
    (async () => {
      const supabase = createClient();
      if (!supabase) return;
      const checkoutTime = await fetchOrgCheckoutTime(supabase, organizationId);
      const { data: orgRow } = await supabase
        .from("organizations")
        .select("business_date")
        .eq("id", organizationId)
        .maybeSingle();
      if (!cancelled) {
        setOrgCheckoutTime(checkoutTime);
        setFrontOfficeToday(frontOfficeTodayYmd(orgRow?.business_date));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [organizationId]);

  const refreshRoomStats = useCallback(async (forDate?: string) => {
    if (!organizationId) return;
    const supabase = createClient();
    if (!supabase) return;
    const tz = resolveHotelTimeZone();
    const today = forDate ?? frontOfficeToday;

    const [
      { data: roomRows, error: roomErr },
      { data: dueBookings, error: dueErr },
    ] = await Promise.all([
      supabase
        .from("rooms")
        .select("status")
        .eq("organization_id", organizationId),
      supabase
        .from("bookings")
        .select("id, room_id, check_in, check_out, status, folio_status, rate_per_night")
        .eq("organization_id", organizationId)
        .in("status", ["checked_in", "confirmed", "reserved"]),
    ]);

    if (roomErr) {
      console.warn("[bookings] room stats:", roomErr.message);
      return;
    }
    if (dueErr) {
      console.warn("[bookings] due-out stats:", dueErr.message);
    }

    let netProfit = 0;
    let roomRevenue = 0;
    try {
      const bounds = await fetchHotelBusinessNightUtcBounds({
        supabase,
        organizationId,
        ymd: today,
        timeZone: tz,
      });

      const nightBookQ = supabase
        .from("bookings")
        .select(
          "id, check_in, check_out, status, rate_per_night, folio_id, payment_status, guests:guest_id(name), rooms:room_id(room_number, room_type)",
        )
        .eq("organization_id", organizationId)
        .in("status", ["confirmed", "checked_in", "reserved", "checked_out"])
        .lte("check_in", today)
        .gt("check_out", today)
        .limit(500);

      let txQ =
        bounds.empty
          ? null
          : supabase
              .from("transactions")
              .select("*")
              .eq("organization_id", organizationId)
              .gte("created_at", bounds.startIso)
              .lte("created_at", bounds.endInclusiveIso)
              .limit(5000);

      let payQ =
        bounds.empty
          ? null
          : supabase
              .from("payments")
              .select("*")
              .eq("organization_id", organizationId)
              .gte("payment_date", bounds.startIso)
              .lte("payment_date", bounds.endInclusiveIso)
              .limit(5000);

      const [nightBookRes, txRes, payRes] = await Promise.all([
        nightBookQ,
        txQ || Promise.resolve({ data: [] as unknown[], error: null }),
        payQ || Promise.resolve({ data: [] as unknown[], error: null }),
      ]);

      const pack = buildDailyFrontDeskPack({
        dateYmd: today,
        bookings: (nightBookRes.data || []) as any,
        transactions: (txRes.data || []) as any,
        payments: (payRes.data || []) as any,
      });
      roomRevenue = pack.roomRevenueGenerated;
      netProfit = pack.salesCollection.total;
    } catch (e) {
      console.warn("[bookings] net/rev stats:", e);
      roomRevenue = sumRoomRevenueForHotelNight(dueBookings ?? [], today);
    }

    const norm = (s: string | null | undefined) =>
      String(s || "")
        .toLowerCase()
        .replace(/-/g, "_");
    const list = roomRows || [];
    const stay = computeFrontOfficeStayStats(dueBookings ?? [], today, tz);
    const physicallyHeld = countPhysicallyHeldRooms(dueBookings ?? [], today, tz);
    const outOfOrder = list.filter(
      (r: { status?: string }) => norm(r.status) === "out_of_order",
    ).length;
    const availableForCheckin = Math.max(0, list.length - physicallyHeld - outOfOrder);

    setRoomStats({
      total: list.length,
      occupied: stay.occupied,
      reserved: stay.reserved,
      availableForCheckin,
      outOfOrder,
      dueOutToday: stay.dueOut,
      roomRevenue,
      netProfit,
      statsDate: today,
    });
  }, [organizationId, frontOfficeToday]);

  function groupBulkRows(rows: Booking[]) {
    const grouped = new Map<string, Booking[]>();
    const singles: Booking[] = [];

    rows.forEach((row) => {
      const groupId = getBulkGroupId(row);
      if (!groupId) {
        singles.push(row);
        return;
      }
      grouped.set(groupId, [...(grouped.get(groupId) || []), row]);
    });

    const bulkRows = Array.from(grouped.entries()).map(
      ([groupId, groupRows]) => {
        const first = groupRows[0];
        const guestNames = Array.from(
          new Set(groupRows.map((row) => row.guests?.name).filter(Boolean)),
        );
        const roomTypes = Array.from(
          new Set(groupRows.map((row) => row.rooms?.room_type).filter(Boolean)),
        );
        return {
          ...first,
          id: first.id,
          folio_id: `Bulk ${groupId}`,
          is_bulk: true,
          bulk_group_id: groupId,
          bulk_members: groupRows,
          room_count: groupRows.length,
          guest_count: guestNames.length,
          total_amount: groupRows.reduce(
            (sum, row) => sum + Number(row.total_amount || 0),
            0,
          ),
          deposit: groupRows.reduce(
            (sum, row) => sum + Number(row.deposit || 0),
            0,
          ),
          balance: groupRows.reduce(
            (sum, row) => sum + Number(row.balance || 0),
            0,
          ),
          folio_credit: groupRows.reduce(
            (sum, row) => sum + Number(row.folio_credit || 0),
            0,
          ),
          guests: {
            name:
              guestNames.length > 1
                ? `${guestNames[0]} + ${guestNames.length - 1} more`
                : guestNames[0] || "Bulk Guests",
            phone: `${groupRows.length} room${groupRows.length === 1 ? "" : "s"}`,
          },
          guestName: guestNames.join(" "),
          rooms: {
            room_number: `${groupRows.length}`,
            room_type: roomTypes.join(", ") || "Multiple rooms",
          },
        };
      },
    );

    return [...bulkRows, ...singles].sort(
      (a, b) => new Date(b.check_in).getTime() - new Date(a.check_in).getTime(),
    );
  }

  const runDeferredInHouseEnrich = useCallback(
    async (
      rows: Booking[],
      supabase: NonNullable<ReturnType<typeof createClient>>,
    ) => {
      if (!organizationId || !rows.length) return;
      const req = ++inHouseEnrichRef.current;
      try {
        const copy = rows.map((b) => ({ ...b }));
        await enrichBookingsList(supabase, organizationId, copy);
        if (inHouseEnrichRef.current !== req) return;
        setInHouseBookings(groupBulkRows(copy as Booking[]));
      } catch (err) {
        if (process.env.NODE_ENV === "development") {
          console.warn("[bookings] deferred folio enrich failed:", err);
        }
      }
    },
    [organizationId],
  );

  const runDeferredCatalogEnrich = useCallback(
    async (
      rows: Booking[],
      scopeKey: string,
      supabase: NonNullable<ReturnType<typeof createClient>>,
    ) => {
      if (!organizationId || !rows.length) return;
      const req = ++catalogEnrichRef.current;
      try {
        const copy = rows.map((b) => ({ ...b }));
        await enrichBookingsList(supabase, organizationId, copy);
        if (catalogEnrichRef.current !== req) return;
        setAllBookingsCatalog(groupBulkRows(copy as Booking[]));
        setCatalogScopeLoaded(scopeKey);
      } catch (err) {
        if (process.env.NODE_ENV === "development") {
          console.warn("[bookings] deferred catalog enrich failed:", err);
        }
      }
    },
    [organizationId],
  );

  const fetchBookings = useCallback(async () => {
    startFetch();
    try {
      const supabase = createClient();

      if (!supabase || !organizationId) {
        setInHouseBookings([]);
        setAllBookingsCatalog([]);
        setCatalogScopeLoaded(null);
        return;
      }

      setCatalogScopeLoaded(null);
      setAllBookingsCatalog([]);

      const loadScope = async (statusKey: string, enrich = true) => {
        const tz = resolveHotelTimeZone();
        const today = frontOfficeToday;
        const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000)
          .toISOString()
          .split("T")[0];
        const fortyFiveDaysAgo = new Date(Date.now() - 45 * 24 * 60 * 60 * 1000)
          .toISOString()
          .split("T")[0];
        const sixtyDaysAgo = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000)
          .toISOString()
          .split("T")[0];

        let query = supabase
          .from("bookings")
          .select("*, guests(name, phone), rooms(id, room_number, room_type)")
          .eq("organization_id", organizationId)
          .limit(BOOKINGS_SCOPE_LIMIT);

        if (statusKey === "checked_in") {
          // In-house: checked-in / confirmed stayovers + due out today (no reservations).
          query = query
            .in("status", ["checked_in", "confirmed"])
            .gte("check_out", today);
        } else if (statusKey === "all") {
          query = query
            .in("status", [
              "confirmed",
              "checked_in",
              "reserved",
              "checked_out",
            ])
            .gte("check_in", ninetyDaysAgo);
        } else if (statusKey === "checked_out") {
          query = query
            .eq("status", "checked_out")
            .gte("check_out", sixtyDaysAgo);
        } else {
          query = query
            .eq("status", statusKey)
            .gte("check_in", fortyFiveDaysAgo);
        }

        const { data, error } = await query
          .order("check_in", { ascending: false })
          .order("created_at", { ascending: false });

        if (error) throw error;

        // Fetch creator and updater profiles for all bookings
        const userIds = Array.from(
          new Set(
            [
              ...(data || []).map((b: any) => b.created_by),
              ...(data || []).map((b: any) => b.updated_by),
            ].filter(Boolean),
          ),
        );
        const userMap = await fetchUserDisplayNameMap(
          userIds as string[],
          userId,
        );

        // Derive payment method / account from notes (may include reschedule history on later lines).
        let bookingsWithUsers = (data || []).map((booking: any) => {
          const notesMeta = parseBookingNotesMeta(booking.notes);
          return {
            ...booking,
            _db_balance: Number(booking.balance ?? 0),
            ...notesMeta,
            guestName: booking.guests?.name || "",
            guestPhone: booking.guests?.phone || "",
            created_by_name: booking.created_by
              ? userMap[booking.created_by] ||
                getUserDisplayName(null, booking.created_by)
              : "System",
            updated_by_name: booking.updated_by
              ? userMap[booking.updated_by] ||
                getUserDisplayName(null, booking.updated_by)
              : null,
          };
        });

        if (statusKey === "checked_in") {
          // Default list: Occ + due-today + arrive-today reservations.
          bookingsWithUsers = bookingsWithUsers.filter((b: any) =>
            isShownOnDefaultBookingsList(b, today, tz),
          );
        }

        const bookingIds = bookingsWithUsers.map((b: any) => b.id);
        if (bookingIds.length > 0) {
          if (enrich) {
            await enrichBookingsList(
              supabase,
              organizationId,
              bookingsWithUsers,
            );
          }
        } else {
          bookingsWithUsers.forEach((b: any) => {
            delete b._db_balance;
          });
        }

        return bookingsWithUsers;
      };

      const inHouse = await Promise.race([
        withFetchRetry(() => loadScope("checked_in", false)),
        new Promise<never>((_, reject) =>
          setTimeout(
            () => reject(new Error("Bookings request timed out")),
            25_000,
          ),
        ),
      ]);
      setInHouseBookings(groupBulkRows(inHouse));
      void runDeferredInHouseEnrich(inHouse, supabase);
    } catch (error: unknown) {
      const detail = describeFetchError(error);
      if (process.env.NODE_ENV === "development") {
        console.warn("[bookings] fetch failed:", detail, error);
      }
      const msg =
        detail === "Bookings request timed out"
          ? "Bookings took too long — try Refresh or a narrower status filter."
          : (networkFetchHint(detail) ??
            (detail
              ? `Failed to load bookings: ${detail}`
              : "Failed to load bookings"));
      toast.error(msg);
      setInHouseBookings([]);
    } finally {
      endFetch();
    }
  }, [organizationId, userId, startFetch, endFetch, frontOfficeToday, runDeferredInHouseEnrich]);

  const fetchBookingsCatalog = useCallback(
    async (scopeKey: string) => {
      if (!organizationId) return;
      const supabase = createClient();
      if (!supabase) return;

      setCatalogLoading(true);
      try {
        await withFetchRetry(async () => {
          const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000)
            .toISOString()
            .split("T")[0];
          const fortyFiveDaysAgo = new Date(
            Date.now() - 45 * 24 * 60 * 60 * 1000,
          )
            .toISOString()
            .split("T")[0];
          const sixtyDaysAgo = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000)
            .toISOString()
            .split("T")[0];

          let query = supabase
            .from("bookings")
            .select("*, guests(name, phone), rooms(id, room_number, room_type)")
            .eq("organization_id", organizationId)
            .limit(BOOKINGS_SCOPE_LIMIT);

          const tz = resolveHotelTimeZone();
          const today = frontOfficeToday;

          if (scopeKey === "all") {
            query = query
              .in("status", [
                "confirmed",
                "checked_in",
                "reserved",
                "checked_out",
              ])
              .gte("check_in", ninetyDaysAgo);
          } else if (scopeKey === "checked_out") {
            query = query
              .eq("status", "checked_out")
              .gte("check_out", sixtyDaysAgo);
          } else if (scopeKey === "due_out") {
            query = query
              .in("status", ["checked_in", "confirmed", "reserved"])
              .lte("check_out", today);
          } else {
            query = query
              .eq("status", scopeKey)
              .gte("check_in", fortyFiveDaysAgo);
          }

          const { data, error } = await withFetchRetry(() =>
            query
              .order("check_in", { ascending: false })
              .order("created_at", { ascending: false }),
          );

          if (error) throw error;

          const userIds = Array.from(
            new Set(
              [
                ...(data || []).map((b: any) => b.created_by),
                ...(data || []).map((b: any) => b.updated_by),
              ].filter(Boolean),
            ),
          );
          const userMap = await fetchUserDisplayNameMap(
            userIds as string[],
            userId,
          );

          let bookingsWithUsers = (data || []).map((booking: any) => {
            const notesMeta = parseBookingNotesMeta(booking.notes);
            return {
              ...booking,
              _db_balance: Number(booking.balance ?? 0),
              ...notesMeta,
              guestName: booking.guests?.name || "",
              guestPhone: booking.guests?.phone || "",
              created_by_name: booking.created_by
                ? userMap[booking.created_by] ||
                  getUserDisplayName(null, booking.created_by)
                : "System",
              updated_by_name: booking.updated_by
                ? userMap[booking.updated_by] ||
                  getUserDisplayName(null, booking.updated_by)
                : null,
            };
          });

          const bookingIds = bookingsWithUsers.map((b: any) => b.id);
          if (!bookingIds.length) {
            bookingsWithUsers.forEach((b: any) => {
              delete b._db_balance;
            });
          }

          if (scopeKey === "due_out") {
            const tz = resolveHotelTimeZone();
            const today = frontOfficeToday;
            bookingsWithUsers = bookingsWithUsers.filter(
              (b: any) => classifyFrontOfficeStay(b, today, tz) === "due_out",
            );
          }

          setAllBookingsCatalog(groupBulkRows(bookingsWithUsers));
          setCatalogScopeLoaded(scopeKey);
          void runDeferredCatalogEnrich(bookingsWithUsers, scopeKey, supabase);
        });
      } catch (error: unknown) {
        const detail = describeFetchError(error);
        if (process.env.NODE_ENV === "development") {
          console.warn("[bookings] catalog fetch failed:", detail, error);
        }
        toast.error(
          networkFetchHint(detail) ??
            (detail
              ? `Search catalog failed: ${detail}`
              : "Search catalog failed"),
        );
      } finally {
        setCatalogLoading(false);
      }
    },
    [organizationId, userId, frontOfficeToday, runDeferredCatalogEnrich],
  );

  /** In-house / stayovers for a hotel night (daily book), including later checked-out guests. */
  const fetchStayDateBookings = useCallback(
    async (dayYmd: string) => {
      if (!organizationId || !/^\d{4}-\d{2}-\d{2}$/.test(dayYmd)) return;
      const supabase = createClient();
      if (!supabase) return;

      const scopeKey = `stay:${dayYmd}`;
      setCatalogLoading(true);
      try {
        await withFetchRetry(async () => {
          const { data, error } = await supabase
            .from("bookings")
            .select("*, guests(name, phone), rooms(id, room_number, room_type)")
            .eq("organization_id", organizationId)
            .in("status", ["confirmed", "checked_in", "reserved", "checked_out"])
            .lte("check_in", dayYmd)
            .gt("check_out", dayYmd)
            .order("check_in", { ascending: false })
            .limit(BOOKINGS_SCOPE_LIMIT);

          if (error) throw error;

          const userIds = Array.from(
            new Set(
              [
                ...(data || []).map((b: any) => b.created_by),
                ...(data || []).map((b: any) => b.updated_by),
              ].filter(Boolean),
            ),
          );
          const userMap = await fetchUserDisplayNameMap(
            userIds as string[],
            userId,
          );

          let bookingsWithUsers = (data || []).map((booking: any) => {
            const notesMeta = parseBookingNotesMeta(booking.notes);
            return {
              ...booking,
              _db_balance: Number(booking.balance ?? 0),
              ...notesMeta,
              guestName: booking.guests?.name || "",
              guestPhone: booking.guests?.phone || "",
              created_by_name: booking.created_by
                ? userMap[booking.created_by] ||
                  getUserDisplayName(null, booking.created_by)
                : "System",
              updated_by_name: booking.updated_by
                ? userMap[booking.updated_by] ||
                  getUserDisplayName(null, booking.updated_by)
                : null,
            };
          });

          const bookingIds = bookingsWithUsers.map((b: any) => b.id);
          if (!bookingIds.length) {
            bookingsWithUsers.forEach((b: any) => {
              delete b._db_balance;
            });
          }

          setAllBookingsCatalog(groupBulkRows(bookingsWithUsers));
          setCatalogScopeLoaded(scopeKey);
          void runDeferredCatalogEnrich(bookingsWithUsers, scopeKey, supabase);
        });
      } catch (error: unknown) {
        const detail = describeFetchError(error);
        toast.error(
          networkFetchHint(detail) ??
            (detail
              ? `Stay-date load failed: ${detail}`
              : "Stay-date load failed"),
        );
      } finally {
        setCatalogLoading(false);
      }
    },
    [organizationId, userId, runDeferredCatalogEnrich],
  );

  const handleBookingsDateFilterChange = useCallback(
    (date: Date | undefined) => {
      if (date) {
        const ymd = calendarPickerYmd(date);
        setStayDateYmd(ymd);
        setTableFilters((prev) => ({
          ...prev,
          status: "all",
        }));
        void fetchStayDateBookings(ymd);
        void refreshRoomStats(ymd);
      } else {
        setStayDateYmd(null);
        setTableFilters((prev) => ({
          ...prev,
          status: "checked_in",
        }));
        void refreshRoomStats(frontOfficeToday);
      }
    },
    [fetchStayDateBookings, refreshRoomStats, frontOfficeToday],
  );

  useEffect(() => {
    if (!organizationId) {
      setInHouseBookings([]);
      setAllBookingsCatalog([]);
      endFetch();
      return;
    }
    fetchBookings();
  }, [organizationId, userId, fetchBookings, endFetch]);

  useEffect(() => {
    if (!organizationId) return;
    const searching = tableSearchQuery.trim().length > 0;
    const statusKey = tableFilters.status || "checked_in";
    // Stay-date catalog is loaded by the date picker; don't overwrite with generic "all".
    if (stayDateYmd && !searching) return;
    const needsCatalog = searching || statusKey !== "checked_in";
    if (!needsCatalog) return;

    const scopeKey = searching ? "all" : statusKey;
    if (catalogLoading) return;
    if (catalogScopeLoaded === scopeKey && allBookingsCatalog.length > 0)
      return;

    void fetchBookingsCatalog(scopeKey);
  }, [
    organizationId,
    tableSearchQuery,
    tableFilters.status,
    stayDateYmd,
    catalogScopeLoaded,
    catalogLoading,
    allBookingsCatalog.length,
    fetchBookingsCatalog,
  ]);

  useEffect(() => {
    if (!organizationId) {
      setRoomStats(null);
      return;
    }
    void refreshRoomStats(stayDateYmd ?? frontOfficeToday);
  }, [organizationId, refreshRoomStats, stayDateYmd, frontOfficeToday]);

  const statusColors: Record<string, string> = {
    reserved: "bg-blue-500/10 text-blue-700 border-blue-200",
    confirmed: "bg-sky-500/10 text-sky-800 border-sky-200",
    checked_in: "bg-green-500/10 text-green-700 border-green-200",
    checked_out: "bg-gray-500/10 text-gray-700 border-gray-200",
    no_show: "bg-orange-500/10 text-orange-700 border-orange-200",
    cancelled: "bg-red-500/10 text-red-700 border-red-200",
  };

  const paymentColors: Record<string, string> = {
    paid: "bg-green-500/10 text-green-700 border-green-200",
    partial: "bg-yellow-500/10 text-yellow-700 border-yellow-200",
    pending: "bg-orange-500/10 text-orange-700 border-orange-200",
    cancelled: "bg-red-500/10 text-red-700 border-red-200",
    credit: "bg-blue-500/10 text-blue-700 border-blue-200",
  };

  const paymentCellForBooking = (booking: Booking) => {
    const owed = Math.max(0, Number(booking.balance ?? 0));
    const creditAmt = Math.max(0, Number(booking.folio_credit ?? 0));
    const paidAmt = bookingAmountPaid(booking.total_amount, booking.balance);
    const isCancelledLike = booking.status === "cancelled";

    let effectiveStatus =
      booking.payment_method === "city_ledger" &&
      booking.payment_status === "paid" &&
      owed > 0
        ? "pending"
        : booking.payment_status;

    if (!isCancelledLike && owed <= 0) {
      effectiveStatus = "paid";
    }

    const key = String(effectiveStatus || "pending").toLowerCase();
    // Paid + prepaid overpay: keep the paid pill and show Credit underneath.
    if (!isCancelledLike && owed <= 0 && creditAmt > 0) {
      return {
        badgeClass: paymentColors.paid,
        badgeText: "paid",
        owedLine: null as number | null,
        paidLine: paidAmt > 0 ? paidAmt : null,
        creditLine: creditAmt,
      };
    }

    return {
      badgeClass: paymentColors[key] ?? paymentColors.pending,
      badgeText: key,
      owedLine: owed > 0 ? owed : null,
      paidLine:
        !isCancelledLike && key === "paid" && paidAmt > 0 ? paidAmt : null,
      creditLine: creditAmt > 0 ? creditAmt : null,
    };
  };

  const calculateNights = (checkIn: string | Date, checkOut: string | Date) => {
    const start = typeof checkIn === "string" ? new Date(checkIn) : checkIn;
    const end = typeof checkOut === "string" ? new Date(checkOut) : checkOut;
    return Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
  };

  const handleBulkCheckoutFromTable = (bulkRow: Booking) => {
    const members = bulkRow.bulk_members || [];
    const targets = members.filter((m) =>
      manualCheckoutEligible(
        {
          status: m.status,
          check_in: m.check_in,
          check_out: m.check_out,
          folio_status: m.folio_status,
        },
        orgCheckoutTime,
      ),
    );

    if (targets.length === 0) {
      toast.message(
        "No folios in this group are available for checkout (already checked out or past auto-checkout window).",
      );
      return;
    }
    setCheckoutDraft({ kind: "bulk", bulkRow, targets });
  };

  const handleCancelReserveFromTable = (booking: Booking) => {
    toast.custom(
      (tid: string | number) => (
        <div className="flex flex-col gap-3">
          <div className="flex gap-2 items-start">
            <LogOut className="w-5 h-5 text-red-600 mt-0.5 shrink-0" />
            <div>
              <p className="font-semibold">Cancel this reservation?</p>
              <p className="text-sm text-muted-foreground">
                The folio is marked cancelled; any held room is freed.
              </p>
            </div>
          </div>
          <div className="flex gap-2 justify-end">
            <Button
              variant="outline"
              size="sm"
              onClick={() => toast.dismiss(tid)}
            >
              Keep
            </Button>
            <Button
              variant="destructive"
              size="sm"
              disabled={cancelReserveLoadingId === booking.id}
              onClick={async () => {
                toast.dismiss(tid);
                setCancelReserveLoadingId(booking.id);
                try {
                  const supabase = createClient();
                  const { error } = await cancelBookingReservation(supabase, {
                    bookingId: booking.id,
                    roomId: booking.room_id,
                    userId,
                  });
                  if (error) throw error;
                  toast.success("Reservation cancelled");
                  fetchBookings();
                } catch (err: any) {
                  toast.error(err.message || "Failed to cancel reservation");
                } finally {
                  setCancelReserveLoadingId(null);
                }
              }}
            >
              Cancel reservation
            </Button>
          </div>
        </div>
      ),
      { duration: Infinity },
    );
  };

  const openReserveCheckIn = (booking: Booking) => {
    setReserveCheckInBooking({
      id: booking.id,
      organization_id: booking.organization_id || organizationId || "",
      folio_id: booking.folio_id,
      check_in: booking.check_in,
      check_out: booking.check_out,
      guest_id: booking.guest_id,
      room_id: booking.room_id,
      rate_per_night: booking.rate_per_night,
      guests: booking.guests?.name ? { name: booking.guests.name } : null,
      rooms: booking.rooms?.room_number
        ? {
            id: booking.rooms.id,
            room_number: booking.rooms.room_number,
            room_type: booking.rooms.room_type,
          }
        : null,
    });
    setReserveCheckInOpen(true);
  };

  const handleCheckoutFromTable = (booking: Booking) => {
    setCheckoutDraft({ kind: "single", booking });
  };

  const checkoutDialogBusy =
    checkoutDraft?.kind === "single"
      ? checkoutLoadingId === checkoutDraft.booking.id
      : checkoutDraft?.kind === "bulk"
        ? checkoutLoadingGroupId === (checkoutDraft.bulkRow.bulk_group_id ?? "")
        : false;

  const confirmCheckoutFromDialog = async () => {
    if (!checkoutDraft || !userId) return;

    if (checkoutDraft.kind === "single") {
      const booking = checkoutDraft.booking;
      setCheckoutLoadingId(booking.id);
      try {
        const supabase = createClient();
        const outDate = resolvedCheckoutDateForClosing(booking);
        const { error } = await supabase
          .from("bookings")
          .update({
            status: "checked_out",
            check_out: outDate,
            folio_status: "checked_out",
            updated_by: userId,
          })
          .eq("id", booking.id);
        if (error) throw error;
        if (booking.room_id) {
          await supabase
            .from("rooms")
            .update(roomHousekeepingPatchAfterCheckout())
            .eq("id", booking.room_id);
        }
        await reconcileRoomStatusesClient();
        toast.success(`${booking.guests?.name} checked out successfully`);
        setCheckoutDraft(null);
        fetchBookings();
        void refreshRoomStats();
      } catch (err: any) {
        toast.error(err.message || "Failed to check out guest");
      } finally {
        setCheckoutLoadingId(null);
      }
      return;
    }

    const { targets, bulkRow } = checkoutDraft;
    const gid = bulkRow.bulk_group_id ?? "";
    setCheckoutLoadingGroupId(gid);
    try {
      const supabase = createClient();
      for (const m of targets) {
        const outDate = resolvedCheckoutDateForClosing(m);
        const { error } = await supabase
          .from("bookings")
          .update({
            status: "checked_out",
            check_out: outDate,
            folio_status: "checked_out",
            updated_by: userId,
          })
          .eq("id", m.id);
        if (error) throw error;
        if (m.room_id) {
          await supabase
            .from("rooms")
            .update(roomHousekeepingPatchAfterCheckout())
            .eq("id", m.room_id);
        }
      }
      await reconcileRoomStatusesClient();
      toast.success(
        `Checked out ${targets.length} room${targets.length === 1 ? "" : "s"}`,
      );
      setCheckoutDraft(null);
      fetchBookings();
      void refreshRoomStats();
    } catch (err: any) {
      toast.error(err.message || "Failed to check out group");
    } finally {
      setCheckoutLoadingGroupId(null);
    }
  };

  if (initialLoading) {
    return (
      <div className="flex items-center justify-center h-96">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  const statusKey = tableFilters.status || "checked_in";
  const searchingCatalog = tableSearchQuery.trim().length > 0;
  const needsCatalog =
    searchingCatalog || statusKey !== "checked_in" || Boolean(stayDateYmd);
  // Stay-date fetch stores scope as `stay:YYYY-MM-DD` — must match or the table spinner never stops.
  const catalogScopeKey = searchingCatalog
    ? "all"
    : stayDateYmd
      ? `stay:${stayDateYmd}`
      : statusKey;
  const catalogFetchPending =
    needsCatalog && (catalogLoading || catalogScopeLoaded !== catalogScopeKey);

  return (
    <div className="space-y-6">
      <CheckoutConfirmDialog
        open={checkoutDraft !== null}
        onClose={() => {
          if (checkoutDialogBusy) return;
          setCheckoutDraft(null);
        }}
        title={
          checkoutDraft?.kind === "bulk"
            ? `Check out ${checkoutDraft.targets.length} room${checkoutDraft.targets.length === 1 ? "" : "s"}?`
            : "Check out guest?"
        }
        description={
          checkoutDraft?.kind === "bulk" ? (
            <>
              <p>
                {checkoutDraft.targets.length} room
                {checkoutDraft.targets.length === 1 ? "" : "s"} —{" "}
                <span className="font-medium text-foreground">
                  {checkoutDraft.bulkRow.guests?.name}
                </span>
              </p>
              <p className="mt-1">
                All eligible folios in this bulk group will be marked checked
                out.
              </p>
            </>
          ) : checkoutDraft?.kind === "single" ? (
            <>
              <p>
                <span className="font-medium text-foreground">
                  {checkoutDraft.booking.guests?.name}
                </span>
                {" — "}
                Room {checkoutDraft.booking.rooms?.room_number}
              </p>
              <p className="mt-1">This closes the folio and frees the room.</p>
            </>
          ) : undefined
        }
        outstandingAmount={
          checkoutDraft?.kind === "bulk"
            ? checkoutDraft.targets.reduce(
                (s, m) => s + Number(m.balance ?? 0),
                0,
              )
            : checkoutDraft?.kind === "single"
              ? Number(checkoutDraft.booking.balance ?? 0)
              : undefined
        }
        outstandingLabel={
          checkoutDraft?.kind === "bulk"
            ? "Outstanding (sum):"
            : "Outstanding balance:"
        }
        loading={checkoutDialogBusy}
        onConfirm={confirmCheckoutFromDialog}
      />

      <NewBookingModal
        open={modalOpen}
        onClose={() => {
          setModalOpen(false);
          fetchBookings();
        }}
      />
      <BulkBookingModal
        wording="booking"
        open={bulkModalOpen}
        onClose={() => setBulkModalOpen(false)}
        onSuccess={() => {
          setBulkModalOpen(false);
          fetchBookings();
        }}
      />
      <ReserveCheckInModal
        open={reserveCheckInOpen}
        onClose={() => {
          setReserveCheckInOpen(false);
          setReserveCheckInBooking(null);
        }}
        onSuccess={fetchBookings}
        booking={reserveCheckInBooking}
        userId={userId || ""}
      />
      {selectedBooking && (
        <>
          <ExtendStayModal
            open={extendModalOpen}
            onClose={() => {
              setExtendModalOpen(false);
              fetchBookings();
            }}
            booking={selectedBooking}
          />
          <AddChargeModal
            open={addChargeModalOpen}
            onClose={() => {
              setAddChargeModalOpen(false);
              fetchBookings();
            }}
            booking={selectedBooking}
          />
        </>
      )}

      <div className="flex flex-col gap-2 lg:flex-row lg:items-start lg:justify-between lg:gap-3">
        <div className="min-w-0">
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight shrink-0">
            Bookings
          </h1>
        </div>
        <div className="flex flex-wrap items-center justify-center lg:justify-end gap-1.5 shrink-0">
          {roomStats !== null && (() => {
            const dailyBookBase = `/transactions/daily-book?date=${roomStats.statsDate}`
            return (
            <CompactStatBadgeRow
              items={[
                {
                  key: "rev",
                  label: "Rev",
                  value: formatNaira(roomStats.roomRevenue),
                  icon: Receipt,
                  borderClass: "border-slate-200/80",
                  bgClass: "bg-slate-50/50",
                  iconClass: "text-slate-700",
                  title: "Room revenue — view in-house breakdown in Daily book",
                  href: `${dailyBookBase}#daily-book-guests`,
                },
                {
                  key: "net",
                  label: "Net",
                  value: formatNaira(roomStats.netProfit),
                  icon: Banknote,
                  borderClass: "border-emerald-200/80",
                  bgClass: "bg-emerald-50/50",
                  iconClass: "text-emerald-700",
                  title: "Net profit (sales collection) — view receipt lines in Daily book",
                  href: `${dailyBookBase}#daily-book-collections`,
                },
                {
                  key: "occ",
                  label: "Occ",
                  value: roomStats.occupied,
                  icon: Bed,
                  borderClass: "border-blue-200/80",
                  bgClass: "bg-blue-50/50",
                  iconClass: "text-blue-700",
                  title: "Checked-in guests staying past today",
                },
                {
                  key: "res",
                  label: "Res",
                  value: roomStats.reserved,
                  icon: CalendarDays,
                  borderClass: "border-violet-200/80",
                  bgClass: "bg-violet-50/50",
                  iconClass: "text-violet-700",
                  title: "Reservations not checked in yet",
                },
                {
                  key: "due",
                  label: "Due",
                  value: roomStats.dueOutToday,
                  icon: CalendarClock,
                  borderClass: "border-amber-200/80",
                  bgClass: "bg-amber-50/50",
                  iconClass: "text-amber-700",
                  title: "Checkout on the hotel business date",
                },
                {
                  key: "avail",
                  label: "Avail",
                  value: roomStats.availableForCheckin,
                  icon: DoorOpen,
                  borderClass: "border-green-200/80",
                  bgClass: "bg-green-50/50",
                  iconClass: "text-green-700",
                  title: "Rooms free for check-in",
                },
                {
                  key: "ooo",
                  label: "OOO",
                  value: roomStats.outOfOrder,
                  icon: AlertTriangle,
                  borderClass: "border-orange-200/80",
                  bgClass: "bg-orange-50/50",
                  iconClass: "text-orange-700",
                  title: "Out of order",
                },
              ]}
              suffix={
                <span
                  className="text-[10px] text-muted-foreground tabular-nums px-0.5"
                  title="Total rooms"
                >
                  /{roomStats.total}
                </span>
              }
            />
            )
          })()}
          {hasPermission(role, "bookings:create") && (
            <>
              <Button
                variant="outline"
                size="sm"
                className="h-[31px] text-[11px] px-2"
                onClick={() => setBulkModalOpen(true)}
              >
                <Users className="mr-1 h-3.5 w-3.5" />
                Bulk Booking
              </Button>
              <Button
                size="sm"
                className="h-[31px] text-[11px] px-2"
                onClick={() => setModalOpen(true)}
              >
                <Plus className="mr-1 h-3.5 w-3.5" />
                New Booking
              </Button>
            </>
          )}
        </div>
      </div>

      <EnhancedDataTable
        data={allBookingsCatalog}
        loading={catalogFetchPending}
        showRowNumbers
        listWhenSearchEmpty={
          tableFilters.status === "checked_in" ? inHouseBookings : undefined
        }
        compactTable
        rowKey={(b) =>
          b.is_bulk && b.bulk_group_id
            ? `bulk-${b.bulk_group_id}`
            : String(b.id)
        }
        controlledActiveFilters={tableFilters}
        onControlledActiveFiltersChange={setTableFilters}
        onDateFilterChange={handleBookingsDateFilterChange}
        onSearchQueryChange={setTableSearchQuery}
        filterKeysIgnoredWhileSearching={["status"]}
        searchPlaceholder="Search all bookings by guest, room, folio…"
        searchMatch={(b, query) => {
          const q = query.trim().toLowerCase();
          if (!q) return true;
          const parts: string[] = [
            String(b.folio_id ?? ""),
            String(b.guestName ?? ""),
            String(b.guests?.name ?? ""),
            String(b.guestPhone ?? ""),
            String(b.guests?.phone ?? ""),
            String(b.ledger_account_name ?? ""),
            String(b.rooms?.room_number ?? ""),
            String(b.rooms?.room_type ?? ""),
          ];
          if (b.is_bulk && b.bulk_members) {
            for (const m of b.bulk_members) {
              parts.push(
                String(m.guests?.name ?? ""),
                String(m.guests?.phone ?? ""),
                String(m.rooms?.room_number ?? ""),
              );
            }
          }
          return parts.some((p) => p.toLowerCase().includes(q));
        }}
        resolveFilterMatch={(row, key, val) => {
          const statusVal = val.trim().toLowerCase();
          if (key !== "status") return undefined;
          const r = row as Booking;
          const tz = resolveHotelTimeZone();
          const today = frontOfficeToday;
          if (statusVal === "checked_in") {
            if (r.is_bulk && r.bulk_members?.length) {
              return r.bulk_members.some((m) =>
                isShownOnDefaultBookingsList(m, today, tz),
              );
            }
            return isShownOnDefaultBookingsList(r, today, tz);
          }
          if (statusVal === "due_out") {
            if (r.is_bulk && r.bulk_members?.length) {
              return r.bulk_members.some(
                (m) => classifyFrontOfficeStay(m, today, tz) === "due_out",
              );
            }
            return classifyFrontOfficeStay(r, today, tz) === "due_out";
          }
          return undefined;
        }}
        filters={[
          {
            key: "payment_status",
            label: "Payment Status",
            options: [
              { value: "paid", label: "Paid" },
              { value: "partial", label: "Partial" },
              { value: "pending", label: "Pending" },
            ],
          },
          {
            key: "status",
            label: "Status",
            options: [
              { value: "checked_in", label: "In house (Occ + Due)" },
              { value: "due_out", label: "Due out today" },
              { value: "reserved", label: "Reserved" },
              { value: "confirmed", label: "Confirmed" },
              { value: "checked_out", label: "Checked out" },
            ],
          },
        ]}
        emptyState={{
          title: "No bookings match your filters",
          description:
            "Default list shows occupied, due today, and today’s arrivals. Stay date lists every guest occupying that hotel night. Clear the date for today’s in-house list.",
        }}
        dateField="check_in"
        checkOutField="check_out"
        dateMatchMode="stay_overlap"
        datePickerPlaceholder="Stay date"
        onRowClick={(booking) => {
          router.push(
            booking.is_bulk
              ? `/bulk-bookings/${booking.bulk_group_id}`
              : `/bookings/${booking.id}`,
          )
        }}
        columns={[
          {
            key: "guest",
            label: "Guest",
            render: (booking) => {
              const stayKind = classifyFrontOfficeStay(
                booking,
                frontOfficeToday,
                resolveHotelTimeZone(),
              );
              const isReservationRow = stayKind === "reserved";
              const isDueOutRow = stayKind === "due_out";
              return (
              <div
                className={`cursor-pointer hover:text-primary ${
                  isReservationRow
                    ? "rounded-md border border-violet-200 bg-violet-50/60 px-1.5 py-1 dark:border-violet-900/40 dark:bg-violet-950/30"
                    : isDueOutRow
                      ? "rounded-md border border-amber-200 bg-amber-50/60 px-1.5 py-1 dark:border-amber-900/40 dark:bg-amber-950/30"
                      : ""
                }`}
                onClick={() =>
                  router.push(
                    booking.is_bulk
                      ? `/bulk-bookings/${booking.bulk_group_id}`
                      : `/bookings/${booking.id}`,
                  )
                }
              >
                <div className="font-medium max-md:text-[13px] flex flex-wrap items-center gap-1.5">
                  <span>{booking.guests?.name}</span>
                  {isReservationRow && (
                    <Badge
                      variant="outline"
                      className="text-[10px] px-1 py-0 bg-violet-100 text-violet-800 border-violet-200"
                    >
                      Reservation — not checked in
                    </Badge>
                  )}
                  {isDueOutRow && (
                    <Badge
                      variant="outline"
                      className="text-[10px] px-1 py-0 bg-amber-100 text-amber-900 border-amber-200"
                    >
                      Due out today
                    </Badge>
                  )}
                </div>
                <div className="text-xs text-muted-foreground max-md:hidden">
                  {booking.guests?.phone}
                </div>
                <MobileTableSubdetail>
                  <div>
                    {booking.is_bulk
                      ? `${booking.room_count} rooms`
                      : `Rm ${booking.rooms?.room_number ?? "—"} · ${booking.rooms?.room_type ?? ""}`}
                  </div>
                  <div>
                    {formatShortStayDates(booking.check_in, booking.check_out)}
                  </div>
                  {isReservationRow && (
                    <div className="text-violet-700">Reservation</div>
                  )}
                  {isDueOutRow && (
                    <div className="text-amber-800">Due out today</div>
                  )}
                </MobileTableSubdetail>
              </div>
              );
            },
          },
          {
            key: "room",
            label: "Room",
            responsive: "md+",
            render: (booking) => (
              <div>
                <div className="font-medium max-md:text-[13px]">
                  {booking.is_bulk
                    ? `${booking.room_count} Rooms`
                    : `Room ${booking.rooms?.room_number}`}
                </div>
                {booking.rooms?.room_type && !booking.is_bulk && (
                  <div className="text-xs text-muted-foreground">
                    {booking.rooms.room_type}
                  </div>
                )}
              </div>
            ),
          },
          {
            key: "check_in",
            label: "Check-in",
            responsive: "md+",
            render: (booking) => (
              <div className="text-sm max-md:text-xs">
                {new Date(booking.check_in).toLocaleDateString("en-GB", {
                  day: "2-digit",
                  month: "short",
                })}
              </div>
            ),
          },
          {
            key: "check_out",
            label: "Check-out",
            responsive: "md+",
            render: (booking) => {
              const today = new Date().toISOString().split("T")[0];
              const coYmd =
                typeof booking.check_out === "string"
                  ? booking.check_out.split("T")[0].slice(0, 10)
                  : "";
              const pastCut =
                booking.status === "checked_in" &&
                isPastCheckoutCutoff(
                  { check_out: booking.check_out },
                  orgCheckoutTime,
                );
              const isOverdue =
                booking.status === "checked_in" &&
                (coYmd < today || (coYmd === today && pastCut));
              const isDueTodayBeforeCutoff =
                booking.status === "checked_in" && coYmd === today && !pastCut;
              return (
                <div className="text-sm space-y-1 max-md:text-xs">
                  <span>
                    {new Date(booking.check_out).toLocaleDateString("en-GB", {
                      day: "2-digit",
                      month: "short",
                    })}
                  </span>
                  {isDueTodayBeforeCutoff && (
                    <Badge
                      variant="outline"
                      className="text-[10px] px-1 py-0 bg-amber-50 text-amber-700 border-amber-200 block w-fit"
                    >
                      Due today
                    </Badge>
                  )}
                  {isOverdue && (
                    <Badge
                      variant="outline"
                      className="text-[10px] px-1 py-0 bg-red-50 text-red-600 border-red-200 block w-fit"
                    >
                      Overdue
                    </Badge>
                  )}
                </div>
              );
            },
          },
          {
            key: "payment_status",
            label: "Payment",
            responsive: "md+",
            render: (booking) => {
              const { badgeClass, badgeText, owedLine, paidLine, creditLine } =
                paymentCellForBooking(booking);
              return (
                <div className={TABLE_STACKED_CELL}>
                  <Badge
                    variant="outline"
                    className={`${badgeClass} max-md:text-[10px] shrink-0`}
                  >
                    {badgeText}
                  </Badge>
                  {paidLine !== null && (
                    <span className={`${TABLE_META_TEXT} tabular-nums`}>
                      {formatNaira(paidLine)}
                    </span>
                  )}
                  {owedLine !== null && (
                    <span className={`${TABLE_META_TEXT} tabular-nums`}>
                      Bal {formatNaira(owedLine)}
                    </span>
                  )}
                  {creditLine !== null && creditLine > 0 && (
                    <span className={`${TABLE_META_TEXT} tabular-nums`}>
                      Cr {formatNaira(creditLine)}
                    </span>
                  )}
                </div>
              );
            },
          },
          {
            key: "payment_method",
            label: "Method",
            responsive: "md+",
            render: (booking) => {
              const methodLabel = formatBookingPaymentMethodLabel(
                booking.payment_method,
              );
              const accountLabel =
                booking.payment_method === "city_ledger"
                  ? booking.ledger_account_name
                  : paymentMethodRequiresAccount(booking.payment_method)
                    ? booking.payment_account_label
                    : "";
              return (
                <div
                  className={TABLE_STACKED_CELL}
                  title={[methodLabel, accountLabel].filter(Boolean).join(" · ")}
                >
                  <Badge
                    variant="outline"
                    className="text-[10px] capitalize max-md:text-[10px] shrink-0"
                  >
                    {methodLabel}
                  </Badge>
                  {accountLabel ? (
                    <span
                      className={`${TABLE_META_TEXT} ${TABLE_CELL_TRUNCATE} max-w-[7rem]`}
                      title={accountLabel}
                    >
                      {accountLabel}
                    </span>
                  ) : null}
                </div>
              );
            },
          },
          {
            key: "actions",
            label: "Actions",
            stickyOnMobile: true,
            render: (booking) => {
              const showReserveRow =
                !booking.is_bulk &&
                booking.status === "reserved" &&
                (canCheckInReserved || canCancelReservation);

              if (!canManageFolio && !booking.is_bulk && !showReserveRow)
                return null;

              if (booking.is_bulk) {
                if (!canManageFolio) return null;
                const members = booking.bulk_members || [];
                const showBulkCheckout = members.some((m) =>
                  manualCheckoutEligible(
                    {
                      status: m.status,
                      check_in: m.check_in,
                      check_out: m.check_out,
                      folio_status: m.folio_status,
                    },
                    orgCheckoutTime,
                  ),
                );
                const actionableMember = members.find(
                  (m) =>
                    m.room_id &&
                    !hideChargeExtendInBookingsTable(
                      {
                        status: m.status,
                        check_in: m.check_in,
                        check_out: m.check_out,
                        folio_status: m.folio_status,
                      },
                      orgCheckoutTime,
                    ),
                );
                const gid = booking.bulk_group_id || "";
                if (!showBulkCheckout && !actionableMember) {
                  return (
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 px-2 text-[11px]"
                      onClick={(e) => {
                        e.stopPropagation();
                        router.push(`/bulk-bookings/${gid}`);
                      }}
                    >
                      Open group
                    </Button>
                  );
                }
                return (
                  <div
                    className={TABLE_ACTIONS_ROW}
                    onClick={(e) => e.stopPropagation()}
                  >
                    {actionableMember && (
                      <>
                        <Button
                          size="sm"
                          variant="outline"
                          title="Add charge to a room in this group"
                          className="h-7 px-2 text-[11px] leading-tight whitespace-nowrap"
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedBooking({
                              id: actionableMember.id,
                              folioId: actionableMember.folio_id,
                              guestName: actionableMember.guests?.name,
                              guestId: actionableMember.guest_id,
                              room: `Room ${actionableMember.rooms?.room_number}`,
                              currentCheckOut: actionableMember.check_out,
                              ratePerNight: actionableMember.rate_per_night,
                              organization_id: actionableMember.organization_id,
                              created_by: actionableMember.created_by,
                            });
                            setAddChargeModalOpen(true);
                          }}
                        >
                          Charge
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          title="Extend stay for a room in this group"
                          className="h-7 px-2 text-[11px] leading-tight whitespace-nowrap"
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedBooking({
                              id: actionableMember.id,
                              folioId: actionableMember.folio_id,
                              guestName: actionableMember.guests?.name,
                              guestId: actionableMember.guest_id,
                              room: `Room ${actionableMember.rooms?.room_number}`,
                              currentCheckOut: actionableMember.check_out,
                              check_in: actionableMember.check_in,
                              ratePerNight: actionableMember.rate_per_night,
                              organization_id: actionableMember.organization_id,
                              created_by: actionableMember.created_by,
                              status: actionableMember.status,
                              folio_status: actionableMember.folio_status,
                            });
                            setExtendModalOpen(true);
                          }}
                        >
                          Extend Stay
                        </Button>
                      </>
                    )}
                    {showBulkCheckout && (
                      <Button
                        size="sm"
                        variant="outline"
                        title="Check out all eligible rooms in this group"
                        className="h-7 px-2 text-[11px] leading-tight text-amber-700 border-amber-200 hover:bg-amber-50"
                        disabled={checkoutLoadingGroupId === gid}
                        onClick={(e) => {
                          e.stopPropagation();
                          handleBulkCheckoutFromTable(booking);
                        }}
                      >
                        {checkoutLoadingGroupId === gid ? (
                          <Loader2 className="h-3 w-3 animate-spin" />
                        ) : (
                          <>
                            <LogOut className="mr-1 h-3 w-3" />
                            Out
                          </>
                        )}
                      </Button>
                    )}
                    <Button
                      size="sm"
                      variant="ghost"
                      title="Open bulk group — extend/charge each room"
                      className="h-7 px-2 text-[11px]"
                      onClick={(e) => {
                        e.stopPropagation();
                        router.push(`/bulk-bookings/${gid}`);
                      }}
                    >
                      Group
                    </Button>
                  </div>
                );
              }

              const hideChargeExtend = hideChargeExtendInBookingsTable(
                {
                  check_out: booking.check_out,
                  status: booking.status,
                  check_in: booking.check_in,
                  folio_status: booking.folio_status,
                },
                orgCheckoutTime,
              );

              return (
                <div
                  className={TABLE_ACTIONS_ROW}
                  onClick={(e) => e.stopPropagation()}
                >
                  {showReserveRow && canCheckInReserved && (
                    <Button
                      size="sm"
                      variant="outline"
                      title="Check in — pick room when guest arrives"
                      className="h-7 px-2 text-[11px] leading-tight whitespace-nowrap text-green-700 border-green-200 hover:bg-green-50"
                      onClick={(e) => {
                        e.stopPropagation();
                        openReserveCheckIn(booking);
                      }}
                    >
                      <DoorOpen
                        className="mr-1 h-3 w-3 shrink-0 inline"
                        aria-hidden
                      />
                      Check in
                    </Button>
                  )}
                  {showReserveRow && canCancelReservation && (
                    <Button
                      size="sm"
                      variant="outline"
                      title="Cancel reservation"
                      className="h-7 px-2 text-[11px] leading-tight whitespace-nowrap border-destructive/40 text-destructive hover:bg-destructive/10"
                      disabled={cancelReserveLoadingId === booking.id}
                      onClick={(e) => {
                        e.stopPropagation();
                        handleCancelReserveFromTable(booking);
                      }}
                    >
                      Cancel
                    </Button>
                  )}

                  {canManageFolio && booking.room_id ? (
                    <>
                      {!hideChargeExtend && (
                        <>
                          <Button
                            size="sm"
                            variant="outline"
                            title="Add folio charge"
                            className="h-7 px-2 text-[11px] leading-tight whitespace-nowrap"
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedBooking({
                                id: booking.id,
                                folioId: booking.folio_id,
                                guestName: booking.guests?.name,
                                guestId: booking.guest_id,
                                room: `Room ${booking.rooms?.room_number}`,
                                currentCheckOut: booking.check_out,
                                ratePerNight: booking.rate_per_night,
                                organization_id: booking.organization_id,
                                created_by: booking.created_by,
                              });
                              setAddChargeModalOpen(true);
                            }}
                          >
                            Charge
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            title="Extend stay"
                            className="h-7 px-2 text-[11px] leading-tight whitespace-nowrap"
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedBooking({
                                id: booking.id,
                                folioId: booking.folio_id,
                                guestName: booking.guests?.name,
                                guestId: booking.guest_id,
                                room: `Room ${booking.rooms?.room_number}`,
                                currentCheckOut: booking.check_out,
                                check_in: booking.check_in,
                                ratePerNight: booking.rate_per_night,
                                organization_id: booking.organization_id,
                                created_by: booking.created_by,
                                status: booking.status,
                                folio_status: booking.folio_status,
                              });
                              setExtendModalOpen(true);
                            }}
                          >
                            Extend Stay
                          </Button>
                        </>
                      )}
                      {!manualCheckoutEligible(
                        {
                          status: booking.status,
                          check_in: booking.check_in,
                          check_out: booking.check_out,
                          folio_status: booking.folio_status,
                        },
                        orgCheckoutTime,
                      ) ? null : (
                        <Button
                          size="sm"
                          variant="outline"
                          title="Check out guest"
                          className="h-7 px-2 text-[11px] leading-tight text-amber-700 border-amber-200 hover:bg-amber-50 whitespace-nowrap"
                          disabled={checkoutLoadingId === booking.id}
                          onClick={(e) => {
                            e.stopPropagation();
                            handleCheckoutFromTable(booking);
                          }}
                        >
                          {checkoutLoadingId === booking.id ? (
                            <Loader2 className="h-3 w-3 animate-spin" />
                          ) : (
                            <>
                              <LogOut className="mr-1 h-3 w-3" />
                              Out
                            </>
                          )}
                        </Button>
                      )}
                    </>
                  ) : null}
                </div>
              );
            },
          },
          {
            key: "created_by_name",
            label: "Created By",
            responsive: "lg+",
            render: (booking) => (
              <div className="text-sm text-muted-foreground">
                {booking.created_by_name}
              </div>
            ),
          },
        ]}
        renderCard={(booking) => (
          <CardContent className="p-4">
            <div className="space-y-3">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="font-semibold truncate">{booking.guests?.name}</div>
                  <div className="text-sm text-muted-foreground">
                    {booking.guests?.phone}
                  </div>
                  <div className="text-xs font-mono text-primary mt-1">
                    {booking.is_bulk
                      ? `Bulk · ${booking.room_count} rooms`
                      : booking.folio_id}
                  </div>
                </div>
                <Badge
                  variant="outline"
                  className={statusColors[booking.status]}
                >
                  {booking.status.replace("_", " ")}
                </Badge>
              </div>
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div>
                  <div className="text-muted-foreground">Room</div>
                  <div className="font-medium">
                    {booking.is_bulk
                      ? `${booking.room_count} Rooms`
                      : `${booking.rooms?.room_number ?? "—"} - ${booking.rooms?.room_type ?? ""}`}
                  </div>
                </div>
                <div>
                  <div className="text-muted-foreground">Nights</div>
                  <div className="font-medium">
                    {calculateNights(booking.check_in, booking.check_out)}
                  </div>
                </div>
                <div>
                  <div className="text-muted-foreground">Check-in</div>
                  <div className="font-medium">
                    {new Date(booking.check_in).toLocaleDateString("en-GB")}
                  </div>
                </div>
                <div>
                  <div className="text-muted-foreground">Payment</div>
                  <div className="space-y-1">
                    {(() => {
                      const { badgeClass, badgeText, owedLine, paidLine, creditLine } =
                        paymentCellForBooking(booking);
                      return (
                        <>
                          <Badge variant="outline" className={badgeClass}>
                            {badgeText}
                          </Badge>
                          {paidLine !== null && (
                            <div className="text-xs text-muted-foreground">
                              Paid: {formatNaira(paidLine)}
                            </div>
                          )}
                          {owedLine !== null && (
                            <div className="text-xs text-muted-foreground">
                              Bal: {formatNaira(owedLine)}
                            </div>
                          )}
                          {creditLine !== null && creditLine > 0 && (
                            <div className="text-xs text-muted-foreground">
                              Credit: {formatNaira(creditLine)}
                            </div>
                          )}
                        </>
                      );
                    })()}
                  </div>
                </div>
              </div>
              {(() => {
                const owed = Math.max(0, Number(booking.balance ?? 0));
                return (
                  <>
                    {owed > 0 && (
                      <div className="pt-2 border-t text-sm">
                        <span className="text-muted-foreground">Balance:</span>{" "}
                        <span className="font-semibold text-destructive">
                          {formatNaira(owed)}
                        </span>
                      </div>
                    )}
                  </>
                );
              })()}
              <div className="pt-1 text-xs font-medium text-primary">
                Open booking details →
              </div>
            </div>
          </CardContent>
        )}
        itemsPerPage={15}
      />
    </div>
  );
}
