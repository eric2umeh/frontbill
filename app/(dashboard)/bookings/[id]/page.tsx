"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter, useParams } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  ArrowLeft,
  CreditCard,
  Trash2,
  Edit,
  Plus,
  Clock,
  AlertCircle,
  Loader2,
  LogOut,
  Receipt,
  DoorOpen,
  CalendarRange,
} from "lucide-react";
import { formatNaira } from "@/lib/utils/currency";
import { toast } from "sonner";
import { ExtendStayModal } from "@/components/bookings/extend-stay-modal";
import { CheckoutConfirmDialog } from "@/components/bookings/checkout-confirm-dialog";
import { EditBookingModal } from "@/components/bookings/edit-booking-modal";
import { RoomChangeRequestModal } from "@/components/bookings/room-change-request-modal";
import { RescheduleStayModal } from "@/components/bookings/reschedule-stay-modal";
import { FolioAttachmentsPanel } from "@/components/folio/folio-attachments-panel";
import {
  canRequestRescheduleStay,
  canRescheduleStayBooking,
} from "@/lib/booking/can-reschedule-stay";
import {
  PaymentReceiptDialog,
  type PaymentReceiptChargeRow,
} from "@/components/receipts/payment-receipt-dialog";
import type { PaymentReceiptBranding } from "@/lib/receipts/receipt-format";
import { canPrintPaymentReceipt } from "@/lib/receipts/can-print-payment-receipt";
import {
  buildFolioContextLinesForReceipt,
  filterPaymentLedgerTransactions,
  folioRowEligibleForPaymentReceipt,
  transactionToReceiptChargeRow,
  type PaymentLedgerReceiptRow,
} from "@/lib/receipts/booking-receipt-utils";
import { canAdministerBookingRecord } from "@/lib/booking/can-administer-booking-record";
import { createClient } from "@/lib/supabase/client";
import { reconcileRoomStatusesClient } from "@/lib/rooms/reconcile-room-status-client";
import { useAuth } from "@/lib/auth-context";
import { canonicalRoleKey, hasPermission } from "@/lib/permissions";
import { getUserDisplayName } from "@/lib/utils/user-display";
import { fetchUserDisplayNameMap } from "@/lib/utils/fetch-user-display-names";
import {
  manualCheckoutEligible,
  resolvedCheckoutDateForClosing,
  DEFAULT_ORG_CHECKOUT_TIME,
  folioGuestActionsLocked,
  formatCheckoutTimeLabel,
  parseCheckoutTimeHM,
  localTodayYmd,
  isBookingCheckedOut,
  isPastCheckoutCutoff,
  normalizeBookingCheckoutYmd,
} from "@/lib/utils/booking-checkout-ui";
import {
  bookingDisplayBillBalance,
  shouldReconcileBookingPaymentPaid,
  folioGuestCreditAmount,
} from "@/lib/utils/booking-bill-balance";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { PageLoadingState } from "@/components/loading-screen";
import { fetchOrgCheckoutTime } from "@/lib/utils/org-checkout-policy";
import {
  fetchGuestCityLedgerAccount,
  applyBookingPaymentToGuestLedger,
  applyPaymentToGuestCityLedger,
  recordGuestLedgerCashMovement,
} from "@/lib/utils/guest-city-ledger";
import { isOutletFolioDescription } from "@/lib/outlets/booking-folio";

function isFolioAdditionalChargeRow(c: {
  type?: string;
  charge_type?: string;
}): boolean {
  const ctype = String(c.type ?? c.charge_type ?? "").toLowerCase();
  return (
    ctype !== "payment" &&
    ctype !== "room_charge" &&
    ctype !== "reservation" &&
    ctype !== "folio_note"
  );
}

export default function BookingDetailPage({
  params: _params,
}: {
  params: Promise<{ id: string }> | { id: string };
}) {
  const router = useRouter();
  const { role, userId, name: authUserName } = useAuth();
  const canAdminBooking = canAdministerBookingRecord(role);
  const roleKey = canonicalRoleKey(role);
  const canManageFolio =
    roleKey === "superadmin" || roleKey === "admin" || roleKey === "front_desk";
  const canPrintReceipt = canPrintPaymentReceipt(role);
  const canRequestRoomChange =
    hasPermission(role, "room_change:request") ||
    roleKey === "front_desk" ||
    roleKey === "receptionist";
  const [booking, setBooking] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [bookingId, setBookingId] = useState<string>("");
  const [folioChargeModalOpen, setFolioChargeModalOpen] = useState(false);
  const [paymentCreditModalOpen, setPaymentCreditModalOpen] = useState(false);
  const [paymentCreditTab, setPaymentCreditTab] = useState<
    "payment" | "credit"
  >("payment");
  const [applyOverpaymentAsCredit, setApplyOverpaymentAsCredit] =
    useState(false);
  const [bookingLedgerSnapshot, setBookingLedgerSnapshot] = useState<{
    id: string | null;
    balance: number;
  }>({
    id: null,
    balance: 0,
  });
  const [creditAmount, setCreditAmount] = useState("");
  const [creditPaymentMethod, setCreditPaymentMethod] = useState("");
  const [creditNotes, setCreditNotes] = useState("");
  const [extendStayModalOpen, setExtendStayModalOpen] = useState(false);
  const [rescheduleStayOpen, setRescheduleStayOpen] = useState(false);
  const [rescheduleStayPending, setRescheduleStayPending] = useState(false);
  const [chargeAmount, setChargeAmount] = useState("");
  const [chargeDescription, setChargeDescription] = useState("");
  const [chargePaymentMethod, setChargePaymentMethod] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("");
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [deleteBookingDialogOpen, setDeleteBookingDialogOpen] = useState(false);
  const [deleteChargeTarget, setDeleteChargeTarget] = useState<{
    chargeId: string;
    chargeAmount: number;
  } | null>(null);
  const [folioCharges, setFolioCharges] = useState<any[]>([]);
  const [createdByUser, setCreatedByUser] = useState<any>(null);
  const [updatedByUser, setUpdatedByUser] = useState<any>(null);
  // Edit charge state
  const [editChargeModalOpen, setEditChargeModalOpen] = useState(false);
  const [editingCharge, setEditingCharge] = useState<any>(null);
  const [editChargeAmount, setEditChargeAmount] = useState("");
  const [editChargeDescription, setEditChargeDescription] = useState("");
  const [editChargeLoading, setEditChargeLoading] = useState(false);
  const [addChargeLoading, setAddChargeLoading] = useState(false);
  const [checkoutLoading, setCheckoutLoading] = useState(false);
  const [orgCheckoutTime, setOrgCheckoutTime] = useState(
    DEFAULT_ORG_CHECKOUT_TIME,
  );
  const [checkoutConfirmOpen, setCheckoutConfirmOpen] = useState(false);
  const [roomChangeModalOpen, setRoomChangeModalOpen] = useState(false);
  const [roomChangePending, setRoomChangePending] = useState(false);
  const [editBookingOpen, setEditBookingOpen] = useState(false);
  const [receiptOrg, setReceiptOrg] = useState<PaymentReceiptBranding | null>(
    null,
  );
  const [receiptCharge, setReceiptCharge] =
    useState<PaymentReceiptChargeRow | null>(null);
  const [receiptFolioContextLines, setReceiptFolioContextLines] = useState<
    string[] | null
  >(null);
  const [paymentLedgerRows, setPaymentLedgerRows] = useState<
    PaymentLedgerReceiptRow[]
  >([]);

  const routeParams = useParams();
  const routeBookingId =
    typeof routeParams?.id === "string" ? routeParams.id : "";
  const userIdRef = useRef(userId);
  useEffect(() => {
    userIdRef.current = userId;
  }, [userId]);

  useEffect(() => {
    if (!routeBookingId) return;
    setBookingId(routeBookingId);
    setRoomChangePending(false);
    setLoading(true);
    setBooking(null);
    void fetchBookingDetails(routeBookingId);
    // Re-run when `userId` becomes available so room-change + display-name fetches use auth.
  }, [routeBookingId, userId]);

  const fetchBookingDetails = async (id: string) => {
    const uid = userIdRef.current;
    try {
      const supabase = createClient();
      
      // Fetch booking with related data
      let { data: bookingData, error: bookingError } = await supabase
        .from("bookings")
        .select(
          `
          *,
          guests(name, phone, email, address, balance),
          rooms(id, room_number, room_type, price_per_night),
          organizations(name, address, phone, email)
        `,
        )
        .eq("id", id)
        .single();

      if (bookingError) throw bookingError;
      if (!bookingData) throw new Error("Booking not found");

      const nestedOrgRaw = bookingData.organizations as unknown;
      const nestedOrg =
        nestedOrgRaw &&
        typeof nestedOrgRaw === "object" &&
        !Array.isArray(nestedOrgRaw)
          ? (nestedOrgRaw as {
              name?: string | null;
              address?: string | null;
              phone?: string | null;
              email?: string | null;
            })
          : null;

      let orgRow: {
        name?: string | null;
        address?: string | null;
        phone?: string | null;
        email?: string | null;
      } | null = null;

      let checkoutTime = DEFAULT_ORG_CHECKOUT_TIME;
      if (bookingData.organization_id) {
        const { data, error } = await supabase
          .from("organizations")
          .select("name, address, phone, email")
          .eq("id", bookingData.organization_id)
          .maybeSingle();
        if (!error) {
          orgRow = data ?? null;
        }
        checkoutTime = await fetchOrgCheckoutTime(
          supabase,
          bookingData.organization_id,
        );
      }
      setOrgCheckoutTime(checkoutTime);

      const hotelName = String(orgRow?.name ?? nestedOrg?.name ?? "").trim();
      const hasOrgReceiptContext = !!(
        orgRow ||
        nestedOrg ||
        bookingData.organization_id
      );
      const setBranding: PaymentReceiptBranding | null = hasOrgReceiptContext
        ? {
            hotelName,
            address: String(orgRow?.address ?? nestedOrg?.address ?? ""),
            phone: String(orgRow?.phone ?? nestedOrg?.phone ?? ""),
            email: String(orgRow?.email ?? nestedOrg?.email ?? ""),
          }
        : null;
      setReceiptOrg(setBranding);

      if (uid && uid !== "placeholder") {
        try {
          const rb = await fetch(
            `/api/bookings/${encodeURIComponent(id)}/receipt-branding?caller_id=${encodeURIComponent(uid)}`,
            { credentials: "include" },
          );
          if (rb.ok) {
            const j = (await rb.json()) as {
              hotelName?: string;
              address?: string;
              phone?: string;
              email?: string;
            };
            const hn = String(j.hotelName ?? "").trim();
            setReceiptOrg({
              hotelName: hn,
              address: String(j.address ?? ""),
              phone: String(j.phone ?? ""),
              email: String(j.email ?? ""),
            });
          }
        } catch {
          /* keep client-derived branding */
        }
      }

      const bookingUserIds = [
        bookingData.created_by,
        bookingData.updated_by,
      ].filter(Boolean);
      const bookingUserMap = await fetchUserDisplayNameMap(bookingUserIds, uid);
      if (bookingData.created_by) {
        setCreatedByUser({
          id: bookingData.created_by,
          full_name: bookingUserMap[bookingData.created_by],
        });
      }
      if (bookingData.updated_by) {
        setUpdatedByUser({
          id: bookingData.updated_by,
          full_name: bookingUserMap[bookingData.updated_by],
        });
      }

      if (uid && uid !== "placeholder") {
        try {
          await fetch(
            `/api/bookings/${encodeURIComponent(id)}/sync-outlet-folio`,
            {
              method: "POST",
              credentials: "include",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ caller_id: uid }),
            },
          );
        } catch {
          /* non-fatal — folio may still load */
        }
      }

      // Fetch folio charges from database
      const { data: chargesData, error: chargesError } = await supabase
        .from("folio_charges")
        .select("*")
        .eq("booking_id", id)
        .order("created_at", { ascending: true });

      if (chargesError) throw chargesError;

      // Fetch creator info for each charge
      const chargeCreatorIds = chargesData
        .map((charge: any) => charge.created_by)
        .filter(Boolean);
      const chargeCreatorMap = await fetchUserDisplayNameMap(
        chargeCreatorIds,
        uid,
      );
      const chargesWithCreator = chargesData.map((charge: any) => {
        const creatorName = charge.created_by
          ? chargeCreatorMap[charge.created_by] ||
            getUserDisplayName(null, charge.created_by)
          : "System";
        
        return {
          id: charge.id,
          date: charge.created_at?.split("T")[0],
          timestamp: charge.created_at,
          description: charge.description,
          amount: charge.amount,
          type: charge.charge_type,
          createdBy: creatorName,
          paymentStatus: charge.payment_status,
          paymentMethod: charge.payment_method,
        };
      });

      setFolioCharges(chargesWithCreator);

      const { data: txRows } = await supabase
        .from("transactions")
        .select(
          "id, created_at, amount, payment_method, description, received_by, transaction_id, status",
        )
        .eq("booking_id", id)
        .order("created_at", { ascending: false });

      const payLedgerRaw = filterPaymentLedgerTransactions(txRows || []);

      const receiverIds = [
        ...new Set(
          payLedgerRaw
            .map((t: { received_by?: string | null }) => t.received_by)
            .filter(Boolean),
        ),
      ] as string[];
      const receiverMap = receiverIds.length
        ? await fetchUserDisplayNameMap(receiverIds, uid)
        : {};
      const ledgerRows: PaymentLedgerReceiptRow[] = payLedgerRaw.map(
        (t: any) => ({
          id: t.id,
          created_at: t.created_at,
          amount: Number(t.amount) || 0,
          payment_method: t.payment_method ?? null,
          description: t.description ?? null,
          transaction_id: t.transaction_id ?? null,
          receivedByLabel: t.received_by
            ? receiverMap[t.received_by] ||
              getUserDisplayName(null, t.received_by)
            : "Staff",
        }),
      );
      setPaymentLedgerRows(ledgerRows);

      if (shouldReconcileBookingPaymentPaid(bookingData, chargesWithCreator)) {
        const { error: psFixErr } = await supabase
          .from("bookings")
          .update({ payment_status: "paid" })
          .eq("id", id);
        if (!psFixErr) {
          bookingData = { ...bookingData, payment_status: "paid" };
        }
      }

      setBooking(bookingData);

      if (uid) {
        try {
          const [rcRes, rsRes] = await Promise.all([
            fetch(`/api/room-change-requests?caller_id=${uid}&booking_id=${id}`, {
              credentials: "include",
            }),
            fetch(`/api/reschedule-stay-requests?caller_id=${uid}&booking_id=${id}`, {
              credentials: "include",
            }),
          ]);
          const rcJson = await rcRes.json();
          const rsJson = await rsRes.json();
          if (rcRes.ok) {
            setRoomChangePending(
              (rcJson.requests || []).some(
                (r: { status?: string }) =>
                  String(r.status || "").toLowerCase() === "pending",
              ),
            );
          } else {
            setRoomChangePending(false);
          }
          if (rsRes.ok) {
            setRescheduleStayPending(
              (rsJson.requests || []).some(
                (r: { status?: string }) =>
                  String(r.status || "").toLowerCase() === "pending",
              ),
            );
          } else {
            setRescheduleStayPending(false);
          }
        } catch {
          setRoomChangePending(false);
          setRescheduleStayPending(false);
        }
      } else {
        setRoomChangePending(false);
      }

      // Note: booking.balance is maintained by handlers (add-charge, extend-stay, record-payment)
      // If the folio implies nothing owed but `payment_status` was stale (e.g. after auto-checkout + settle),
      // we reconcile to `paid` above.

      setLoading(false);
  } catch (error: any) {
    // Check if it's an auth error
      if (error?.status === 401 || error?.code === "PGRST") {
        toast.error("Session expired. Please log in again.");
        router.push("/login");
        return;
      }

      toast.error(error.message || "Failed to fetch booking details");
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!bookingId || loading || !booking) return;
    if (isBookingCheckedOut(booking)) return;
    const iv = window.setInterval(() => {
      fetchBookingDetails(bookingId);
    }, 60_000);
    return () => window.clearInterval(iv);
  }, [bookingId, loading, booking?.status, booking?.folio_status]);

  useEffect(() => {
    if (!bookingId || !userId) return;
    const st = String(booking?.status ?? "")
      .trim()
      .toLowerCase()
      .replace(/[\s-]+/g, "_");
    if (st !== "checked_in") {
      if (booking) setRoomChangePending(false);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const pr = await fetch(
          `/api/room-change-requests?caller_id=${userId}&booking_id=${bookingId}`,
          { credentials: "include" },
        );
        const pj = await pr.json();
        if (cancelled) return;
        if (!pr.ok) {
          setRoomChangePending(false);
          return;
        }
        setRoomChangePending(
          (pj.requests || []).some(
            (r: { status?: string }) =>
              String(r.status || "").toLowerCase() === "pending",
          ),
        );
      } catch {
        if (!cancelled) setRoomChangePending(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [bookingId, userId, booking?.status, booking?.id]);

  useEffect(() => {
    if (!editBookingOpen || loading || !booking) return;
    if (
      folioGuestActionsLocked(
        {
          status: booking.status,
          check_in: booking.check_in,
          check_out: booking.check_out,
          folio_status: booking.folio_status,
        },
        orgCheckoutTime,
      )
    ) {
      setEditBookingOpen(false);
    }
  }, [editBookingOpen, loading, booking, orgCheckoutTime]);

  useEffect(() => {
    if (!paymentCreditModalOpen || !booking?.organization_id) return;
    const guestName = (booking.guests?.name || "").trim();
    if (!guestName) return;
    (async () => {
      const supabase = createClient();
      const row = await fetchGuestCityLedgerAccount(
        supabase,
        booking.organization_id,
        guestName,
      );
      setBookingLedgerSnapshot({
        id: row?.id ?? null,
        balance: Number(row?.balance) || 0,
      });
    })();
  }, [paymentCreditModalOpen, booking?.organization_id, booking?.guests?.name]);

  const assertFolioEditable = () => {
    if (!booking) return false;
    if (
      folioGuestActionsLocked(
        {
          status: booking.status,
          check_in: booking.check_in,
          check_out: booking.check_out,
          folio_status: booking.folio_status,
        },
        orgCheckoutTime,
      )
    ) {
      toast.error(
        "This folio is checked out — room charges cannot be added or edited here.",
      );
      return false;
    }
    return true;
  };

  const handleFolioCharge = async () => {
    if (addChargeLoading) return;
    if (!chargeAmount || Number(chargeAmount) <= 0) {
      toast.error("Please enter a valid amount");
      return;
    }
    if (!chargeDescription) {
      toast.error("Please enter a description");
      return;
    }
    if (!assertFolioEditable()) return;

    setAddChargeLoading(true);
    try {
      const supabase = createClient();
      const isPaidNow =
        chargePaymentMethod !== "" &&
        chargePaymentMethod !== "city_ledger" &&
        chargePaymentMethod !== "deferred";
      const paymentStatus = isPaidNow ? "paid" : "pending";

      const { error: chargeInsertError } = await supabase
        .from("folio_charges")
        .insert([
          {
          booking_id: bookingId,
          description: chargeDescription,
          amount: Number(chargeAmount),
            charge_type: "charge",
          payment_method: isPaidNow ? chargePaymentMethod : null,
          payment_status: paymentStatus,
          },
        ]);
      if (chargeInsertError) throw chargeInsertError;

        try {
        await supabase.from("transactions").insert([
          {
            organization_id: booking!.organization_id || null,
            booking_id: bookingId,
            transaction_id: `CHG-${bookingId}-${Date.now()}`,
            guest_name: booking!.guests?.name || booking!.guestName || "Guest",
            room: booking!.rooms?.room_number || null,
            amount: Number(chargeAmount),
            payment_method: chargePaymentMethod || "pending",
            status: paymentStatus,
            description: chargeDescription,
            received_by: userId,
          },
        ]);
      } catch (_) {
        /* non-fatal */
      }

        if (!isPaidNow) {
          const { data: freshBk } = await supabase
          .from("bookings")
          .select("balance")
          .eq("id", bookingId)
          .single();
        const newBalance =
          (Number(freshBk?.balance) || 0) + Number(chargeAmount);
          const { error: balUpdateErr } = await supabase
          .from("bookings")
            .update({ balance: newBalance })
          .eq("id", bookingId);
          if (balUpdateErr) {
          toast.error("Failed to update bill balance - please refresh");
          } else {
          setBooking((prev: any) =>
            prev ? { ...prev, balance: newBalance } : prev,
          );
          }

        if (chargePaymentMethod === "city_ledger" && booking!.guest_id) {
          const chargeAmt = Number(chargeAmount);
            const { data: guestRow } = await supabase
            .from("guests")
            .select("balance, name")
            .eq("id", booking!.guest_id)
            .single();
            if (guestRow) {
              await supabase
              .from("guests")
              .update({
                balance: ((guestRow.balance as number) || 0) + chargeAmt,
              })
              .eq("id", booking!.guest_id);
              if (guestRow.name) {
                const { data: existingAcct } = await supabase
                .from("city_ledger_accounts")
                .select("id, balance")
                .eq("organization_id", booking!.organization_id)
                .ilike("account_name", guestRow.name)
                .in("account_type", ["individual", "guest"])
                .maybeSingle();
                if (existingAcct) {
                  await supabase
                  .from("city_ledger_accounts")
                    .update({ balance: (existingAcct.balance || 0) + chargeAmt })
                  .eq("id", existingAcct.id);
                } else {
                await supabase.from("city_ledger_accounts").insert([
                  {
                    organization_id: booking!.organization_id,
                    account_name: guestRow.name,
                    account_type: "individual",
                    balance: chargeAmt,
                  },
                ]);
                }
              }
            }
          }
        } else {
          const { data: freshBk } = await supabase
          .from("bookings")
          .select("deposit")
          .eq("id", bookingId)
          .single();
        const newDeposit =
          (Number(freshBk?.deposit) || 0) + Number(chargeAmount);
          await supabase
          .from("bookings")
            .update({ deposit: newDeposit })
          .eq("id", bookingId);
        setBooking((prev: any) =>
          prev ? { ...prev, deposit: newDeposit } : prev,
        );
        }

        toast.success(
          isPaidNow
          ? `Charge of ${formatNaira(Number(chargeAmount))} recorded as paid (${chargePaymentMethod.replace(/_/g, " ")})`
          : chargePaymentMethod === "city_ledger"
              ? `${formatNaira(Number(chargeAmount))} added to city ledger - Bill Balance updated`
            : `${formatNaira(Number(chargeAmount))} deferred - Bill Balance updated`,
      );

      setFolioChargeModalOpen(false);
      setChargeAmount("");
      setChargeDescription("");
      setChargePaymentMethod("");

      const newChargeEntry = {
        id: `local-${Date.now()}`,
        description: chargeDescription,
        amount: Number(chargeAmount),
        type: "charge",
        chargeType: "charge",
        paymentMethod: chargePaymentMethod,
        paymentStatus:
          chargePaymentMethod === "city_ledger" ||
          chargePaymentMethod === "deferred"
            ? "pending"
            : "paid",
        timestamp: new Date().toISOString(),
        createdBy: "You",
      };
      setFolioCharges((prev: any[]) => [newChargeEntry, ...prev]);
    } catch (error: any) {
      toast.error(error.message || "Failed to save");
    } finally {
      setAddChargeLoading(false);
    }
  };

  const handleRecordPayment = async () => {
    if (addChargeLoading) return;
    if (!chargeAmount || Number(chargeAmount) <= 0) {
      toast.error("Please enter a valid amount");
      return;
    }
        if (!paymentMethod) {
      toast.error("Please select a payment method");
      return;
    }
    if (!canManageFolio || !booking) return;

    const P = Number(chargeAmount);
    setAddChargeLoading(true);
    try {
      const supabase = createClient();
      const { data: freshBk2 } = await supabase
        .from("bookings")
        .select("balance, deposit, total_amount")
        .eq("id", bookingId)
        .single();

      const { data: fcPrior } = await supabase
        .from("folio_charges")
        .select("amount, charge_type, payment_status, payment_method")
        .eq("booking_id", bookingId);

      const fcForBill = (fcPrior || []).map(
        (row: {
          amount?: unknown;
          charge_type?: unknown;
          payment_status?: unknown;
          payment_method?: unknown;
        }) => ({
          amount: row.amount,
          charge_type: row.charge_type,
          payment_status: row.payment_status,
          payment_method: row.payment_method,
        }),
      );

      const billBefore = Math.max(
        0,
        bookingDisplayBillBalance(
          {
            balance: freshBk2?.balance,
            deposit: freshBk2?.deposit,
            total_amount: freshBk2?.total_amount,
          },
          fcForBill,
        ),
      );

      if (P > billBefore && !applyOverpaymentAsCredit) {
        toast.error(
          "This amount is more than the current bill balance. Enable “Paying above bill — apply excess as account credit” or reduce the amount.",
        );
        setAddChargeLoading(false);
        return;
      }

      const paymentEntry: Record<string, unknown> = {
          booking_id: bookingId,
        description: `Payment Received - ${paymentMethod.replace("_", " ")}`,
        amount: -P,
        charge_type: "payment",
          payment_method: paymentMethod,
        payment_status: "paid",
      };
      if (booking.organization_id) {
        paymentEntry.organization_id = booking.organization_id;
      }
      if (userId) {
        paymentEntry.created_by = userId;
      }
      await supabase.from("folio_charges").insert([paymentEntry]);

      const newBalance = Math.max(0, billBefore - P);
      const newDeposit = Number(freshBk2?.deposit || 0) + P;

        await supabase
        .from("bookings")
          .update({
            balance: newBalance,
            deposit: newDeposit,
          payment_status: newBalance === 0 ? "paid" : "partial",
        })
        .eq("id", bookingId);

      // When booking balance clears, settle every outstanding positive folio line (not only payment_status=pending).
      if (newBalance === 0) {
          await supabase
          .from("folio_charges")
          .update({ payment_status: "paid" })
          .eq("booking_id", bookingId)
          .gt("amount", 0)
          .not("charge_type", "eq", "payment");
      }

      const guestId = booking.guest_id || booking.guests?.id;
      const guestName = (booking.guests?.name || "").trim();
        if (guestId) {
          const { data: guestRow } = await supabase
          .from("guests")
          .select("balance")
          .eq("id", guestId)
          .single();
        if (guestRow && (guestRow.balance || 0) > 0) {
          const newGuestBalance = Math.max(0, (guestRow.balance || 0) - P);
            await supabase
            .from("guests")
            .update({ balance: newGuestBalance })
            .eq("id", guestId);
        }
      }

      if (guestName && booking.organization_id) {
        await applyBookingPaymentToGuestLedger(supabase, {
          organizationId: booking.organization_id,
          guestName,
          bookingBillBefore: billBefore,
          paymentAmount: P,
        });
      }

      try {
        await supabase.from("transactions").insert([
          {
            organization_id: booking.organization_id || null,
            booking_id: bookingId,
            transaction_id: `PAY-${bookingId}-${Date.now()}`,
            guest_name: booking.guests?.name || "Guest",
            room: booking.rooms?.room_number || null,
            amount: P,
            payment_method: paymentMethod,
            status: "paid",
            description: `Payment received - ${paymentMethod.replace(/_/g, " ")}`,
            received_by: userId,
          },
        ]);
      } catch (_) {
        /* non-fatal */
      }

      await fetchBookingDetails(bookingId);

      const excess = Math.max(0, P - billBefore);
      const method = paymentMethod;
      toast.success(
        excess > 0
          ? `Payment of ${formatNaira(P)} recorded (${formatNaira(excess)} stored as account credit)`
          : `Payment of ${formatNaira(P)} recorded`,
      );

      setPaymentCreditModalOpen(false);
      setChargeAmount("");
      setPaymentMethod("");
      setApplyOverpaymentAsCredit(false);
    } catch (error: any) {
      toast.error(error.message || "Failed to save");
    } finally {
      setAddChargeLoading(false);
    }
  };

  const handleBookingAddCredit = async () => {
    if (addChargeLoading) return;
    const amt = parseFloat(creditAmount) || 0;
    if (amt <= 0) {
      toast.error("Please enter a valid credit amount");
      return;
    }
    if (!creditPaymentMethod) {
      toast.error("Please select a payment method");
      return;
    }
    if (!booking?.organization_id) return;
    const guestName = (booking.guests?.name || "").trim();
    if (!guestName) {
      toast.error("Guest name is required to post city ledger credit");
      return;
    }
    const guestId = booking.guest_id || booking.guests?.id || null;
    if (!canManageFolio) return;

    setAddChargeLoading(true);
    try {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        toast.error("Session expired");
        return;
      }

      const { data: bk0 } = await supabase
        .from("bookings")
        .select("balance, deposit, total_amount")
        .eq("id", bookingId)
        .single();
      const { data: fcPrior0 } = await supabase
        .from("folio_charges")
        .select("amount, charge_type, payment_status, payment_method")
        .eq("booking_id", bookingId);

      const fcForBillBefore = (fcPrior0 || []).map(
        (row: {
          amount?: unknown;
          charge_type?: unknown;
          payment_status?: unknown;
          payment_method?: unknown;
        }) => ({
          amount: row.amount,
          charge_type: row.charge_type,
          payment_status: row.payment_status,
          payment_method: row.payment_method,
        }),
      );
      const billBefore = Math.max(
        0,
        bookingDisplayBillBalance(
          {
            balance: bk0?.balance,
            deposit: bk0?.deposit,
            total_amount: bk0?.total_amount,
          },
          fcForBillBefore,
        ),
      );
      const appliedToBooking = Math.min(amt, billBefore);

      await recordGuestLedgerCashMovement(supabase, {
        organizationId: booking.organization_id,
        accountName: guestName,
        guestId,
        amount: amt,
        paymentMethod: creditPaymentMethod,
        notes: creditNotes,
        transactionType: "City Ledger Top-Up",
        userId: user.id,
        ledgerAccountId: bookingLedgerSnapshot.id,
        currentLedgerBalance: bookingLedgerSnapshot.balance,
        syncGuestProfile: false,
      });

      await supabase.from("folio_charges").insert([
        {
          booking_id: bookingId,
          organization_id: booking.organization_id,
          description: `Payment Received - ${creditPaymentMethod.replace("_", " ")} (via Add Credit)`,
          amount: -amt,
          charge_type: "payment",
          payment_method: creditPaymentMethod,
          payment_status: "paid",
          created_by: user.id,
        },
      ]);

      if (appliedToBooking > 0) {
        const newBalance = Math.max(0, billBefore - appliedToBooking);
        const newDeposit = Number(bk0?.deposit || 0) + appliedToBooking;
        await supabase
          .from("bookings")
          .update({
            balance: newBalance,
            deposit: newDeposit,
            payment_status: newBalance === 0 ? "paid" : "partial",
          })
          .eq("id", bookingId);
        if (newBalance === 0) {
          await supabase
            .from("folio_charges")
            .update({ payment_status: "paid" })
            .eq("booking_id", bookingId)
            .gt("amount", 0)
            .not("charge_type", "eq", "payment");
        }
      }

      if (guestId) {
        const rowLedgerSync = await fetchGuestCityLedgerAccount(
          supabase,
          booking.organization_id,
          guestName,
        );
        const nbSync = Number(rowLedgerSync?.balance ?? 0);
        await supabase
          .from("guests")
          .update({ balance: Math.max(0, nbSync) })
          .eq("id", guestId);
      }

      const row = await fetchGuestCityLedgerAccount(
        supabase,
        booking.organization_id,
        guestName,
      );
      setBookingLedgerSnapshot({
        id: row?.id ?? null,
        balance: Number(row?.balance) || 0,
      });

      toast.success(
        `Credit of ${formatNaira(amt)} added to ${guestName}'s account`,
      );
      setCreditAmount("");
      setCreditPaymentMethod("");
      setCreditNotes("");
      setPaymentCreditModalOpen(false);
      await fetchBookingDetails(bookingId);
    } catch (error: any) {
      toast.error(error.message || "Failed to add credit");
    } finally {
      setAddChargeLoading(false);
    }
  };

  const handleDeleteCharge = (chargeId: string, chargeAmount: number) => {
    setDeleteChargeTarget({ chargeId, chargeAmount });
  };

  const performDeleteCharge = async () => {
    if (!deleteChargeTarget) return;
    const { chargeId } = deleteChargeTarget;
    try {
      setAddChargeLoading(true);
      const supabase = createClient();

                  const { data: chargeData } = await supabase
        .from("folio_charges")
        .select("payment_status, amount")
        .eq("id", chargeId)
        .single();

                  const { error: deleteError } = await supabase
        .from("folio_charges")
                    .delete()
        .eq("id", chargeId);
      if (deleteError) throw deleteError;

      if (chargeData?.payment_status === "pending") {
        const newBalance = Math.max(
          0,
          (booking?.balance || 0) - Math.abs(Number(chargeData.amount)),
        );
                    await supabase
          .from("bookings")
                      .update({ balance: newBalance })
          .eq("id", bookingId);
                  }
                  
      await fetchBookingDetails(bookingId);
      toast.success("Charge deleted");
      setDeleteChargeTarget(null);
                } catch (error: any) {
      toast.error(error.message || "Failed to delete charge");
    } finally {
      setAddChargeLoading(false);
    }
  };

  const openEditCharge = (charge: any) => {
    setEditingCharge(charge);
    setEditChargeAmount(String(Math.abs(charge.amount)));
    setEditChargeDescription(charge.description);
    setEditChargeModalOpen(true);
  };

  const handleUpdateCharge = async () => {
    if (!editingCharge || !editChargeAmount) {
      toast.error("Please enter an amount");
      return;
    }
    try {
      setEditChargeLoading(true);
      const supabase = createClient();
      // Preserve sign: payments are stored as negative
      const newAmount =
        editingCharge.amount < 0
        ? -Math.abs(Number(editChargeAmount))
          : Math.abs(Number(editChargeAmount));

      const { error } = await supabase
        .from("folio_charges")
        .update({ description: editChargeDescription, amount: newAmount })
        .eq("id", editingCharge.id);

      if (error) throw error;

      // Recalculate booking balance from all charges
      const { data: allCharges } = await supabase
        .from("folio_charges")
        .select("amount, payment_status")
        .eq("booking_id", bookingId);

      const unpaidTotal = (allCharges || [])
        .filter((c: any) => c.payment_status !== "paid")
        .reduce((sum: number, c: any) => sum + Number(c.amount), 0);

      const nextBal = Math.max(0, unpaidTotal);
      const nextPaid = unpaidTotal <= 0;

      await supabase
        .from("bookings")
        .update({
          balance: nextBal,
          payment_status: nextPaid ? "paid" : "partial",
        })
        .eq("id", bookingId);

      toast.success("Charge updated successfully");
      setEditChargeModalOpen(false);
      setEditingCharge(null);
      await fetchBookingDetails(bookingId);
    } catch (error: any) {
      toast.error(error.message || "Failed to update charge");
    } finally {
      setEditChargeLoading(false);
    }
  };

  const handleCheckout = () => setCheckoutConfirmOpen(true);

  const performDeleteBooking = async () => {
    if (!userId) {
      toast.error("You must be signed in to delete a booking");
      return;
    }
    setDeleteLoading(true);
    try {
      const res = await fetch(`/api/bookings/${bookingId}`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ caller_id: userId }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(
          typeof json?.error === "string"
            ? json.error
            : "Failed to delete booking",
        );
      }

      toast.success("Booking deleted");
      setDeleteBookingDialogOpen(false);
      router.push("/bookings");
                } catch (err: any) {
      toast.error(err.message || "Failed to delete booking");
                } finally {
      setDeleteLoading(false);
    }
  };

  const handleDeleteBookingClick = () => setDeleteBookingDialogOpen(true);

  const totalCharges = folioCharges.reduce(
    (sum: number, charge: any) => sum + charge.amount,
    0,
  );

  // Pending (city ledger / deferred / unpaid) folio charges — positive amount, not payment rows
  const pendingAdditionalCharges = folioCharges
    .filter((c: any) => {
      const ctype = c.type || c.charge_type;
      if (
        ctype === "payment" ||
        ctype === "room_charge" ||
        ctype === "reservation"
      )
        return false;
      const status = String(
        c.paymentStatus ?? c.payment_status ?? "",
      ).toLowerCase();
      if (!Number(c.amount) || Number(c.amount) <= 0) return false;
      if (status === "posted_to_ledger") return false;
      const method = String(
        c.paymentMethod ?? c.payment_method ?? "",
      ).toLowerCase();
      return (
        ["pending", "unpaid", "city_ledger"].includes(status) ||
        (method === "city_ledger" && status !== "paid")
      );
    })
    .reduce((sum: number, c: any) => sum + Number(c.amount), 0);

  // Paid additional charges (cash/pos/transfer on the spot) - for folio display only
  const paidAdditionalCharges = folioCharges
    .filter(
      (c: any) =>
        isFolioAdditionalChargeRow(c) &&
        c.paymentStatus === "paid" &&
        Number(c.amount) > 0,
    )
    .reduce((sum: number, c: any) => sum + Number(c.amount), 0);

  const folioBookingCreditAmount = folioGuestCreditAmount(folioCharges);

  // Deposit is bumped whenever a payment is recorded against the folio; summing payment rows too would double-count.
  const totalAmountPaid = Number(booking?.deposit ?? 0);

  if (loading) {
    return <PageLoadingState />;
  }

  if (!booking) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <p>Booking not found</p>
      </div>
    );
  }

  const folioLocked = folioGuestActionsLocked(
    {
      status: booking.status,
      check_in: booking.check_in,
      check_out: booking.check_out,
      folio_status: booking.folio_status,
    },
    orgCheckoutTime,
  );

  const showRescheduleStay =
    canRequestRescheduleStay(role) &&
    !folioLocked &&
    !rescheduleStayPending &&
    canRescheduleStayBooking({
      status: booking.status,
      folio_status: booking.folio_status,
    });

  const roomsRaw = booking.rooms as
    | { id?: string | null }
    | { id?: string | null }[]
    | null
    | undefined;
  let roomIdFromJoin: string | null = null;
  if (Array.isArray(roomsRaw) && roomsRaw.length > 0 && roomsRaw[0]?.id) {
    roomIdFromJoin = String(roomsRaw[0].id);
  } else if (
    roomsRaw &&
    typeof roomsRaw === "object" &&
    !Array.isArray(roomsRaw) &&
    roomsRaw.id
  ) {
    roomIdFromJoin = String(roomsRaw.id);
  }
  const effectiveRoomId =
    (booking.room_id ? String(booking.room_id) : null) ||
    roomIdFromJoin ||
    null;

  /** Room change: API allows reserved / confirmed / checked-in; block only locked folio, missing room, or duplicate pending. */
  let roomChangeDisabledReason = "";
  if (folioLocked) {
    roomChangeDisabledReason =
      "Guest folio is locked for this action (for example after checkout).";
  } else if (!effectiveRoomId) {
    roomChangeDisabledReason =
      "Assign a room on this booking before requesting a move.";
  } else if (roomChangePending) {
    roomChangeDisabledReason =
      "A room change is already pending. Managers or admins can approve it under Night Audit → Room Changes.";
  }

  const checkoutBannerCoYmd = normalizeBookingCheckoutYmd(
    booking.check_out || "",
  );

  const totalBillBalance = bookingDisplayBillBalance(booking, folioCharges);

  const paymentStatusLower = String(booking.payment_status || "").toLowerCase();
  const owesOrPending =
    totalBillBalance > 0 ||
    Number(booking.balance || 0) > 0 ||
    paymentStatusLower === "pending" ||
    paymentStatusLower === "partial" ||
    paymentStatusLower === "unpaid";

  const showSettleTopUp = canManageFolio && owesOrPending;

  return (
    <div className="space-y-6">
      <CheckoutConfirmDialog
        open={checkoutConfirmOpen}
        onClose={() => {
          if (checkoutLoading) return;
          setCheckoutConfirmOpen(false);
        }}
        title="Check out guest?"
        description={
          <>
            <p className="text-foreground">
              <span className="font-medium">{booking.guests?.name}</span>
              {" — "}
              Room {booking.rooms?.room_number}
            </p>
            <p className="mt-1">
              The room will be set to available and this folio will be marked
              checked out.
            </p>
          </>
        }
        outstandingAmount={totalBillBalance}
        outstandingLabel="Bill balance (unpaid):"
        loading={checkoutLoading}
        confirmLabel="Confirm checkout"
        onConfirm={async () => {
          setCheckoutLoading(true);
          try {
            const supabase = createClient();
            const outDate = resolvedCheckoutDateForClosing({
              check_out: booking.check_out ?? localTodayYmd(),
            });

            const { error } = await supabase
              .from("bookings")
              .update({
                status: "checked_out",
                check_out: outDate,
                folio_status: "checked_out",
                updated_by: userId,
              })
              .eq("id", bookingId);

            if (error) throw error;

            if (booking.room_id) {
              await supabase
                .from("rooms")
                .update({ status: "available" })
                .eq("id", booking.room_id);
            }
            await reconcileRoomStatusesClient();

            setBooking((prev: any) =>
              prev
                ? {
                    ...prev,
                    status: "checked_out",
                    check_out: outDate,
                    folio_status: "checked_out",
                  }
                : prev,
            );

            setCheckoutConfirmOpen(false);
            toast.success(`${booking.guests?.name} checked out successfully`);
          } catch (err: any) {
            toast.error(err?.message || "Failed to check out guest");
          } finally {
            setCheckoutLoading(false);
          }
        }}
      />

      <RoomChangeRequestModal
        open={roomChangeModalOpen}
        onClose={() => setRoomChangeModalOpen(false)}
        onSuccess={() => fetchBookingDetails(bookingId)}
        userId={userId}
        organizationId={booking.organization_id}
        bookingId={booking.id}
        currentRoomId={effectiveRoomId || undefined}
        currentRoomLabel={`Room ${booking.rooms?.room_number ?? "—"}`}
        checkIn={booking.check_in}
        checkOut={booking.check_out}
      />

      <RescheduleStayModal
        open={rescheduleStayOpen}
        onClose={() => setRescheduleStayOpen(false)}
        onSuccess={() => {
          setRescheduleStayPending(true);
          fetchBookingDetails(bookingId);
        }}
        userId={userId}
        organizationId={booking.organization_id}
        booking={{
          id: booking.id,
          check_in: booking.check_in,
          check_out: booking.check_out,
          rate_per_night: booking.rate_per_night || 0,
          deposit: booking.deposit,
          total_amount: booking.total_amount,
          balance: booking.balance,
        }}
      />

      <ExtendStayModal 
        open={extendStayModalOpen}
        onClose={() => setExtendStayModalOpen(false)}
        onSuccess={() => fetchBookingDetails(bookingId)}
        booking={{
          id: booking.id,
          folioId: booking.folio_id,
          guestName: booking.guests?.name,
          room: `Room ${booking.rooms?.room_number}`,
          currentCheckOut: booking.check_out,
          ratePerNight: booking.rate_per_night,
          guestId: booking.guest_id,
          organization_id: booking.organization_id,
          created_by: booking.created_by,
          status: booking.status,
          check_in: booking.check_in,
          folio_status: booking.folio_status,
        }}
      />

      <EditBookingModal
        open={editBookingOpen}
        onClose={() => setEditBookingOpen(false)}
        userId={userId}
        booking={booking}
        onSaved={() => fetchBookingDetails(bookingId)}
      />

      <PaymentReceiptDialog
        open={!!receiptCharge}
        onOpenChange={(open) => {
          if (!open) {
            setReceiptCharge(null);
            setReceiptFolioContextLines(null);
          }
        }}
        organization={receiptOrg}
        booking={booking}
        charge={receiptCharge}
        currentUserName={authUserName || null}
        folioContextLines={receiptFolioContextLines}
      />

      <AlertDialog
        open={deleteBookingDialogOpen}
        onOpenChange={(open) => {
          if (!open && deleteLoading) return;
          setDeleteBookingDialogOpen(open);
        }}
      >
        <AlertDialogContent className="border-2 border-destructive/35 shadow-2xl">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-destructive">
              <AlertCircle className="h-5 w-5 shrink-0" />
              Delete booking?
            </AlertDialogTitle>
            <AlertDialogDescription className="text-left text-foreground/90">
              This permanently removes this folio, related charges, and linked
              payment rows where allowed. It cannot be undone. Use Cancel to
              keep the booking, or Delete to remove it.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteLoading}>
              Cancel
            </AlertDialogCancel>
            <Button
              type="button"
              variant="destructive"
              disabled={deleteLoading}
              onClick={() => void performDeleteBooking()}
            >
              {deleteLoading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Deleting…
                </>
              ) : (
                "Delete booking"
              )}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={deleteChargeTarget !== null}
        onOpenChange={(open) => {
          if (!open && addChargeLoading) return;
          if (!open) setDeleteChargeTarget(null);
        }}
      >
        <AlertDialogContent className="border-2 border-destructive/35 shadow-2xl">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-destructive">
              <AlertCircle className="h-5 w-5 shrink-0" />
              Delete this charge?
            </AlertDialogTitle>
            <AlertDialogDescription className="text-left text-foreground/90">
              Amount:{" "}
              <span className="font-medium tabular-nums">
                {deleteChargeTarget != null
                  ? formatNaira(deleteChargeTarget.chargeAmount)
                  : "—"}
              </span>
              . This cannot be undone. Cancel keeps the charge; Escape also
              closes without deleting.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={addChargeLoading}>
              Cancel
            </AlertDialogCancel>
            <Button
              type="button"
              variant="destructive"
              disabled={addChargeLoading}
              onClick={() => void performDeleteCharge()}
            >
              {addChargeLoading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Deleting…
                </>
              ) : (
                "Delete charge"
              )}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog
        open={folioChargeModalOpen}
        onOpenChange={setFolioChargeModalOpen}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add folio charge</DialogTitle>
            <DialogDescription>
              Restaurant, laundry, extensions billed to this folio
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <Label>Amount</Label>
                  <Input
                    type="number"
                    min="0"
                    placeholder="Enter amount"
                    value={chargeAmount}
                    onChange={(e) => setChargeAmount(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Description</Label>
                  <Input
                    placeholder="e.g., Restaurant - Dinner, Laundry"
                    value={chargeDescription}
                    onChange={(e) => setChargeDescription(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label>How is this charge being settled?</Label>
              <Select
                value={chargePaymentMethod}
                onValueChange={setChargePaymentMethod}
              >
                    <SelectTrigger>
                      <SelectValue placeholder="Select settlement method" />
                    </SelectTrigger>
                    <SelectContent>
                  <SelectItem value="cash">
                    Cash (paid now - not added to Bill Balance)
                  </SelectItem>
                  <SelectItem value="pos">
                    POS (paid now - not added to Bill Balance)
                  </SelectItem>
                  <SelectItem value="transfer">
                    Transfer (paid now - not added to Bill Balance)
                  </SelectItem>
                  <SelectItem value="city_ledger">
                    City Ledger (bill to account - adds to Bill Balance)
                  </SelectItem>
                  <SelectItem value="deferred">
                    Defer / Not yet paid (adds to Bill Balance)
                  </SelectItem>
                    </SelectContent>
                  </Select>
                </div>
            {(chargePaymentMethod === "city_ledger" ||
              chargePaymentMethod === "deferred") && (
                  <p className="text-xs text-orange-600 bg-orange-50 border border-orange-200 rounded px-3 py-2">
                    This charge will be added to the Bill Balance (Unpaid).
                  </p>
                )}
            {chargePaymentMethod !== "" &&
              chargePaymentMethod !== "city_ledger" && (
                  <p className="text-xs text-green-600 bg-green-50 border border-green-200 rounded px-3 py-2">
                  Paid on the spot - this will be recorded in the folio but will
                  NOT affect the Bill Balance.
                  </p>
                )}
            <Button
              onClick={handleFolioCharge}
              className="w-full"
              disabled={addChargeLoading}
            >
              {addChargeLoading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Adding...
                </>
              ) : (
                "Add Charge"
              )}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog
        open={paymentCreditModalOpen}
        onOpenChange={(o) => {
          setPaymentCreditModalOpen(o);
          if (!o) {
            setChargeAmount("");
            setPaymentMethod("");
            setApplyOverpaymentAsCredit(false);
            setPaymentCreditTab("payment");
            setCreditAmount("");
            setCreditPaymentMethod("");
            setCreditNotes("");
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Record payment / Add credit</DialogTitle>
            <DialogDescription>
              Settle this folio or add prepaid credit to the guest&apos;s city
              ledger account
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <Tabs
              value={paymentCreditTab}
              onValueChange={(v) => {
                const t = v as "payment" | "credit";
                setPaymentCreditTab(t);
                if (t === "payment") {
                  setCreditAmount("");
                  setCreditPaymentMethod("");
                  setCreditNotes("");
                } else {
                  setChargeAmount("");
                  setPaymentMethod("");
                  setApplyOverpaymentAsCredit(false);
                }
              }}
            >
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="payment">Record Payment</TabsTrigger>
                <TabsTrigger value="credit">Add Credit</TabsTrigger>
              </TabsList>

              <TabsContent value="payment" className="space-y-4 mt-4">
                <p className="text-sm text-muted-foreground">
                  Record money received against this booking&apos;s bill
                  balance.
                </p>
                <div className="flex items-start gap-2 rounded-md border border-input p-3">
                  <Checkbox
                    id="overpay-credit"
                    checked={applyOverpaymentAsCredit}
                    onCheckedChange={(c) =>
                      setApplyOverpaymentAsCredit(Boolean(c))
                    }
                  />
                  <Label
                    htmlFor="overpay-credit"
                    className="text-sm font-normal leading-snug cursor-pointer"
                  >
                    Paying above bill — apply excess as account credit on the
                    guest&apos;s city ledger (for future stays, dining, laundry,
                    etc.)
                  </Label>
                </div>
                <div className="space-y-2">
                  <Label>Payment Amount</Label>
                  <Input
                    type="number"
                    min="0"
                    placeholder="Enter amount"
                    value={chargeAmount}
                    onChange={(e) => setChargeAmount(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Payment Method</Label>
                  <Select
                    value={paymentMethod}
                    onValueChange={setPaymentMethod}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select method" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="cash">Cash</SelectItem>
                      <SelectItem value="pos">POS</SelectItem>
                      <SelectItem value="transfer">Transfer</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <Button
                  onClick={handleRecordPayment}
                  className="w-full"
                  disabled={addChargeLoading}
                >
                  {addChargeLoading ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Recording...
                    </>
                  ) : (
                    "Record Payment"
                  )}
                </Button>
              </TabsContent>

              <TabsContent value="credit" className="space-y-4 mt-4">
                <p className="text-sm text-muted-foreground">
                  Add prepaid credit for{" "}
                  {(booking?.guests?.name || "this guest").trim() ||
                    "this guest"}{" "}
                  — same as Settle / Top Up on the guest profile. Current ledger
                  balance:{" "}
                  <span className="font-medium text-foreground">
                    {(bookingLedgerSnapshot.balance || 0) > 0
                      ? `${formatNaira(bookingLedgerSnapshot.balance)} owed`
                      : (bookingLedgerSnapshot.balance || 0) < 0
                        ? `${formatNaira(Math.abs(bookingLedgerSnapshot.balance))} credit`
                        : "Settled"}
                  </span>
                </p>
                <div className="space-y-2">
                  <Label>Credit Amount (NGN)</Label>
                  <Input
                    type="number"
                    min="0"
                    placeholder="Enter amount"
                    value={creditAmount}
                    onChange={(e) => setCreditAmount(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Payment Method</Label>
                  <Select
                    value={creditPaymentMethod}
                    onValueChange={setCreditPaymentMethod}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select method" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="cash">Cash</SelectItem>
                      <SelectItem value="pos">POS</SelectItem>
                      <SelectItem value="transfer">Transfer</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Notes (optional)</Label>
                  <Input
                    placeholder="Reference or remarks"
                    value={creditNotes}
                    onChange={(e) => setCreditNotes(e.target.value)}
                  />
                </div>
                <Button
                  onClick={handleBookingAddCredit}
                  className="w-full"
                  disabled={addChargeLoading}
                >
              {addChargeLoading ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Saving...
                    </>
              ) : (
                    "Add Credit"
              )}
            </Button>
              </TabsContent>
            </Tabs>
          </div>
        </DialogContent>
      </Dialog>

      {/* Edit Charge Dialog */}
      <Dialog
        open={editChargeModalOpen}
        onOpenChange={(o) => {
          if (!o) {
            setEditChargeModalOpen(false);
            setEditingCharge(null);
          }
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Edit Charge</DialogTitle>
            <DialogDescription>
              Update the amount or description for this folio entry.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Amount</Label>
              <Input
                type="number"
                min="0"
                placeholder="Enter amount"
                value={editChargeAmount}
                onChange={(e) => setEditChargeAmount(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>Description</Label>
              <Input
                placeholder="Charge description"
                value={editChargeDescription}
                onChange={(e) => setEditChargeDescription(e.target.value)}
              />
            </div>
            <div className="flex gap-3 justify-end">
              <Button
                variant="outline"
                onClick={() => {
                  setEditChargeModalOpen(false);
                  setEditingCharge(null);
                }}
              >
                Cancel
              </Button>
              <Button onClick={handleUpdateCharge} disabled={editChargeLoading}>
                {editChargeLoading ? "Saving..." : "Save Changes"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <div className="flex items-center justify-between">
        <Button variant="ghost" onClick={() => router.push("/bookings")}>
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back to Bookings
        </Button>
        <div className="flex gap-2 items-center flex-wrap">
          {(booking?.folio_status || "active") === "checked_out" && (
            <Badge variant="secondary" className="bg-gray-100 text-gray-700">
              Folio Checked Out
            </Badge>
          )}
          {canRequestRoomChange && (
            <Button
              variant="outline"
              size="sm"
              disabled={Boolean(roomChangeDisabledReason)}
              title={
                roomChangeDisabledReason
                  ? roomChangeDisabledReason
                  : "Send a room reassignment for Superadmin, Administrator, or Manager approval (works before or after check-in)."
              }
              onClick={() => {
                if (roomChangeDisabledReason) {
                  toast.error(roomChangeDisabledReason);
                  return;
                }
                setRoomChangeModalOpen(true);
              }}
            >
              <DoorOpen className="mr-2 h-4 w-4" />
              {roomChangePending
                ? "Room change pending"
                : "Request room change"}
            </Button>
          )}
          {(showRescheduleStay || rescheduleStayPending) && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setRescheduleStayOpen(true)}
              disabled={rescheduleStayPending}
              title={
                rescheduleStayPending
                  ? "Move-dates request pending approval in Night Audit"
                  : "Request new check-in / check-out dates"
              }
            >
              <CalendarRange className="mr-2 h-4 w-4" />
              {rescheduleStayPending ? "Move dates pending" : "Request move dates"}
            </Button>
          )}
          {canManageFolio && (
            <>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setExtendStayModalOpen(true)}
                disabled={addChargeLoading || folioLocked}
              >
            <Clock className="mr-2 h-4 w-4" />
            Extend Stay
          </Button>
              {manualCheckoutEligible(
                {
                  status: booking?.status,
                  check_in: booking?.check_in,
                  check_out: booking?.check_out,
                  folio_status: booking?.folio_status,
                },
                orgCheckoutTime,
              ) ? (
                <Button
                  size="sm"
                  className="bg-amber-600 hover:bg-amber-700 text-white"
                  onClick={handleCheckout}
                  disabled={checkoutLoading}
                >
                  {checkoutLoading ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <LogOut className="mr-2 h-4 w-4" />
                  )}
                  Check Out
                </Button>
              ) : null}
            </>
          )}
          {canAdminBooking && (
            <>
              <Button
                variant="outline"
                size="sm"
                disabled={folioLocked}
                title={
                  folioLocked
                    ? "Editing is disabled after the guest has checked out."
                    : "Edit booking details"
                }
                onClick={() => setEditBookingOpen(true)}
              >
            <Edit className="mr-2 h-4 w-4" />
            Edit
          </Button>
              <Button
                variant="destructive"
                size="sm"
                onClick={handleDeleteBookingClick}
                disabled={booking?.folio_status === "checked_out"}
              >
            <Trash2 className="mr-2 h-4 w-4" />
            Delete
          </Button>
            </>
          )}
        </div>
      </div>

      {/* Late checkout warning banner */}
      {booking.status === "checked_in"
        ? (() => {
            const todayStr = localTodayYmd();
            const overdueNight = checkoutBannerCoYmd < todayStr;
            const pastCutSameDay =
              checkoutBannerCoYmd === todayStr &&
              isPastCheckoutCutoff(
                { check_out: booking.check_out },
                orgCheckoutTime,
              );
            if (!overdueNight && !pastCutSameDay) return null;
            let lateLabel = "";
            if (!overdueNight && pastCutSameDay) {
              const { hour: dh, minute: dm } =
                parseCheckoutTimeHM(orgCheckoutTime);
              const dl = new Date();
              dl.setHours(dh, dm, 0, 0);
              const hrs = Math.floor((Date.now() - dl.getTime()) / 3_600_000);
              const mins = Math.max(
                1,
                Math.floor((Date.now() - dl.getTime()) / 60_000),
              );
              lateLabel =
                hrs >= 1
                  ? `${hrs} hour${hrs !== 1 ? "s" : ""} past ${formatCheckoutTimeLabel(orgCheckoutTime)}`
                  : `${mins} minute${mins !== 1 ? "s" : ""} past ${formatCheckoutTimeLabel(orgCheckoutTime)}`;
            }
            return (
              <div className="flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                <AlertCircle className="h-4 w-4 mt-0.5 shrink-0 text-amber-600" />
                <div className="space-y-0.5">
                  <p className="font-semibold">
                    {overdueNight
                      ? "This guest is overdue — the scheduled checkout date has passed."
                      : `Late checkout — ${lateLabel}`}
                  </p>
                  <p className="text-xs">
                    Standard checkout is{" "}
                    {formatCheckoutTimeLabel(orgCheckoutTime)} (
                    {orgCheckoutTime}). After this time, charge, extend stay,
                    and manual check out are unavailable; overdue rooms are
                    checked out automatically (with any late-checkout policy
                    from Settings).
                  </p>
                </div>
              </div>
            );
          })()
        : null}

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>Booking Details - Folio {booking.folio_id}</CardTitle>
              <Badge
                variant="outline"
                className="bg-green-500/10 text-green-700"
              >
                {booking.status.replace("_", " ")}
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <div className="text-sm text-muted-foreground">Guest Name</div>
                <div className="font-semibold">{booking.guests?.name}</div>
              </div>
              <div>
                <div className="text-sm text-muted-foreground">Phone</div>
                <div className="font-semibold">{booking.guests?.phone}</div>
              </div>
              <div>
                <div className="text-sm text-muted-foreground">Room</div>
                <div className="font-semibold">
                  Room {booking.rooms?.room_number} - {booking.rooms?.room_type}
                </div>
              </div>
              <div>
                <div className="text-sm text-muted-foreground">Rate/Night</div>
                <div className="font-semibold">
                  {formatNaira(booking.rate_per_night)}
                </div>
              </div>
              <div>
                <div className="text-sm text-muted-foreground">Check-in</div>
                <div className="font-semibold">
                  {new Date(booking.check_in).toLocaleDateString("en-GB")}
                </div>
              </div>
              <div>
                <div className="text-sm text-muted-foreground">Check-out</div>
                <div className="font-semibold">
                  {new Date(booking.check_out).toLocaleDateString("en-GB")}
                </div>
              </div>
            </div>

            <Separator />

            <div>
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-semibold text-lg">
                  Folio - All Charges & Payments
                </h3>
                {canManageFolio && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setFolioChargeModalOpen(true)}
                    disabled={folioLocked}
                  >
                  <Plus className="mr-2 h-4 w-4" />
                  Add Charge
                </Button>
                )}
              </div>
              <div className="space-y-2">
                {folioCharges.map((charge) => (
                  <div
                    key={charge.id}
                    className="flex items-start justify-between p-3 border rounded-lg hover:bg-accent/50 transition-colors"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium">
                          {charge.description}
                        </span>
                        {isOutletFolioDescription(charge.description) && (
                          <Badge
                            variant="outline"
                            className="text-xs bg-purple-50 text-purple-800 border-purple-200"
                          >
                            Outlet
                          </Badge>
                        )}
                        {charge.type === "payment" && (
                          <Badge
                            variant="outline"
                            className="text-xs bg-blue-50 text-blue-700 border-blue-200"
                          >
                            Payment
                          </Badge>
                        )}
                        {charge.type === "folio_note" && (
                          <Badge
                            variant="outline"
                            className="text-xs bg-slate-100 text-slate-800 border-slate-200"
                          >
                            Folio note
                          </Badge>
                        )}
                        {charge.type === "extended_stay" &&
                          String(charge.description || "")
                            .toUpperCase()
                            .includes("DISCOUNT") && (
                            <Badge
                              variant="outline"
                              className="text-xs bg-violet-50 text-violet-800 border-violet-200"
                            >
                              Discounted
                            </Badge>
                          )}
                        {charge.type !== "payment" &&
                          Number(charge.amount) > 0 &&
                          charge.paymentStatus === "paid" && (
                            <Badge
                              variant="outline"
                              className="text-xs bg-green-50 text-green-700 border-green-200"
                            >
                              Paid on Spot
                            </Badge>
                          )}
                        {charge.type !== "payment" &&
                          Number(charge.amount) > 0 &&
                          (charge.paymentMethod === "city_ledger" ||
                            String(charge.paymentStatus || "").toLowerCase() ===
                              "city_ledger") &&
                          String(charge.paymentStatus || "").toLowerCase() !==
                            "paid" && (
                            <Badge
                              variant="outline"
                              className="text-xs bg-orange-50 text-orange-700 border-orange-200"
                            >
                              City Ledger
                            </Badge>
                          )}
                        {charge.type !== "payment" &&
                          Number(charge.amount) > 0 &&
                          ["pending", "unpaid"].includes(
                            String(charge.paymentStatus || "").toLowerCase(),
                          ) &&
                          charge.paymentMethod !== "city_ledger" &&
                          String(charge.paymentStatus || "").toLowerCase() !==
                            "city_ledger" && (
                            <Badge
                              variant="outline"
                              className="text-xs bg-yellow-50 text-yellow-700 border-yellow-200"
                            >
                              Pending
                            </Badge>
                        )}
                      </div>
                      <div className="text-xs text-muted-foreground mt-1 space-y-0.5">
                        <div>
                          {new Date(charge.timestamp).toLocaleString("en-GB")}{" "}
                          {charge.paymentMethod
                            ? `· ${charge.paymentMethod.replace("_", " ")}`
                            : ""}
                        </div>
                        <div>By {charge.createdBy}</div>
                      </div>
                    </div>
                    <div className="flex flex-wrap items-center justify-end gap-2 ml-4">
                      <div
                        className={`font-semibold text-right min-w-[100px] ${charge.amount < 0 ? "text-green-600" : charge.type !== "payment" && charge.paymentStatus === "paid" ? "text-muted-foreground" : "text-foreground"}`}
                      >
                        {charge.amount < 0 ? "-" : "+"}
                        {formatNaira(Math.abs(charge.amount))}
                      </div>
                      {folioRowEligibleForPaymentReceipt(charge) &&
                        canPrintReceipt && (
                          <Button
                            size="sm"
                            variant="secondary"
                            className="shrink-0"
                            type="button"
                            onClick={() => {
                              const row: PaymentReceiptChargeRow = {
                                id: charge.id,
                                timestamp: charge.timestamp,
                                description: charge.description,
                                amount: charge.amount,
                                type: charge.type,
                                createdBy: charge.createdBy,
                                paymentMethod: charge.paymentMethod,
                              };
                              if (
                                String(charge.type || "").toLowerCase() ===
                                "payment"
                              ) {
                                setReceiptFolioContextLines(
                                  buildFolioContextLinesForReceipt(
                                    folioCharges,
                                  ),
                                );
                              } else {
                                setReceiptFolioContextLines(null);
                              }
                              setReceiptCharge(row);
                            }}
                          >
                            <Receipt className="h-4 w-4 mr-1.5" />
                            Receipt
                          </Button>
                        )}
                      {canAdminBooking && charge.type !== "folio_note" && (
                      <div className="flex gap-1">
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => openEditCharge(charge)}
                          title="Edit charge"
                        >
                          <Edit className="h-4 w-4" />
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="text-red-600 hover:text-red-700 hover:bg-red-50"
                            onClick={() =>
                              handleDeleteCharge(charge.id, charge.amount)
                            }
                          title="Delete charge"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Payment Summary</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Room Charge</span>
                <span className="font-semibold">
                  {formatNaira(booking.total_amount)}
                </span>
              </div>
              {paidAdditionalCharges > 0 && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">
                    Other Charges (Paid on Spot)
                  </span>
                  <span className="font-semibold text-green-600">
                    +{formatNaira(paidAdditionalCharges)}
                  </span>
                </div>
              )}
              {pendingAdditionalCharges > 0 && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">
                    City Ledger / Deferred Charges
                  </span>
                  <span className="font-semibold text-orange-600">
                    +{formatNaira(pendingAdditionalCharges)}
                  </span>
                </div>
              )}
              <div className="flex justify-between">
                <span className="text-muted-foreground">Amount Paid</span>
                <span className="font-semibold text-green-600">
                  {formatNaira(totalAmountPaid)}
                </span>
              </div>
              {folioBookingCreditAmount > 0 && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Credit</span>
                  <span className="font-semibold text-blue-600">
                    {formatNaira(folioBookingCreditAmount)}
                  </span>
                </div>
              )}
              <Separator />
              <div className="flex justify-between text-lg">
                <span className="font-semibold">Bill Balance (Unpaid)</span>
                <span
                  className={`font-bold ${totalBillBalance > 0 ? "text-red-600" : "text-green-600"}`}
                >
                  {formatNaira(totalBillBalance)}
                </span>
              </div>
              {canPrintReceipt && paymentLedgerRows.length > 0 && (
                <div className="space-y-2 pt-1">
                  <div className="text-sm font-medium">
                    Print payment receipts
                  </div>
                  <p className="text-xs text-muted-foreground">
                    One row per payment recorded on the ledger (use if you do
                    not see a Receipt on a folio line).
                  </p>
                  <div className="space-y-2">
                    {paymentLedgerRows.map((tx) => (
                      <div
                        key={tx.id}
                        className="flex flex-wrap items-center justify-between gap-2 rounded-md border bg-muted/30 px-3 py-2"
                      >
                        <div className="min-w-0 text-sm">
                          <div className="font-semibold">
                            {formatNaira(Math.abs(Number(tx.amount)))}
                          </div>
                          <div className="text-xs text-muted-foreground">
                            {new Date(tx.created_at).toLocaleString("en-GB")} ·{" "}
                            {String(tx.payment_method || "—").replace(
                              /_/g,
                              " ",
                            )}
                          </div>
                          {tx.description && (
                            <div
                              className="text-xs text-muted-foreground truncate max-w-[220px] md:max-w-none"
                              title={tx.description}
                            >
                              {tx.description}
                            </div>
                          )}
                        </div>
                        <Button
                          size="sm"
                          variant="secondary"
                          className="shrink-0"
                          type="button"
                          onClick={() => {
                            setReceiptFolioContextLines(
                              buildFolioContextLinesForReceipt(folioCharges),
                            );
                            setReceiptCharge(transactionToReceiptChargeRow(tx));
                          }}
                        >
                          <Receipt className="h-4 w-4 mr-1.5" />
                          Receipt
                        </Button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {showSettleTopUp && (
                <Button
                  className="w-full mt-4"
                  disabled={addChargeLoading}
                  onClick={() => {
                    setPaymentCreditTab("payment");
                    setApplyOverpaymentAsCredit(false);
                    const due = Math.max(
                      totalBillBalance,
                      Number(booking.balance) || 0,
                    );
                    setChargeAmount(due > 0 ? String(due) : "");
                    setPaymentCreditModalOpen(true);
                  }}
                >
                  <CreditCard className="mr-2 h-4 w-4" />
                  Settle / Top Up
                </Button>
              )}
              {showSettleTopUp && folioLocked && (
                <p className="text-xs text-muted-foreground mt-2">
                  After checkout, new room charges are closed, but you can still
                  record payment or city ledger credit here.
                </p>
              )}
            </CardContent>
          </Card>

          <FolioAttachmentsPanel bookingId={booking.id} canAdd={canManageFolio} />

          <Card>
            <CardHeader>
              <CardTitle>Activity Log</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div className="flex gap-2 flex-col">
                <div className="text-muted-foreground">
                  {new Date(booking.created_at).toLocaleDateString("en-GB")}
                </div>
                <div>
                  Booking created by{" "}
                  {getUserDisplayName(createdByUser, booking.created_by)}
                </div>
              </div>
              {booking.payment_status === "paid" && (
                <div className="flex gap-2 flex-col">
                  <div className="text-muted-foreground">
                    {new Date(booking.created_at).toLocaleDateString("en-GB")}
                  </div>
                  <div>Full payment received</div>
                </div>
              )}
              {updatedByUser && (
                <div className="flex gap-2 flex-col">
                  <div className="text-muted-foreground">
                    {booking.updated_at
                      ? new Date(booking.updated_at).toLocaleDateString("en-GB")
                      : "N/A"}
                  </div>
                  <div>
                    Updated by{" "}
                    {getUserDisplayName(updatedByUser, booking.updated_by)}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
