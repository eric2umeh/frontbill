import type { SupabaseClient } from "@supabase/supabase-js";
import {
  billIsFullySettled,
  folioGuestCreditAmount,
  folioPositiveOutstandingSum,
  type FolioLineForBalance,
} from "@/lib/utils/booking-bill-balance";
import { insertFolioCharges } from "@/lib/utils/insert-folio-charges";
import { appendAccountToNotes } from "@/lib/payments/payment-accounts";

/**
 * City-ledger UI often auto-selects `{ id: guestId }`. That UUID is not a
 * `city_ledger_accounts` row — using it as `.eq('id', guestId)` silently
 * updates zero rows and drops the debit.
 */
export function usableCityLedgerAccountId(
  candidateId: string | null | undefined,
  guestId?: string | null,
): string | null {
  const id = String(candidateId || "").trim();
  if (!id) return null;
  if (guestId && id === guestId) return null;
  return id;
}

/**
 * Prefer outstanding debit when any row still owes; otherwise prefer the
 * largest prepaid credit (most negative). Never hide credit behind a ₦0 duplicate row.
 */
export function pickPreferredGuestLedgerAccount<
  T extends { balance?: unknown },
>(rows: T[]): T | null {
  if (!rows.length) return null;
  const withDebt = rows.filter((r) => Number(r.balance ?? 0) > 0.005);
  if (withDebt.length) {
    return withDebt.reduce((best, row) =>
      Number(row.balance ?? 0) > Number(best.balance ?? 0) ? row : best,
    );
  }
  return rows.reduce((best, row) =>
    Number(row.balance ?? 0) < Number(best.balance ?? 0) ? row : best,
  );
}

export function isGuestCityLedgerCashInDescription(
  desc: string | null | undefined,
): boolean {
  const d = (desc || "").toLowerCase();
  return (
    d.includes("city ledger") ||
    d.includes("top-up") ||
    d.includes("top up") ||
    d.includes("settlement") ||
    (d.includes("credit") && !d.includes("cashback"))
  );
}

/** Prepaid credit available for future charges (negative ledger or overpayment vs deposits). */
export function impliedGuestPrepaidCredit(args: {
  ledgerBalance: number;
  folioOutstanding: number;
  ledgerCashInTotal: number;
  depositTotal: number;
  /** Extra folio overpayment already posted (payments − charges). */
  folioCreditTotal?: number;
}): number {
  if (args.ledgerBalance < -0.005) return Math.abs(args.ledgerBalance);
  const folioCredit = Math.max(0, Number(args.folioCreditTotal ?? 0));
  if (folioCredit > 0.005) return folioCredit;
  // Cash received on city ledger beyond what was applied as booking deposits.
  const overpay =
    args.ledgerCashInTotal - Math.max(0, args.depositTotal);
  if (overpay <= 0.005) return 0;
  // If folio still shows a small debt, still keep clear prepaid overpay visible.
  return Math.max(0, overpay);
}

/**
 * Post leftover cash as a folio payment line so the bookings "paid" pill
 * can show Credit (folioGuestCreditAmount) and guest UI stays in sync.
 */
export async function postGuestPrepaidCreditToFolio(
  supabase: SupabaseClient,
  args: {
    organizationId: string;
    guestId: string;
    creditAmount: number;
    paymentMethod: string;
    userId: string;
    notes?: string;
  },
): Promise<boolean> {
  const { organizationId, guestId, creditAmount, paymentMethod, userId, notes } =
    args;
  if (creditAmount <= 0.005) return false;

  const bookings = await fetchBookingsForGuestSettlement(
    supabase,
    guestId,
    organizationId,
  );
  if (!bookings.length) return false;

  // Prefer the most recent booking (last check-in).
  const target = [...bookings].sort((a, b) =>
    String(b.check_in || "").localeCompare(String(a.check_in || "")),
  )[0];

  const { data: existing } = await supabase
    .from("folio_charges")
    .select("id, amount, description")
    .eq("booking_id", target.id)
    .ilike("description", "%Prepaid credit%")
    .limit(20);

  const alreadyPosted = (existing || []).reduce(
    (s, row) => s + Math.abs(Number(row.amount || 0)),
    0,
  );
  const need = Math.round((creditAmount - alreadyPosted) * 100) / 100;
  if (need <= 0.005) return false;

  const bookingOrgId = target.organization_id || organizationId;
  const methodLabel = paymentMethod.replace(/_/g, " ");
  const { error: payErr } = await insertFolioCharges(supabase, [
    {
      booking_id: target.id,
      organization_id: bookingOrgId,
      description: `Prepaid credit — city ledger (${methodLabel})${notes ? ` | ${notes}` : ""}`,
      amount: -need,
      charge_type: "payment",
      payment_method: paymentMethod,
      payment_status: "paid",
      created_by: userId,
    },
  ]);
  if (payErr) throw new Error(`Prepaid folio credit failed: ${payErr.message}`);

  const { data: fcAfter } = await supabase
    .from("folio_charges")
    .select("amount, charge_type, payment_status, payment_method")
    .eq("booking_id", target.id);

  const netAfter = folioPositiveOutstandingSum(mapFolioRows(fcAfter || []));
  // Negative booking.balance = folio credit available
  const bookingBalance = netAfter <= 0 ? netAfter : Math.max(0, netAfter);
  await supabase
    .from("bookings")
    .update({
      balance: bookingBalance,
      payment_status: bookingBalance > 0.005 ? "partial" : "paid",
    })
    .eq("id", target.id);

  return true;
}

export async function fetchGuestCityLedgerAccount(
  supabase: SupabaseClient,
  organizationId: string,
  guestName: string,
) {
  const rows = await fetchAllGuestCityLedgerAccounts(
    supabase,
    organizationId,
    guestName,
  );
  return pickPreferredGuestLedgerAccount(rows);
}

/**
 * If cash-in exceeds deposits while folios are clear but ledger was zeroed,
 * write the prepaid credit (negative balance) onto all matching ledger rows.
 */
/** Sum folio overpayments (payments − charges) across all guest bookings. */
export async function guestFolioCreditTotal(
  supabase: SupabaseClient,
  guestId: string,
  organizationId: string,
): Promise<number> {
  const bookings = await fetchBookingsForGuestSettlement(
    supabase,
    guestId,
    organizationId,
  );
  if (!bookings.length) return 0;

  const bookingIds = bookings.map((b) => b.id);
  const { data: charges } = await supabase
    .from("folio_charges")
    .select("booking_id, amount, charge_type, payment_status, payment_method")
    .in("booking_id", bookingIds);

  const byBooking: Record<string, FolioLineForBalance[]> = {};
  for (const c of charges || []) {
    const bid = String((c as { booking_id?: string }).booking_id || "");
    if (!bid) continue;
    if (!byBooking[bid]) byBooking[bid] = [];
    byBooking[bid].push({
      amount: (c as { amount?: unknown }).amount,
      charge_type: (c as { charge_type?: string | null }).charge_type,
      payment_status: (c as { payment_status?: string | null }).payment_status,
      payment_method: (c as { payment_method?: string | null }).payment_method,
    });
  }

  let total = 0;
  for (const bk of bookings) {
    total += folioGuestCreditAmount(byBooking[bk.id] ?? []);
  }
  return Math.round(total * 100) / 100;
}

export async function reconcileGuestPrepaidCredit(
  supabase: SupabaseClient,
  args: {
    organizationId: string;
    guestName: string;
    guestId: string;
    primaryAccountId?: string | null;
    /** When set, missing prepaid credit is also posted as a folio payment line. */
    userId?: string | null;
  },
): Promise<{ credit: number; updated: boolean }> {
  const { organizationId, guestName, guestId, primaryAccountId, userId } =
    args;
  const folioOutstanding = await guestFolioOutstandingTotal(
    supabase,
    guestId,
    organizationId,
  );
  let folioCreditTotal = await guestFolioCreditTotal(
    supabase,
    guestId,
    organizationId,
  );

  const accounts = await fetchAllGuestCityLedgerAccounts(
    supabase,
    organizationId,
    guestName,
  );
  const preferred = pickPreferredGuestLedgerAccount(accounts);
  const ledgerBalance = Number(preferred?.balance ?? 0);

  const name = guestName.trim().replace(/[%_,()]/g, " ");
  let txRows:
    | { amount?: unknown; description?: string | null; status?: string | null }[]
    | null = null;
  {
    const { data, error } = await supabase
      .from("transactions")
      .select("amount, description, status, guest_name")
      .eq("organization_id", organizationId)
      .or(`guest_name.ilike.%${name}%,description.ilike.%${name}%`)
      .limit(200);
    if (!error) {
      txRows = data;
    } else {
      const { data: fallback } = await supabase
        .from("transactions")
        .select("amount, description, status")
        .eq("organization_id", organizationId)
        .ilike("guest_name", guestName.trim())
        .limit(200);
      txRows = fallback;
    }
  }

  const ledgerCashInTotal = (txRows || [])
    .filter(
      (t) =>
        String(t.status || "").toLowerCase() !== "cancelled" &&
        isGuestCityLedgerCashInDescription(t.description),
    )
    .reduce((s, t) => s + Number(t.amount || 0), 0);

  const { data: bookingRows } = await supabase
    .from("bookings")
    .select("deposit, organization_id")
    .eq("guest_id", guestId);

  const depositTotal = (bookingRows || [])
    .filter(
      (b) =>
        !b.organization_id ||
        String(b.organization_id) === String(organizationId),
    )
    .reduce((s, b) => s + Number(b.deposit || 0), 0);

  const credit = impliedGuestPrepaidCredit({
    ledgerBalance,
    folioOutstanding,
    ledgerCashInTotal,
    depositTotal,
    folioCreditTotal,
  });

  if (credit <= 0.005) {
    return { credit: 0, updated: false };
  }

  let updated = false;

  // Ledger missing prepaid credit (common after older top-up bug zeroed the balance)
  if (ledgerBalance > -credit + 0.5) {
    await syncGuestCityLedgerBalances(supabase, {
      organizationId,
      guestName,
      balance: -credit,
      primaryAccountId: primaryAccountId ?? preferred?.id,
    });
    updated = true;
  }

  // Folio missing prepaid line — bookings "paid" pill reads folioGuestCreditAmount
  if (userId && folioCreditTotal < credit - 0.5) {
    const posted = await postGuestPrepaidCreditToFolio(supabase, {
      organizationId,
      guestId,
      creditAmount: credit,
      paymentMethod: "pos",
      userId,
      notes: "Reconciled prepaid credit",
    });
    if (posted) {
      updated = true;
      folioCreditTotal = await guestFolioCreditTotal(
        supabase,
        guestId,
        organizationId,
      );
    }
  }

  return { credit: Math.max(credit, folioCreditTotal), updated };
}

/** All individual/guest ledger rows for this name (handles duplicates / spelling variants). */
export async function fetchAllGuestCityLedgerAccounts(
  supabase: SupabaseClient,
  organizationId: string,
  guestName: string,
) {
  if (!guestName?.trim()) return [];
  const { data } = await supabase
    .from("city_ledger_accounts")
    .select("id, balance, account_name, account_type")
    .eq("organization_id", organizationId)
    .ilike("account_name", guestName.trim())
    .in("account_type", ["individual", "guest"]);
  return data || [];
}

/** Keep every name-matched guest ledger row on the same balance (avoids orphan ₦70k rows). */
export async function syncGuestCityLedgerBalances(
  supabase: SupabaseClient,
  args: {
    organizationId: string;
    guestName: string;
    balance: number;
    primaryAccountId?: string | null;
  },
): Promise<number> {
  const { organizationId, guestName, balance, primaryAccountId } = args;
  const accounts = await fetchAllGuestCityLedgerAccounts(
    supabase,
    organizationId,
    guestName,
  );
  const ids = new Set<string>();
  for (const a of accounts) ids.add(a.id);
  if (primaryAccountId) ids.add(primaryAccountId);

  if (ids.size === 0) {
    if (balance === 0) return 0;
    const { error } = await supabase.from("city_ledger_accounts").insert([
      {
        organization_id: organizationId,
        account_name: guestName.trim(),
        account_type: "individual",
        balance,
      },
    ]);
    if (error) throw new Error(`Ledger insert failed: ${error.message}`);
    return 1;
  }

  const { error } = await supabase
    .from("city_ledger_accounts")
    .update({ balance, updated_at: new Date().toISOString() })
    .in("id", [...ids]);
  if (error) throw new Error(`Ledger sync failed: ${error.message}`);
  return ids.size;
}

/**
 * Add a city-ledger debit (guest/org owes the hotel more).
 * `ledgerAccountId` is used only when it actually exists on city_ledger_accounts —
 * guest UUIDs and organization row ids must not be treated as ledger ids.
 */
export async function incrementCityLedgerDebit(
  supabase: SupabaseClient,
  args: {
    organizationId: string;
    amount: number;
    accountName: string;
    ledgerAccountId?: string | null;
    accountType?: "individual" | "organization";
  },
): Promise<string | null> {
  const amount = Number(args.amount) || 0;
  if (amount <= 0 || !args.organizationId) return null;

  const ledgerAccountId = args.ledgerAccountId || null;
  if (ledgerAccountId) {
    const { data } = await supabase
      .from("city_ledger_accounts")
      .select("id, balance")
      .eq("id", ledgerAccountId)
      .eq("organization_id", args.organizationId)
      .maybeSingle();
    if (data?.id) {
      const { error } = await supabase
        .from("city_ledger_accounts")
        .update({
          balance: (Number(data.balance) || 0) + amount,
          updated_at: new Date().toISOString(),
        })
        .eq("id", data.id);
      if (error) throw new Error(`Ledger update failed: ${error.message}`);
      return data.id;
    }
  }

  const name = String(args.accountName || "").trim();
  if (!name) return null;

  if (args.accountType === "organization") {
    const { data: existing } = await supabase
      .from("city_ledger_accounts")
      .select("id, balance")
      .eq("organization_id", args.organizationId)
      .ilike("account_name", name)
      .maybeSingle();
    if (existing?.id) {
      const { error } = await supabase
        .from("city_ledger_accounts")
        .update({
          balance: (Number(existing.balance) || 0) + amount,
          updated_at: new Date().toISOString(),
        })
        .eq("id", existing.id);
      if (error) throw new Error(`Ledger update failed: ${error.message}`);
      return existing.id;
    }
    const { data: created, error } = await supabase
      .from("city_ledger_accounts")
      .insert([
        {
          organization_id: args.organizationId,
          account_name: name,
          account_type: "organization",
          balance: amount,
        },
      ])
      .select("id")
      .single();
    if (error) throw new Error(`Ledger insert failed: ${error.message}`);
    return created?.id ?? null;
  }

  const acct = await fetchGuestCityLedgerAccount(
    supabase,
    args.organizationId,
    name,
  );
  const next = (Number(acct?.balance) || 0) + amount;
  await syncGuestCityLedgerBalances(supabase, {
    organizationId: args.organizationId,
    guestName: name,
    balance: next,
    primaryAccountId: acct?.id ?? null,
  });
  const after = await fetchGuestCityLedgerAccount(
    supabase,
    args.organizationId,
    name,
  );
  return after?.id ?? null;
}

function mapFolioRows(
  rows: {
    amount?: unknown;
    charge_type?: string | null;
    payment_status?: string | null;
    payment_method?: string | null;
  }[],
): FolioLineForBalance[] {
  return rows.map((row) => ({
    amount: row.amount,
    charge_type: row.charge_type,
    payment_status: row.payment_status,
    payment_method: row.payment_method,
  }));
}

async function fetchBookingsForGuestSettlement(
  supabase: SupabaseClient,
  guestId: string,
  organizationId: string,
) {
  const { data: byGuest } = await supabase
    .from("bookings")
    .select("id, balance, deposit, total_amount, check_in, organization_id")
    .eq("guest_id", guestId)
    .order("check_in", { ascending: true });

  const rows = byGuest || [];
  const inOrg = rows.filter(
    (b) =>
      !b.organization_id ||
      String(b.organization_id) === String(organizationId),
  );
  return inOrg.length > 0 ? inOrg : rows;
}

/** Sum unpaid folio amounts across all guest bookings (matches guest profile card). */
export async function guestFolioOutstandingTotal(
  supabase: SupabaseClient,
  guestId: string,
  _organizationId: string,
): Promise<number> {
  const bookings = await fetchBookingsForGuestSettlement(
    supabase,
    guestId,
    _organizationId,
  );
  if (!bookings.length) return 0;

  const bookingIds = bookings.map((b) => b.id);
  const { data: charges } = await supabase
    .from("folio_charges")
    .select("booking_id, amount, charge_type, payment_status, payment_method")
    .in("booking_id", bookingIds);

  const byBooking: Record<string, FolioLineForBalance[]> = {};
  for (const c of charges || []) {
    const bid = String((c as { booking_id?: string }).booking_id || "");
    if (!bid) continue;
    if (!byBooking[bid]) byBooking[bid] = [];
    byBooking[bid].push({
      amount: (c as { amount?: unknown }).amount,
      charge_type: (c as { charge_type?: string | null }).charge_type,
      payment_status: (c as { payment_status?: string | null }).payment_status,
      payment_method: (c as { payment_method?: string | null }).payment_method,
    });
  }

  let total = 0;
  for (const bk of bookings) {
    total += Math.max(0, folioPositiveOutstandingSum(byBooking[bk.id] ?? []));
  }
  return Math.round(total * 100) / 100;
}

async function markBookingFolioSettled(
  supabase: SupabaseClient,
  bookingId: string,
): Promise<void> {
  const { error } = await supabase
    .from("folio_charges")
    .update({ payment_status: "paid" })
    .eq("booking_id", bookingId)
    .gt("amount", 0)
    .not("charge_type", "eq", "payment");
  if (error) throw new Error(`Folio settle failed: ${error.message}`);
}

/** When cash received covers folio math but statuses are stale, mark lines paid and zero booking. */
async function forceClearGuestBookingFolio(
  supabase: SupabaseClient,
  bookingId: string,
  deposit: number,
): Promise<void> {
  await markBookingFolioSettled(supabase, bookingId);
  const { error } = await supabase
    .from("bookings")
    .update({
      balance: 0,
      deposit,
      payment_status: "paid",
    })
    .eq("id", bookingId);
  if (error) throw new Error(`Booking clear failed: ${error.message}`);
}

/**
 * Apply cash received against open folios (checked-out stays included).
 * Uses the same folio net rules as the guest profile "Outstanding Balance" card.
 */
export async function applyGuestSettlementToFolios(
  supabase: SupabaseClient,
  args: {
    organizationId: string;
    guestId: string;
    amount: number;
    paymentMethod: string;
    userId: string;
    notes?: string;
  },
): Promise<number> {
  const { organizationId, guestId, amount, paymentMethod, userId, notes } =
    args;
  if (amount <= 0) return 0;

  const bookings = await fetchBookingsForGuestSettlement(
    supabase,
    guestId,
    organizationId,
  );
  if (!bookings.length) return 0;

  let remaining = amount;
  let applied = 0;

  for (const bk of bookings) {
    if (remaining <= 0) break;

    const { data: fcRows } = await supabase
      .from("folio_charges")
      .select("amount, charge_type, payment_status, payment_method")
      .eq("booking_id", bk.id);

    const fcForBill = mapFolioRows(fcRows || []);
    const billBefore = Math.max(0, folioPositiveOutstandingSum(fcForBill));
    if (billBefore <= 0) continue;

    const slice = Math.min(remaining, billBefore);
    const methodLabel = paymentMethod.replace(/_/g, " ");
    const bookingOrgId = bk.organization_id || organizationId;

    const { error: payErr } = await insertFolioCharges(supabase, [
      {
        booking_id: bk.id,
        organization_id: bookingOrgId,
        description: `Payment Received - ${methodLabel}${notes ? ` | ${notes}` : ""}`,
        amount: -slice,
        charge_type: "payment",
        payment_method: paymentMethod,
        payment_status: "paid",
        created_by: userId,
      },
    ]);
    if (payErr) throw new Error(`Folio payment failed: ${payErr.message}`);

    const { data: fcAfter } = await supabase
      .from("folio_charges")
      .select("amount, charge_type, payment_status, payment_method")
      .eq("booking_id", bk.id);

    const fcAfterMapped = mapFolioRows(fcAfter || []);
    const netAfter = folioPositiveOutstandingSum(fcAfterMapped);
    const bookingBalance = Math.max(0, netAfter);

    const { error: bkErr } = await supabase
      .from("bookings")
      .update({
        balance: bookingBalance,
        deposit: Number(bk.deposit || 0) + slice,
        payment_status: bookingBalance === 0 ? "paid" : "partial",
      })
      .eq("id", bk.id);
    if (bkErr) throw new Error(`Booking update failed: ${bkErr.message}`);

    if (
      billIsFullySettled(null, fcAfterMapped) ||
      slice >= billBefore - 0.005
    ) {
      await forceClearGuestBookingFolio(
        supabase,
        bk.id,
        Number(bk.deposit || 0) + slice,
      );
    }

    remaining -= slice;
    applied += slice;
  }

  return Math.round(applied * 100) / 100;
}

/** Mark every open charge paid when settlement cash covers total folio debt but net is stuck. */
async function repairGuestFolioAfterFullSettlement(
  supabase: SupabaseClient,
  guestId: string,
  organizationId: string,
  amountPaid: number,
  folioDebtBefore: number,
): Promise<void> {
  if (amountPaid + 0.005 < folioDebtBefore) return;

  const bookings = await fetchBookingsForGuestSettlement(
    supabase,
    guestId,
    organizationId,
  );
  for (const bk of bookings) {
    const { data: fcRows } = await supabase
      .from("folio_charges")
      .select("amount, charge_type, payment_status, payment_method")
      .eq("booking_id", bk.id);
    const net = folioPositiveOutstandingSum(mapFolioRows(fcRows || []));
    if (net <= 0.005) {
      await forceClearGuestBookingFolio(
        supabase,
        bk.id,
        Number(bk.deposit || 0),
      );
      continue;
    }
    await markBookingFolioSettled(supabase, bk.id);
    const { data: fcAfter } = await supabase
      .from("folio_charges")
      .select("amount, charge_type, payment_status, payment_method")
      .eq("booking_id", bk.id);
    let netAfter = folioPositiveOutstandingSum(mapFolioRows(fcAfter || []));
    if (netAfter > 0.005) {
      const bookingOrgId = bk.organization_id || organizationId;
      const { error: payErr } = await insertFolioCharges(supabase, [
        {
          booking_id: bk.id,
          organization_id: bookingOrgId,
          description: "City ledger settlement (balance repair)",
          amount: -netAfter,
          charge_type: "payment",
          payment_method: "cash",
          payment_status: "paid",
        },
      ]);
      if (payErr)
        throw new Error(`Folio repair payment failed: ${payErr.message}`);
      netAfter = 0;
    }
    await supabase
      .from("bookings")
      .update({
        balance: Math.max(0, netAfter),
        payment_status: netAfter <= 0.005 ? "paid" : "partial",
      })
      .eq("id", bk.id);
  }
}

/**
 * Apply cash received against the guest's city ledger row.
 * Positive balance = guest owes the hotel; subtracting payment can go negative (credit).
 */
export async function applyPaymentToGuestCityLedger(
  supabase: SupabaseClient,
  args: {
    organizationId: string;
    guestName: string;
    paymentAmount: number;
    createIfMissingExcess?: number;
  },
): Promise<void> {
  const {
    organizationId,
    guestName,
    paymentAmount,
    createIfMissingExcess = 0,
  } = args;
  const P = paymentAmount;
  if (P <= 0 && createIfMissingExcess <= 0) return;

  const acct = await fetchGuestCityLedgerAccount(
    supabase,
    organizationId,
    guestName,
  );
  if (acct?.id) {
    const newBal = (Number(acct.balance) || 0) - P;
    const { error } = await supabase
      .from("city_ledger_accounts")
      .update({ balance: newBal, updated_at: new Date().toISOString() })
      .eq("id", acct.id);
    if (error) throw new Error(`Ledger update failed: ${error.message}`);
    return;
  }

  const excess = createIfMissingExcess;
  if (excess > 0) {
    const { error } = await supabase.from("city_ledger_accounts").insert([
      {
        organization_id: organizationId,
        account_name: guestName,
        account_type: "individual",
        balance: -excess,
      },
    ]);
    if (error) throw new Error(`Ledger insert failed: ${error.message}`);
  }
}

/**
 * When recording a booking folio payment: reduce ledger debit first, then post any amount over bill balance as credit.
 */
export async function applyBookingPaymentToGuestLedger(
  supabase: SupabaseClient,
  args: {
    organizationId: string;
    guestName: string;
    bookingBillBefore: number;
    paymentAmount: number;
  },
): Promise<void> {
  const { organizationId, guestName, bookingBillBefore, paymentAmount } = args;
  const P = paymentAmount;
  const B = Math.max(0, bookingBillBefore);
  if (P <= 0 || !guestName.trim()) return;

  const acct = await fetchGuestCityLedgerAccount(
    supabase,
    organizationId,
    guestName,
  );
  const L = acct?.id ? Number(acct.balance) || 0 : 0;
  const excess = Math.max(0, P - B);
  const towardDebit = Math.min(Math.max(P - excess, 0), Math.max(0, L));
  const newBal = L - towardDebit - excess;

  if (acct?.id) {
    const { error } = await supabase
      .from("city_ledger_accounts")
      .update({ balance: newBal, updated_at: new Date().toISOString() })
      .eq("id", acct.id);
    if (error) throw new Error(`Ledger update failed: ${error.message}`);
    return;
  }

  if (newBal >= 0) return;
  const { error } = await supabase.from("city_ledger_accounts").insert([
    {
      organization_id: organizationId,
      account_name: guestName,
      account_type: "individual",
      balance: newBal,
    },
  ]);
  if (error) throw new Error(`Ledger insert failed: ${error.message}`);
}

/**
 * Record money-in on a guest city ledger (settle / add credit from guest profile or booking UI).
 * Settlements also post to folio charges so guest outstanding balance clears in the UI.
 */
export async function recordGuestLedgerCashMovement(
  supabase: SupabaseClient,
  p: {
    organizationId: string;
    accountName: string;
    guestId: string | null;
    amount: number;
    paymentMethod: string;
    notes?: string;
    transactionType: string;
    userId: string;
    ledgerAccountId: string | null;
    currentLedgerBalance: number;
    syncGuestProfile: boolean;
    payment_account_id?: string | null;
    payment_account_label?: string | null;
  },
): Promise<void> {
  const {
    organizationId,
    accountName,
    guestId,
    amount,
    paymentMethod,
    notes,
    transactionType,
    userId,
    ledgerAccountId,
    currentLedgerBalance,
    syncGuestProfile,
    payment_account_id = null,
    payment_account_label = null,
  } = p;
  if (amount <= 0) return;

  /** Top-up and settle both apply cash toward open folios when guest-synced. */
  const applyTowardFolios = syncGuestProfile && Boolean(guestId);

  const folioBefore = applyTowardFolios
    ? await guestFolioOutstandingTotal(supabase, guestId!, organizationId)
    : 0;

  if (applyTowardFolios && guestId) {
    await applyGuestSettlementToFolios(supabase, {
      organizationId,
      guestId,
      amount,
      paymentMethod,
      userId,
      notes,
    });
  }

  let folioRemaining = applyTowardFolios
    ? await guestFolioOutstandingTotal(supabase, guestId!, organizationId)
    : null;

  if (
    applyTowardFolios &&
    guestId &&
    folioBefore > 0.005 &&
    folioRemaining != null &&
    folioRemaining > 0.005 &&
    amount + 0.005 >= folioBefore
  ) {
    await repairGuestFolioAfterFullSettlement(
      supabase,
      guestId,
      organizationId,
      amount,
      folioBefore,
    );
    folioRemaining = await guestFolioOutstandingTotal(
      supabase,
      guestId,
      organizationId,
    );
  }

  // Negative balance = prepaid credit the guest can use later.
  let finalLedgerBalance: number;
  if (folioRemaining != null && folioRemaining > 0.005) {
    // Partial payment — ledger tracks remaining folio debt.
    finalLedgerBalance = folioRemaining;
  } else if (folioBefore <= 0.005 && currentLedgerBalance > 0.005) {
    // Folio already clear; cash reduces ledger-only debit (may go into credit).
    finalLedgerBalance = currentLedgerBalance - amount;
  } else {
    // Folios cleared by this payment — leftover cash becomes credit.
    const credit = Math.max(0, amount - Math.max(0, folioBefore));
    finalLedgerBalance = -credit;
  }

  await syncGuestCityLedgerBalances(supabase, {
    organizationId,
    guestName: accountName,
    balance: finalLedgerBalance,
    primaryAccountId: ledgerAccountId,
  });

  // Leftover cash → folio prepaid line so bookings list shows Credit under paid.
  if (applyTowardFolios && guestId && finalLedgerBalance < -0.005) {
    await postGuestPrepaidCreditToFolio(supabase, {
      organizationId,
      guestId,
      creditAmount: Math.abs(finalLedgerBalance),
      paymentMethod,
      userId,
      notes,
    });
  }

  const txId = `CLG-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  const accountFields = {
    payment_account_id: payment_account_id || null,
    payment_account_label: payment_account_label || null,
  };
  const { error: txError } = await supabase.from("transactions").insert([
    {
      organization_id: organizationId,
      booking_id: null,
      transaction_id: txId,
      guest_name: accountName,
      room: null,
      amount,
      payment_method: paymentMethod,
      status: "paid",
      description: appendAccountToNotes(
        `${transactionType} — ${accountName}${notes ? ` | ${notes}` : ""}`,
        accountFields.payment_account_label,
      ),
      received_by: userId,
      ...accountFields,
    },
  ]);
  if (txError) throw new Error(`Transaction insert failed: ${txError.message}`);
}

export type RepairStaleGuestDebtResult = {
  folio_before: number;
  folio_after: number;
  bookings_touched: number;
  ledger_accounts_synced: number;
};

/**
 * Admin repair: mark stale folio lines paid, zero bookings/ledger/guest balance.
 * Use when Settle records transactions but UI debt from an old checkout remains.
 */
export async function repairStaleGuestDebt(
  supabase: SupabaseClient,
  args: {
    organizationId: string;
    guestId: string;
    guestName: string;
  },
): Promise<RepairStaleGuestDebtResult> {
  const { organizationId, guestId, guestName } = args;
  const folioBefore = await guestFolioOutstandingTotal(
    supabase,
    guestId,
    organizationId,
  );

  const bookings = await fetchBookingsForGuestSettlement(
    supabase,
    guestId,
    organizationId,
  );

  for (const bk of bookings) {
    await markBookingFolioSettled(supabase, bk.id);

    const { data: fcRows } = await supabase
      .from("folio_charges")
      .select("amount, charge_type, payment_status, payment_method")
      .eq("booking_id", bk.id);

    let net = folioPositiveOutstandingSum(mapFolioRows(fcRows || []));
    if (net > 0.005) {
      const bookingOrgId = bk.organization_id || organizationId;
      const { error: payErr } = await insertFolioCharges(supabase, [
        {
          booking_id: bk.id,
          organization_id: bookingOrgId,
          description: "Balance repair — stale folio cleared",
          amount: -net,
          charge_type: "payment",
          payment_method: "cash",
          payment_status: "paid",
        },
      ]);
      if (payErr)
        throw new Error(`Folio repair payment failed: ${payErr.message}`);
      net = 0;
    }

    const { error: bkErr } = await supabase
      .from("bookings")
      .update({
        balance: Math.max(0, net),
        payment_status: "paid",
      })
      .eq("id", bk.id);
    if (bkErr) throw new Error(`Booking repair failed: ${bkErr.message}`);
  }

  const folioAfter = await guestFolioOutstandingTotal(
    supabase,
    guestId,
    organizationId,
  );
  const targetLedger = Math.max(0, folioAfter);

  const ledger_accounts_synced = await syncGuestCityLedgerBalances(supabase, {
    organizationId,
    guestName,
    balance: targetLedger,
  });

  return {
    folio_before: folioBefore,
    folio_after: folioAfter,
    bookings_touched: bookings.length,
    ledger_accounts_synced,
  };
}
