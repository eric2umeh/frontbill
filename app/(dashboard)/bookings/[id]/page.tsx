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
  DialogScrollableBody,
  DialogScrollableFooter,
  DialogScrollableHeader,
  dialogScrollableContentClass,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
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
  canFrontDeskApplyRescheduleStay,
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
import {
  earnCashbackClient,
  fetchGuestCashbackBalanceClient,
} from "@/lib/cashback/cashback-client";
import { computeCashbackDiscount } from "@/lib/cashback/cashback-payment-math";
import { applyCashbackDiscountAndFolioPayments } from "@/lib/cashback/apply-cashback-folio-payment";
import { CashbackPaymentPanel } from "@/components/cashback/cashback-payment-panel";
import { PaymentAccountSelect } from "@/components/payments/payment-account-select";
import {
  appendAccountToNotes,
  paymentAccountInsertFields,
  paymentMethodRequiresAccount,
  type PaymentAccount,
} from "@/lib/payments/payment-accounts";
import { paymentMethodEarnsCashback } from "@/lib/cashback/cashback-config";
import {
  isGuestBookingCashbackEligible,
  paymentMethodFromBookingNotes,
} from "@/lib/cashback/cashback-eligibility";
import { createClient } from "@/lib/supabase/client";
import { reconcileRoomStatusesClient } from "@/lib/rooms/reconcile-room-status-client";
import { roomHousekeepingPatchAfterCheckout } from "@/lib/rooms/sync-housekeeping-status";
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
  folioChargesForPaidHeal,
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
  fetchGuestBookingLedgerSnapshot,
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
    dueBalance: number;
    rawBalance: number;
  }>({
    id: null,
    balance: 0,
    dueBalance: 0,
    rawBalance: 0,
  });
  const [guestCashbackBalance, setGuestCashbackBalance] = useState(0);
  const [applyCashback, setApplyCashback] = useState(false);
  const [creditAmount, setCreditAmount] = useState("");
  const [creditPaymentMethod, setCreditPaymentMethod] = useState("");
  const [creditNotes, setCreditNotes] = useState("");
  const [extendStayModalOpen, setExtendStayModalOpen] = useState(false);
  const [rescheduleStayOpen, setRescheduleStayOpen] = useState(false);
  const [rescheduleStayPending, setRescheduleStayPending] = useState(false);
  const [chargeAmount, setChargeAmount] = useState("");
  const [chargeDescription, setChargeDescription] = useState("");
  const [chargePaymentMethod, setChargePaymentMethod] = useState("");
  const [chargePaymentAccountId, setChargePaymentAccountId] = useState("");
  const [chargePaymentAccount, setChargePaymentAccount] =
    useState<PaymentAccount | null>(null);
  const [paymentMethod, setPaymentMethod] = useState("");
  const [paymentAccountId, setPaymentAccountId] = useState("");
  const [paymentAccount, setPaymentAccount] = useState<PaymentAccount | null>(
    null,
  );
  const [creditPaymentAccountId, setCreditPaymentAccountId] = useState("");
  const [creditPaymentAccount, setCreditPaymentAccount] =
    useState<PaymentAccount | null>(null);
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

  const mapFolioChargeRow = (
    charge: {
      id: string;
      created_at?: string | null;
      description?: string | null;
      amount?: number | null;
      charge_type?: string | null;
      payment_status?: string | null;
      payment_method?: string | null;
      created_by?: string | null;
    },
    creatorMap: Record<string, string>,
  ) => {
    const creatorName = charge.created_by
      ? creatorMap[charge.created_by] ||
        getUserDisplayName(null, charge.created_by)
      : "System";
    return {
      id: charge.id,
      date: charge.created_at?.split("T")[0],
      timestamp: charge.created_at ?? "",
      description: charge.description ?? "",
      amount: charge.amount ?? 0,
      type: charge.charge_type ?? "charge",
      createdBy: creatorName,
      paymentStatus: charge.payment_status,
      paymentMethod: charge.payment_method,
    };
  };

  const enrichBookingDetails = async (
    id: string,
    bookingData: Record<string, unknown>,
    uid: string | null | undefined,
    initialCharges: Array<{
      id: string;
      created_at?: string | null;
      description?: string | null;
      amount?: number | null;
      charge_type?: string | null;
      payment_status?: string | null;
      payment_method?: string | null;
      created_by?: string | null;
    }>,
  ) => {
    const supabase = createClient();
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

    const orgId = bookingData.organization_id as string | undefined;
    if (orgId) {
      const checkoutTime = await fetchOrgCheckoutTime(supabase, orgId);
      setOrgCheckoutTime(checkoutTime);
    }

    const hotelName = String(nestedOrg?.name ?? "").trim();
    if (nestedOrg || orgId) {
      setReceiptOrg({
        hotelName,
        address: String(nestedOrg?.address ?? ""),
        phone: String(nestedOrg?.phone ?? ""),
        email: String(nestedOrg?.email ?? ""),
      });
    }

    let outletSyncRan = false;
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
            logoUrl?: string | null;
          };
          const hn = String(j.hotelName ?? "").trim();
          setReceiptOrg({
            hotelName: hn,
            address: String(j.address ?? ""),
            phone: String(j.phone ?? ""),
            email: String(j.email ?? ""),
            logoUrl: j.logoUrl ?? null,
          });
        }
      } catch {
        /* keep client-derived branding */
      }

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
        outletSyncRan = true;
      } catch {
        /* non-fatal — still try to reload charges */
        outletSyncRan = true;
      }
    }

    let refreshedCharges: typeof initialCharges | null = null;
    let refreshedBookingPatch: {
      balance?: number | null;
      payment_status?: string | null;
    } | null = null;
    if (outletSyncRan) {
      const { data: chargeRows, error: chargeErr } = await supabase
        .from("folio_charges")
        .select(
          "id, created_at, description, amount, charge_type, payment_status, payment_method, created_by",
        )
        .eq("booking_id", id)
        .order("created_at", { ascending: true });
      if (!chargeErr && Array.isArray(chargeRows)) {
        refreshedCharges = chargeRows;
      }
      const { data: bkRow } = await supabase
        .from("bookings")
        .select("balance, payment_status")
        .eq("id", id)
        .maybeSingle();
      if (bkRow) refreshedBookingPatch = bkRow;
    }

    const { charges: chargeSource, allowPaidHeal } = folioChargesForPaidHeal(
      initialCharges,
      refreshedCharges,
      outletSyncRan,
    );

    let nextBooking = bookingData;
    if (refreshedBookingPatch) {
      nextBooking = { ...bookingData, ...refreshedBookingPatch };
      setBooking(nextBooking);
    }

    const bookingUserIds = [
      bookingData.created_by,
      bookingData.updated_by,
    ].filter(Boolean) as string[];
    const bookingUserMap = await fetchUserDisplayNameMap(bookingUserIds, uid);
    if (bookingData.created_by) {
      setCreatedByUser({
        id: String(bookingData.created_by),
        full_name: bookingUserMap[String(bookingData.created_by)],
      });
    }
    if (bookingData.updated_by) {
      setUpdatedByUser({
        id: String(bookingData.updated_by),
        full_name: bookingUserMap[String(bookingData.updated_by)],
      });
    }

    const chargeCreatorIds = chargeSource
      .map((charge) => charge.created_by)
      .filter(Boolean) as string[];
    const chargeCreatorMap = await fetchUserDisplayNameMap(chargeCreatorIds, uid);
    let chargesWithCreator = chargeSource.map((charge) =>
      mapFolioChargeRow(charge, chargeCreatorMap),
    );
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
    setPaymentLedgerRows(
      payLedgerRaw.map((t: Record<string, unknown>) => ({
        id: String(t.id),
        created_at: String(t.created_at ?? ""),
        amount: Number(t.amount) || 0,
        payment_method: (t.payment_method as string | null) ?? null,
        description: (t.description as string | null) ?? null,
        transaction_id: (t.transaction_id as string | null) ?? null,
        receivedByLabel: t.received_by
          ? receiverMap[String(t.received_by)] ||
            getUserDisplayName(null, String(t.received_by))
          : "Staff",
      })),
    );

    if (
      allowPaidHeal &&
      shouldReconcileBookingPaymentPaid(nextBooking, chargesWithCreator)
    ) {
      const { error: psFixErr } = await supabase
        .from("bookings")
        .update({ payment_status: "paid" })
        .eq("id", id);
      if (!psFixErr) {
        nextBooking = { ...nextBooking, payment_status: "paid" };
        setBooking(nextBooking);
      }
    }

    const guests = bookingData.guests as { name?: string; id?: string } | null;
    const guestName = (guests?.name || "").trim();
    const guestIdForLedger =
      (bookingData.guest_id as string | undefined) || guests?.id;
    if (guestName && orgId) {
      try {
        if (guestIdForLedger && uid) {
          const reconRes = await fetch(
            `/api/guests/${guestIdForLedger}/reconcile-credit`,
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ caller_id: uid }),
            },
          );
          const reconPayload = await reconRes.json().catch(() => ({}));
          if (reconRes.ok && reconPayload?.updated) {
            const { data: refreshedCharges } = await supabase
              .from("folio_charges")
              .select(
                "id, created_at, description, amount, charge_type, payment_status, payment_method, created_by",
              )
              .eq("booking_id", id)
              .order("created_at", { ascending: true });
            if (refreshedCharges) {
              chargesWithCreator = refreshedCharges.map((charge) =>
                mapFolioChargeRow(charge, chargeCreatorMap),
              );
              setFolioCharges(chargesWithCreator);
            }
          }
        }
        const snapshot = await fetchGuestBookingLedgerSnapshot(supabase, {
          organizationId: orgId,
          guestName,
          guestId: guestIdForLedger,
        });
        setBookingLedgerSnapshot(snapshot);
      } catch {
        setBookingLedgerSnapshot({
          id: null,
          balance: 0,
          dueBalance: 0,
          rawBalance: 0,
        });
      }
    }

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
    }
  };

  const fetchBookingDetails = async (id: string) => {
    const uid = userIdRef.current;
    try {
      const supabase = createClient();

      const [bookingRes, chargesRes] = await Promise.all([
        supabase
          .from("bookings")
          .select(
            `
          *,
          guests(name, phone, email, address),
          rooms(id, room_number, room_type, price_per_night),
          organizations(name, address, phone, email)
        `,
          )
          .eq("id", id)
          .single(),
        supabase
          .from("folio_charges")
          .select(
            "id, created_at, description, amount, charge_type, payment_status, payment_method, created_by",
          )
          .eq("booking_id", id)
          .order("created_at", { ascending: true }),
      ]);

      if (bookingRes.error) throw bookingRes.error;
      const bookingData = bookingRes.data;
      if (!bookingData) throw new Error("Booking not found");
      if (chargesRes.error) throw chargesRes.error;

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

      setBooking(bookingData);
      setFolioCharges(
        (chargesRes.data || []).map((charge) =>
          mapFolioChargeRow(charge, {}),
        ),
      );

      const hotelName = String(nestedOrg?.name ?? "").trim();
      if (nestedOrg || bookingData.organization_id) {
        setReceiptOrg({
          hotelName,
          address: String(nestedOrg?.address ?? ""),
          phone: String(nestedOrg?.phone ?? ""),
          email: String(nestedOrg?.email ?? ""),
        });
      }

      setLoading(false);
      void enrichBookingDetails(id, bookingData, uid, chargesRes.data || []);
    } catch (error: unknown) {
      const err = error as { status?: number; code?: string; message?: string };
      if (err?.status === 401 || err?.code === "PGRST") {
        toast.error("Session expired. Please log in again.");
        router.push("/login");
        return;
      }

      toast.error(err.message || "Failed to fetch booking details");
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!bookingId || loading || !booking) return;
    if (isBookingCheckedOut(booking)) return;
    const iv = window.setInterval(() => {
      fetchBookingDetails(bookingId);
    }, 120_000);
    return () => window.clearInterval(iv);
  }, [bookingId, loading, booking?.status, booking?.folio_status]);


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
    const guestId = booking.guest_id || booking.guests?.id;
    (async () => {
      const supabase = createClient();
      if (guestName) {
        const snapshot = await fetchGuestBookingLedgerSnapshot(supabase, {
          organizationId: booking.organization_id,
          guestName,
          guestId,
        });
        setBookingLedgerSnapshot(snapshot);
      }
      if (guestId) {
        const cb = await fetchGuestCashbackBalanceClient(supabase, guestId);
        setGuestCashbackBalance(cb.balance);
      } else {
        setGuestCashbackBalance(0);
      }
    })();
  }, [
    paymentCreditModalOpen,
    booking?.organization_id,
    booking?.guests?.name,
    booking?.guest_id,
    booking?.guests?.id,
  ]);

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
    if (
      paymentMethodRequiresAccount(chargePaymentMethod) &&
      !chargePaymentAccountId
    ) {
      toast.error(
        "Select the POS / bank account where this payment was received",
      );
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
      const chargeAccountFields = paymentMethodRequiresAccount(
        chargePaymentMethod,
      )
        ? paymentAccountInsertFields(chargePaymentAccount)
        : { payment_account_id: null, payment_account_label: null };

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
            description: appendAccountToNotes(
              chargeDescription,
              chargeAccountFields.payment_account_label,
            ),
            received_by: userId,
            ...chargeAccountFields,
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
            .select("name")
            .eq("id", booking!.guest_id)
            .single();
            if (guestRow) {
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
      setChargePaymentAccountId("");
      setChargePaymentAccount(null);

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
    if (paymentMethodRequiresAccount(paymentMethod) && !paymentAccountId) {
      toast.error(
        "Select the POS / bank account where this payment was received",
      );
      return;
    }
    if (!canManageFolio || !booking) return;

    const cashEntered = Number(chargeAmount);
    setAddChargeLoading(true);
    try {
      const supabase = createClient();
      const guestId = booking.guest_id || booking.guests?.id;
      const accountFields = paymentMethodRequiresAccount(paymentMethod)
        ? paymentAccountInsertFields(paymentAccount)
        : { payment_account_id: null, payment_account_label: null };

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

      const cashbackOk = isGuestBookingCashbackEligible({
        guestName: booking.guests?.name,
        paymentMethod: paymentMethodFromBookingNotes(booking.notes),
      });

      const breakdown = computeCashbackDiscount({
        totalDue: billBefore,
        cashbackBalance: guestCashbackBalance,
        cashPaying: cashEntered,
        applyCashback: applyCashback && Boolean(guestId) && cashbackOk,
      });
      const totalApplied =
        breakdown.cashbackDiscount + breakdown.cashToCollect;

      if (
        cashEntered > breakdown.dueAfterDiscount + 0.001 &&
        !applyOverpaymentAsCredit
      ) {
        toast.error(
          breakdown.cashbackDiscount > 0
            ? `After ${formatNaira(breakdown.cashbackDiscount)} cashback discount, collect up to ${formatNaira(breakdown.dueAfterDiscount)}. Enable “Paying above bill” for excess credit, or reduce the amount.`
            : "This amount is more than the current bill balance. Enable “Paying above bill — apply excess as account credit” or reduce the amount.",
        );
        setAddChargeLoading(false);
        return;
      }

      if (guestId && cashbackOk) {
        await applyCashbackDiscountAndFolioPayments(supabase, {
          guestId,
          bookingId,
          organizationId: booking.organization_id || "",
          cashbackDiscount: breakdown.cashbackDiscount,
          cashAmount: breakdown.cashToCollect,
          cashPaymentMethod: paymentMethod,
          createdBy: userId,
          sourceType: "folio_payment",
          sourceId: bookingId,
          cashDescription: `Payment Received - ${paymentMethod.replace("_", " ")}`,
        });
        if (breakdown.cashbackDiscount > 0) {
          setGuestCashbackBalance((b) =>
            Math.max(0, b - breakdown.cashbackDiscount),
          );
        }
      } else {
        const paymentEntry: Record<string, unknown> = {
          booking_id: bookingId,
          description: `Payment Received - ${paymentMethod.replace("_", " ")}`,
          amount: -breakdown.cashToCollect,
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
      }

      const newBalance = Math.max(0, billBefore - totalApplied);
      const newDeposit = Number(freshBk2?.deposit || 0) + totalApplied;

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

      const guestName = (booking.guests?.name || "").trim();
      if (guestName && booking.organization_id) {
        await applyBookingPaymentToGuestLedger(supabase, {
          organizationId: booking.organization_id,
          guestName,
          bookingBillBefore: billBefore,
          paymentAmount: totalApplied,
        });
      }

      try {
        const txDescBase =
          breakdown.cashbackDiscount > 0
            ? `Payment received - ${paymentMethod.replace(/_/g, " ")} (incl. ${formatNaira(breakdown.cashbackDiscount)} cashback discount)`
            : `Payment received - ${paymentMethod.replace(/_/g, " ")}`;
        await supabase.from("transactions").insert([
          {
            organization_id: booking.organization_id || null,
            booking_id: bookingId,
            transaction_id: `PAY-${bookingId}-${Date.now()}`,
            guest_name: booking.guests?.name || "Guest",
            room: booking.rooms?.room_number || null,
            amount: breakdown.cashToCollect,
            payment_method: paymentMethod,
            status: "paid",
            description: appendAccountToNotes(
              txDescBase,
              accountFields.payment_account_label,
            ),
            received_by: userId,
            ...accountFields,
          },
        ]);
      } catch (_) {
        /* non-fatal */
      }

      if (
        guestId &&
        paymentMethodEarnsCashback(paymentMethod) &&
        breakdown.cashToCollect > 0
      ) {
        const earned = await earnCashbackClient(supabase, {
          guestId,
          amount: breakdown.cashToCollect,
          paymentMethod,
          sourceType: "folio_payment",
          sourceId: bookingId,
        });
        if (earned > 0) {
          setGuestCashbackBalance((b) => b + earned);
        }
      }

      await fetchBookingDetails(bookingId);

      const excess = Math.max(0, cashEntered - breakdown.dueAfterDiscount);
      const method = paymentMethod;
      const discountNote =
        breakdown.cashbackDiscount > 0
          ? ` (${formatNaira(breakdown.cashbackDiscount)} cashback discount applied)`
          : "";
      toast.success(
        excess > 0
          ? `Payment of ${formatNaira(totalApplied)} recorded${discountNote} (${formatNaira(excess)} stored as account credit)`
          : `Payment of ${formatNaira(totalApplied)} recorded${discountNote}`,
      );

      setPaymentCreditModalOpen(false);
      setChargeAmount("");
      setPaymentMethod("");
      setPaymentAccountId("");
      setPaymentAccount(null);
      setApplyOverpaymentAsCredit(false);
      setApplyCashback(false);
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
    if (
      paymentMethodRequiresAccount(creditPaymentMethod) &&
      !creditPaymentAccountId
    ) {
      toast.error(
        "Select the POS / bank account where this payment was received",
      );
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

      const creditAccountFields = paymentMethodRequiresAccount(
        creditPaymentMethod,
      )
        ? paymentAccountInsertFields(creditPaymentAccount)
        : { payment_account_id: null, payment_account_label: null };

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
        currentLedgerBalance: bookingLedgerSnapshot.rawBalance,
        syncGuestProfile: false,
        ...creditAccountFields,
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

      const snapshot = await fetchGuestBookingLedgerSnapshot(supabase, {
        organizationId: booking.organization_id,
        guestName,
        guestId: booking.guest_id || booking.guests?.id,
      });
      setBookingLedgerSnapshot(snapshot);

      toast.success(
        `Credit of ${formatNaira(amt)} added to ${guestName}'s account`,
      );
      setCreditAmount("");
      setCreditPaymentMethod("");
      setCreditPaymentAccountId("");
      setCreditPaymentAccount(null);
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

  const isStayChargeType = (ctype: string) =>
    ["room_charge", "extended_stay", "reservation"].includes(
      String(ctype || "").toLowerCase(),
    );

  // Folio stay lines (room + extensions) — source of truth for the room bill
  const stayChargesTotal = folioCharges
    .filter((c: any) => {
      const ctype = c.type || c.charge_type;
      if (ctype === "payment" || Number(c.amount) <= 0) return false;
      return isStayChargeType(ctype);
    })
    .reduce((sum: number, c: any) => sum + Number(c.amount), 0);

  // Other positive folio charges (minibar, add-charge, etc.) — unpaid / city ledger
  const pendingAdditionalCharges = folioCharges
    .filter((c: any) => {
      const ctype = c.type || c.charge_type;
      if (
        ctype === "payment" ||
        isStayChargeType(ctype) ||
        ctype === "folio_note"
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

  // Unpaid stay charges on city ledger / deferred (included in bill balance, shown separately)
  const pendingStayCharges = folioCharges
    .filter((c: any) => {
      const ctype = c.type || c.charge_type;
      if (!isStayChargeType(ctype)) return false;
      if (!Number(c.amount) || Number(c.amount) <= 0) return false;
      const status = String(
        c.paymentStatus ?? c.payment_status ?? "",
      ).toLowerCase();
      if (status === "posted_to_ledger" || status === "paid") return false;
      const method = String(
        c.paymentMethod ?? c.payment_method ?? "",
      ).toLowerCase();
    return (
        ["pending", "unpaid", "city_ledger", "partial"].includes(status) ||
        (method === "city_ledger" && status !== "paid") ||
        status === ""
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

  const bookingCashbackEligible = isGuestBookingCashbackEligible({
    guestName: booking.guests?.name,
    paymentMethod: paymentMethodFromBookingNotes(booking.notes),
  });

  const owesOrPending =
    totalBillBalance > 0.005 ||
    Number(booking.balance || 0) > 0.005;

  const guestAccountOwes =
    Number(bookingLedgerSnapshot.balance) > 0.005 ||
    Number(bookingLedgerSnapshot.dueBalance) > 0.005;

  const showSettleTopUp = canManageFolio && (owesOrPending || guestAccountOwes);

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
              The room will be marked Check-out for housekeeping and this folio
              will be marked checked out.
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
                .update(roomHousekeepingPatchAfterCheckout())
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
        onSuccess={(result) => {
          setRescheduleStayPending(!result?.applied);
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
                onValueChange={(v) => {
                  setChargePaymentMethod(v);
                  setChargePaymentAccountId("");
                  setChargePaymentAccount(null);
                }}
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
            <PaymentAccountSelect
              paymentMethod={chargePaymentMethod}
              value={chargePaymentAccountId}
              onChange={(id, acc) => {
                setChargePaymentAccountId(id);
                setChargePaymentAccount(acc);
              }}
            />
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
            setPaymentAccountId("");
            setPaymentAccount(null);
            setApplyOverpaymentAsCredit(false);
            setPaymentCreditTab("payment");
            setCreditAmount("");
            setCreditPaymentMethod("");
            setCreditPaymentAccountId("");
            setCreditPaymentAccount(null);
            setCreditNotes("");
          }
        }}
      >
        <DialogContent
          className={cn(dialogScrollableContentClass, "sm:max-w-md")}
        >
          <DialogScrollableHeader>
            <DialogTitle>Record payment / Add credit</DialogTitle>
            <DialogDescription>
              Settle this folio or add prepaid credit to the guest&apos;s city
              ledger account
            </DialogDescription>
          </DialogScrollableHeader>
          <DialogScrollableBody className="space-y-4">
            <Tabs
              value={paymentCreditTab}
              onValueChange={(v) => {
                const t = v as "payment" | "credit";
                setPaymentCreditTab(t);
                if (t === "payment") {
                  setCreditAmount("");
                  setCreditPaymentMethod("");
                  setCreditPaymentAccountId("");
                  setCreditPaymentAccount(null);
                  setCreditNotes("");
                } else {
                  setChargeAmount("");
                  setPaymentMethod("");
                  setPaymentAccountId("");
                  setPaymentAccount(null);
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
                    onValueChange={(v) => {
                      setPaymentMethod(v);
                      setPaymentAccountId("");
                      setPaymentAccount(null);
                    }}
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
                <PaymentAccountSelect
                  paymentMethod={paymentMethod}
                  value={paymentAccountId}
                  onChange={(id, acc) => {
                    setPaymentAccountId(id);
                    setPaymentAccount(acc);
                  }}
                />
                {(booking?.guest_id || booking?.guests?.id) &&
                  bookingCashbackEligible &&
                  Number(chargeAmount) > 0 && (
                    <CashbackPaymentPanel
                      guestId={booking.guest_id || booking.guests?.id}
                      totalAmount={Math.max(
                        0,
                        bookingDisplayBillBalance(
                          {
                            balance: booking.balance,
                            deposit: booking.deposit,
                            total_amount: booking.total_amount,
                          },
                          folioCharges.map((c: any) => ({
                            amount: c.amount,
                            charge_type: c.type ?? c.charge_type,
                            payment_status: c.paymentStatus ?? c.payment_status,
                            payment_method: c.paymentMethod ?? c.payment_method,
                          })),
                        ),
                      )}
                      cashPaying={Number(chargeAmount) || 0}
                      paymentMethod={paymentMethod}
                      applyCashback={applyCashback}
                      onApplyCashbackChange={setApplyCashback}
                    />
                  )}
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
                    onValueChange={(v) => {
                      setCreditPaymentMethod(v);
                      setCreditPaymentAccountId("");
                      setCreditPaymentAccount(null);
                    }}
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
                <PaymentAccountSelect
                  paymentMethod={creditPaymentMethod}
                  value={creditPaymentAccountId}
                  onChange={(id, acc) => {
                    setCreditPaymentAccountId(id);
                    setCreditPaymentAccount(acc);
                  }}
                />
                <div className="space-y-2">
                  <Label>Notes (optional)</Label>
                  <Input
                    placeholder="Reference or remarks"
                    value={creditNotes}
                    onChange={(e) => setCreditNotes(e.target.value)}
                  />
                </div>
              </TabsContent>
            </Tabs>
          </DialogScrollableBody>
          <DialogScrollableFooter>
            {paymentCreditTab === "payment" ? (
              <Button
                onClick={handleRecordPayment}
                className="w-full sm:w-auto"
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
            ) : (
              <Button
                onClick={handleBookingAddCredit}
                className="w-full sm:w-auto"
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
            )}
          </DialogScrollableFooter>
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
                  : "Move guest to another room (front desk can apply immediately, or send for approval)"
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
                : "Change room"}
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
                  : canFrontDeskApplyRescheduleStay(role)
                    ? "Change check-in / check-out dates"
                    : "Request new check-in / check-out dates"
              }
            >
              <CalendarRange className="mr-2 h-4 w-4" />
              {rescheduleStayPending
                ? "Move dates pending"
                : canFrontDeskApplyRescheduleStay(role)
                  ? "Move dates"
                  : "Request move dates"}
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
                <span className="text-muted-foreground">
                  Stay charges (folio)
                </span>
                <span className="font-semibold">
                  {formatNaira(
                    stayChargesTotal > 0
                      ? stayChargesTotal
                      : Number(booking.total_amount) || 0,
                  )}
                </span>
              </div>
              {pendingStayCharges > 0 &&
                pendingStayCharges !== stayChargesTotal && (
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">
                      Of which unpaid / city ledger
                    </span>
                    <span className="font-medium text-orange-600">
                      {formatNaira(pendingStayCharges)}
                    </span>
                  </div>
                )}
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
                    Other city ledger / deferred
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
                  <span className="text-muted-foreground">Folio credit</span>
                  <span className="font-semibold text-blue-600">
                    {formatNaira(folioBookingCreditAmount)}
                  </span>
                </div>
              )}
              {(() => {
                const due = Number(bookingLedgerSnapshot.dueBalance) || 0;
                const led = Number(bookingLedgerSnapshot.balance) || 0;
                const showDue = due > 0.005;
                const showCredit = led < -0.005;
                const showLedgerDebit =
                  led > 0.005 && Math.abs(led - due) > 0.005;
                return (
                  <>
                    {showDue && (
                      <div className="flex justify-between rounded-md border border-red-200 bg-red-50/80 px-3 py-2">
                        <span className="text-sm font-medium text-red-900">
                          Guest due balance
                          {showLedgerDebit ? " (open folios)" : " / city ledger"}
                        </span>
                        <span className="font-bold text-red-700 tabular-nums">
                          {formatNaira(due)}
                        </span>
                      </div>
                    )}
                    {showLedgerDebit && (
                      <div className="flex justify-between rounded-md border border-orange-200 bg-orange-50/80 px-3 py-2">
                        <span className="text-sm font-medium text-orange-900">
                          City ledger balance
                        </span>
                        <span className="font-bold text-orange-700 tabular-nums">
                          {formatNaira(led)}
                        </span>
                      </div>
                    )}
                    {showCredit && (
                      <div className="flex justify-between rounded-md border border-blue-200 bg-blue-50/80 px-3 py-2">
                        <span className="text-sm font-medium text-blue-900">
                          Guest account credit (city ledger)
                        </span>
                        <span className="font-bold text-blue-700 tabular-nums">
                          {formatNaira(Math.abs(led))}
                        </span>
                      </div>
                    )}
                  </>
                );
              })()}
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
                    const guestWideDue = Math.max(
                      0,
                      Number(bookingLedgerSnapshot.balance) > 0
                        ? Number(bookingLedgerSnapshot.balance)
                        : 0,
                      Number(bookingLedgerSnapshot.dueBalance) > 0
                        ? Number(bookingLedgerSnapshot.dueBalance)
                        : 0,
                    );
                    const due = Math.max(
                      totalBillBalance,
                      Number(booking.balance) || 0,
                      guestWideDue,
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
