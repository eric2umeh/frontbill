import type { SupabaseClient } from "@supabase/supabase-js";
import {
  bookingBalanceAfterRefundCredit,
  bookingColumnsAfterRefundWithoutFolio,
  planGuestRefundCredit,
  ledgerBalanceAfterRefund,
  type RefundBookingCandidate,
} from "@/lib/refunds/guest-refund-credit";
import {
  folioPositiveOutstandingSum,
  type FolioLineForBalance,
} from "@/lib/utils/booking-bill-balance";
import { insertFolioCharges } from "@/lib/utils/insert-folio-charges";
import {
  fetchGuestCityLedgerAccount,
  syncGuestCityLedgerBalances,
} from "@/lib/utils/guest-city-ledger";

type FolioRow = FolioLineForBalance & { booking_id?: string; payment_status?: string | null };

function asLines(rows: FolioRow[]): FolioLineForBalance[] {
  return rows.map((row) => ({
    amount: row.amount,
    charge_type: row.charge_type,
    payment_status: row.payment_status,
    payment_method: row.payment_method,
  }));
}

/**
 * Reduce what the guest still owes by the refund.
 * Does not change bookings.deposit (that reopened paid stays) and does not
 * insert a second cash transaction — sales collection already subtracts the refunds row.
 */
export async function applyGuestRefundCredit(
  admin: SupabaseClient,
  input: {
    organizationId: string;
    guestId: string;
    guestName: string;
    explicitBookingId?: string | null;
    amount: number;
    reason: string;
    callerId: string;
    refundId: string;
  },
): Promise<void> {
  const { data: bookingRows, error: bookingErr } = await admin
    .from("bookings")
    .select("id, check_in, status, guest_id")
    .eq("guest_id", input.guestId)
    .eq("organization_id", input.organizationId);

  if (bookingErr) throw new Error(bookingErr.message);

  const bookings = (bookingRows || []).filter((row) => {
    const status = String(row.status || "").toLowerCase();
    if (row.id === input.explicitBookingId) return true;
    return status !== "cancelled" && status !== "no_show";
  });

  const bookingIds = bookings.map((row) => String(row.id));
  let folioRows: FolioRow[] = [];
  if (bookingIds.length) {
    const { data, error } = await admin
      .from("folio_charges")
      .select("booking_id, amount, charge_type, payment_status, payment_method")
      .in("booking_id", bookingIds);
    if (error) throw new Error(error.message);
    folioRows = (data || []) as FolioRow[];
  }

  const byBooking = new Map<string, FolioRow[]>();
  for (const row of folioRows) {
    const id = String(row.booking_id || "");
    if (!id) continue;
    const list = byBooking.get(id) || [];
    list.push(row);
    byBooking.set(id, list);
  }

  const candidates: RefundBookingCandidate[] = bookings.map((row) => {
    const lines = byBooking.get(String(row.id)) || [];
    return {
      id: String(row.id),
      checkIn: String(row.check_in || "").slice(0, 10),
      outstanding: folioPositiveOutstandingSum(asLines(lines)),
      postedToLedger: lines.some(
        (line) => String(line.payment_status || "").toLowerCase() === "posted_to_ledger",
      ),
    };
  });

  const ledger = input.guestName.trim()
    ? await fetchGuestCityLedgerAccount(admin, input.organizationId, input.guestName.trim())
    : null;
  const ledgerBalance = ledger ? Number(ledger.balance) || 0 : null;

  const plan = planGuestRefundCredit({
    explicitBookingId: input.explicitBookingId,
    bookings: candidates,
    ledgerBalance,
  });

  if (plan.action === "none") return;

  if (plan.action === "ledger") {
    if (!ledger?.id) throw new Error("City ledger account was not found for this guest");
    const next = ledgerBalanceAfterRefund(Number(ledger.balance) || 0, input.amount);
    await syncGuestCityLedgerBalances(admin, {
      organizationId: input.organizationId,
      guestName: input.guestName.trim(),
      balance: next,
      primaryAccountId: ledger.id,
    });
    return;
  }

  const lines = asLines(byBooking.get(plan.bookingId) || []);
  const hasBillLines = lines.some((line) => {
    const amount = Number(line.amount) || 0;
    const chargeType = String(line.charge_type || "").toLowerCase();
    return amount > 0 && chargeType !== "payment";
  });

  if (!hasBillLines) {
    const { data: bk, error: loadErr } = await admin
      .from("bookings")
      .select("balance, total_amount, deposit")
      .eq("id", plan.bookingId)
      .eq("organization_id", input.organizationId)
      .maybeSingle();
    if (loadErr || !bk) throw new Error(loadErr?.message || "Booking not found");
    const next = bookingColumnsAfterRefundWithoutFolio({
      balance: Number(bk.balance) || 0,
      totalAmount: Number(bk.total_amount) || 0,
      deposit: Number(bk.deposit) || 0,
      refundAmount: input.amount,
    });
    const { error: balanceErr } = await admin
      .from("bookings")
      .update({
        // Column stays >= 0 so Payments cannot record a negative receipt.
        // Over-refund credit is not representable without folio lines.
        balance: Math.max(0, next.balance),
        total_amount: next.totalAmount,
        payment_status: next.balance <= 0.005 ? "paid" : "partial",
      })
      .eq("id", plan.bookingId)
      .eq("organization_id", input.organizationId);
    if (balanceErr) throw new Error(balanceErr.message);
    return;
  }

  const nextBalance = bookingBalanceAfterRefundCredit(lines, input.amount);
  const description = `Refund — ${input.reason} (${input.refundId.slice(0, 8)})`.slice(0, 500);

  const { error: folioErr } = await insertFolioCharges(admin, [
    {
      booking_id: plan.bookingId,
      organization_id: input.organizationId,
      description,
      amount: -input.amount,
      charge_type: "payment",
      payment_method: "refund",
      payment_status: "paid",
      created_by: input.callerId,
    },
  ]);
  if (folioErr) throw new Error(folioErr.message);

  const { error: balanceErr } = await admin
    .from("bookings")
    .update({
      // Owed amount only. A negative result is guest credit on the folio line,
      // which Bill Balance and the credit pill already read.
      balance: Math.max(0, nextBalance),
      payment_status: nextBalance <= 0.005 ? "paid" : "partial",
    })
    .eq("id", plan.bookingId)
    .eq("organization_id", input.organizationId);

  if (balanceErr) {
    await admin.from("folio_charges").delete().eq("booking_id", plan.bookingId).eq("description", description);
    throw new Error(balanceErr.message);
  }
}
