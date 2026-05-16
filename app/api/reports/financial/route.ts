import { createAdminClient } from "@/lib/supabase/admin";
import { NextResponse } from "next/server";
import { canonicalRoleKey } from "@/lib/permissions";
import {
  eachDayOfInterval,
  format,
  parseISO,
  startOfDay,
  endOfDay,
} from "date-fns";
import {
  resolveRevenueCategory,
  type RevenueDepartment,
} from "@/lib/reports/revenue-category";
import { ensureExpenseCategories } from "@/lib/expenses/seed-categories";
import {
  buildDailyExpenditurePayload,
  buildProfitAndLossPayload,
} from "@/lib/expenses/reports";

const VAT_RATE = 0.075;

function ymd(d: Date) {
  return format(d, "yyyy-MM-dd");
}

function isYmd(s: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(s);
}

function allowedReportsRole(role: string | null | undefined): boolean {
  const k = canonicalRoleKey(role);
  return (
    k === "superadmin" ||
    k === "admin" ||
    k === "manager" ||
    k === "accountant" ||
    k === "front_desk" ||
    k === "auditor"
  );
}

function dayInStay(checkIn: string, checkOut: string, dayYmd: string): boolean {
  return checkIn <= dayYmd && checkOut > dayYmd;
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const callerId = searchParams.get("caller_id");
    const start = searchParams.get("start_date") || "";
    const end = searchParams.get("end_date") || "";
    const report = searchParams.get("report") || "daily_revenue";
    const department = (searchParams.get("department") || "all").toLowerCase();

    if (!callerId) {
      return NextResponse.json(
        { error: "caller_id is required" },
        { status: 400 },
      );
    }
    if (!isYmd(start) || !isYmd(end)) {
      return NextResponse.json(
        { error: "start_date and end_date must be YYYY-MM-DD" },
        { status: 400 },
      );
    }
    if (start > end) {
      return NextResponse.json(
        { error: "start_date must be on or before end_date" },
        { status: 400 },
      );
    }

    const admin = createAdminClient();
    const { data: prof, error: pe } = await admin
      .from("profiles")
      .select("organization_id, role")
      .eq("id", callerId)
      .single();
    if (pe || !prof?.organization_id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    if (!allowedReportsRole(prof.role)) {
      return NextResponse.json(
        { error: "You do not have access to this report" },
        { status: 403 },
      );
    }

    const orgId = prof.organization_id;
    const startD = startOfDay(parseISO(start));
    const endD = endOfDay(parseISO(end));

    if (report === "occupancy") {
      const { data: rooms, error: re } = await admin
        .from("rooms")
        .select("id, room_type, status")
        .eq("organization_id", orgId);
      if (re) return NextResponse.json({ error: re.message }, { status: 500 });
      const roomList = rooms || [];
      const totalRooms = roomList.length;
      const ooo = roomList.filter(
        (r: any) => String(r.status || "").toLowerCase() === "maintenance",
      ).length;
      const sellable = Math.max(0, totalRooms - ooo);

      const { data: bookings, error: be } = await admin
        .from("bookings")
        .select("id, room_id, check_in, check_out, status")
        .eq("organization_id", orgId)
        .in("status", ["checked_in", "confirmed", "reserved"]);
      if (be) return NextResponse.json({ error: be.message }, { status: 500 });

      const days = eachDayOfInterval({ start: startD, end: endD });
      const byDay = days.map((day) => {
        const d = ymd(day);
        const occupiedIds = new Set<string>();
        for (const b of bookings || []) {
          const cin = String((b as any).check_in || "").slice(0, 10);
          const cout = String((b as any).check_out || "").slice(0, 10);
          if (dayInStay(cin, cout, d) && (b as any).room_id) {
            occupiedIds.add((b as any).room_id);
          }
        }
        const occ = occupiedIds.size;
        const denom = sellable > 0 ? sellable : 1;
        const rate = sellable > 0 ? (occ / denom) * 100 : 0;
        return {
          date: d,
          occupiedRooms: occ,
          unoccupiedSellable: Math.max(0, sellable - occ),
          outOfOrderRooms: ooo,
          totalRooms,
          sellableRooms: sellable,
          occupancyPercent: Number(rate.toFixed(2)),
        };
      });

      const last = byDay[byDay.length - 1];
      return NextResponse.json({
        report: "occupancy",
        summary: {
          totalRooms: last?.totalRooms ?? 0,
          outOfOrderRooms: last?.outOfOrderRooms ?? 0,
          sellableRooms: last?.sellableRooms ?? 0,
          periodEndOccupied: last?.occupiedRooms ?? 0,
          periodEndRatePercent: last?.occupancyPercent ?? 0,
        },
        byDay,
      });
    }

    if (report === "daily_revenue") {
      const { data: bookings, error: be } = await admin
        .from("bookings")
        .select("id, check_in, check_out, status, rate_per_night")
        .eq("organization_id", orgId)
        .in("status", ["checked_in", "confirmed"]);
      if (be) return NextResponse.json({ error: be.message }, { status: 500 });

      const { data: allBookingIds } = await admin
        .from("bookings")
        .select("id")
        .eq("organization_id", orgId);
      const ids = (allBookingIds || []).map((r: any) => r.id);
      const filteredCharges: any[] = [];
      const chunk = 120;
      for (let i = 0; i < ids.length; i += chunk) {
        const slice = ids.slice(i, i + chunk);
        if (!slice.length) break;
        const { data: part, error: ce } = await admin
          .from("folio_charges")
          .select(
            "id, booking_id, amount, charge_type, description, revenue_category, created_at",
          )
          .in("booking_id", slice);
        if (ce)
          return NextResponse.json({ error: ce.message }, { status: 500 });
        filteredCharges.push(...(part || []));
      }

      return NextResponse.json(
        buildDailyRevenuePayload(
          filteredCharges,
          bookings || [],
          startD,
          endD,
          department,
        ),
      );
    }

    if (report === "sales_collection") {
      const { data: payments, error: payE } = await admin
        .from("payments")
        .select("id, amount, payment_date, booking_id, guest_id, notes")
        .eq("organization_id", orgId)
        .gte("payment_date", startD.toISOString())
        .lte("payment_date", endD.toISOString());
      if (payE)
        return NextResponse.json({ error: payE.message }, { status: 500 });

      let refunds: any[] = [];
      const { data: rf, error: rfE } = await admin
        .from("refunds")
        .select("id, amount, refund_date")
        .eq("organization_id", orgId)
        .gte("refund_date", start)
        .lte("refund_date", end);
      if (!rfE) refunds = rf || [];

      const { data: txrows, error: txE } = await admin
        .from("transactions")
        .select("id, amount, created_at, description, booking_id, status")
        .eq("organization_id", orgId)
        .gte("created_at", startD.toISOString())
        .lte("created_at", endD.toISOString());
      if (txE)
        return NextResponse.json({ error: txE.message }, { status: 500 });

      const classifyPay = (p: any): RevenueDepartment => {
        if (p.booking_id) return "accommodation";
        return resolveRevenueCategory(null, "charge", String(p.notes || ""));
      };

      const classifyTx = (desc: string | null | undefined): RevenueDepartment =>
        resolveRevenueCategory(null, "charge", desc || "");

      let paySum = 0;
      for (const p of payments || []) {
        const amt = Number((p as any).amount) || 0;
        if (amt <= 0) continue;
        const cat = classifyPay(p);
        if (department === "all" || department === cat) paySum += amt;
      }

      let txSum = 0;
      for (const t of txrows || []) {
        const st = String((t as any).status || "").toLowerCase();
        if (st === "void" || st === "cancelled") continue;
        const amt = Number((t as any).amount) || 0;
        if (amt <= 0) continue;
        const cat = classifyTx((t as any).description);
        if (department === "all" || department === cat) txSum += amt;
      }

      const refundTotal = (refunds || []).reduce(
        (s, r) => s + Number((r as any).amount || 0),
        0,
      );
      const gross = paySum + txSum;
      const net = gross - refundTotal;

      return NextResponse.json({
        report: "sales_collection",
        department,
        paymentsTotal: paySum,
        transactionsTotal: txSum,
        grossInflows: gross,
        refundsTotal: refundTotal,
        netSalesCollection: net,
        note: "Sales collection = sum of payments and transaction receipts in the period minus refunds. Revenue (earned) is reported separately under Daily revenue.",
      });
    }

    if (report === "charge_summary") {
      const { data: bookRows } = await admin
        .from("bookings")
        .select("id, check_in, check_out, status, rate_per_night")
        .eq("organization_id", orgId)
        .in("status", ["checked_in", "confirmed"]);

      const ids = (bookRows || []).map((r: any) => r.id);
      const charges: any[] = [];
      const chunk = 120;
      for (let i = 0; i < ids.length; i += chunk) {
        const slice = ids.slice(i, i + chunk);
        if (!slice.length) break;
        const { data: part, error: ce } = await admin
          .from("folio_charges")
          .select(
            "amount, charge_type, description, revenue_category, created_at, booking_id",
          )
          .in("booking_id", slice);
        if (ce)
          return NextResponse.json({ error: ce.message }, { status: 500 });
        charges.push(...(part || []));
      }

      const buckets: Record<RevenueDepartment, number> = {
        accommodation: 0,
        restaurant: 0,
        bar: 0,
        laundry: 0,
        swimming: 0,
        gym: 0,
        hall_rebecca: 0,
        hall_floxy: 0,
        hall_board_room: 0,
        events: 0,
        other: 0,
      };

      let accrualAccommodation = 0;
      const dayList = eachDayOfInterval({ start: startD, end: endD });
      for (const day of dayList) {
        const d = ymd(day);
        for (const b of bookRows || []) {
          const cin = String((b as any).check_in || "").slice(0, 10);
          const cout = String((b as any).check_out || "").slice(0, 10);
          if (!dayInStay(cin, cout, d)) continue;
          accrualAccommodation += Number((b as any).rate_per_night) || 0;
        }
      }
      if (department === "all" || department === "accommodation") {
        buckets.accommodation += accrualAccommodation;
      }

      for (const c of charges) {
        const ct = String(c.charge_type || "").toLowerCase();
        if (ct === "payment" || ct === "folio_note") continue;
        // Nightly room posting duplicates booking accrual — count extensions only toward folio accommodation extras
        if (ct === "room_charge" || ct === "reservation") continue;
        const created = c.created_at;
        if (!created) continue;
        const cd = format(parseISO(String(created)), "yyyy-MM-dd");
        if (cd < start || cd > end) continue;
        const cat = resolveRevenueCategory(
          c.revenue_category,
          c.charge_type,
          c.description,
        );
        const targetCat = ct === "extended_stay" ? "accommodation" : cat;
        if (department !== "all" && targetCat !== department) continue;
        const amt = Number(c.amount) || 0;
        if (amt <= 0) continue;
        buckets[targetCat] += amt;
      }

      return NextResponse.json({
        report: "charge_summary",
        department,
        buckets,
        accommodationNightAccrual: accrualAccommodation,
        hallNote:
          "Halls (Rebecca, Floxy, Board Room): tag folio lines via description or optional revenue_category on folio_charges. Hall-only guests without a room booking will use a dedicated hall folio in a future release.",
      });
    }

    if (report === "daily_expenditure" || report === "expenditure_summary") {
      await ensureExpenseCategories(admin, orgId);

      const { data: categories } = await admin
        .from("expense_categories")
        .select("id, code, name, sort_order")
        .eq("organization_id", orgId)
        .eq("is_active", true)
        .order("sort_order");

      const { data: entries, error: exErr } = await admin
        .from("expense_entries")
        .select("expense_date, category_id, amount, description")
        .eq("organization_id", orgId)
        .gte("expense_date", start)
        .lte("expense_date", end);

      if (exErr) return NextResponse.json({ error: exErr.message }, { status: 500 });

      const { data: dayNotes } = await admin
        .from("expense_day_notes")
        .select("expense_date, description")
        .eq("organization_id", orgId)
        .gte("expense_date", start)
        .lte("expense_date", end);

      const payload = buildDailyExpenditurePayload(
        (categories || []) as any[],
        (entries || []) as any[],
        (dayNotes || []) as any[],
        startD,
        endD,
      );

      if (report === "expenditure_summary") {
        return NextResponse.json({
          report: "expenditure_summary",
          categoryTotals: payload.categoryTotals,
          grandTotal: payload.grandTotal,
          categories: payload.categories,
        });
      }

      return NextResponse.json(payload);
    }

    if (report === "profit_and_loss") {
      await ensureExpenseCategories(admin, orgId);

      const { data: bookings, error: be } = await admin
        .from("bookings")
        .select("id, check_in, check_out, status, rate_per_night")
        .eq("organization_id", orgId)
        .in("status", ["checked_in", "confirmed"]);
      if (be) return NextResponse.json({ error: be.message }, { status: 500 });

      const { data: allBookingIds } = await admin
        .from("bookings")
        .select("id")
        .eq("organization_id", orgId);
      const ids = (allBookingIds || []).map((r: any) => r.id);
      const filteredCharges: any[] = [];
      const chunk = 120;
      for (let i = 0; i < ids.length; i += chunk) {
        const slice = ids.slice(i, i + chunk);
        if (!slice.length) break;
        const { data: part, error: ce } = await admin
          .from("folio_charges")
          .select("amount, charge_type, description, revenue_category, created_at")
          .in("booking_id", slice);
        if (ce) return NextResponse.json({ error: ce.message }, { status: 500 });
        filteredCharges.push(...(part || []));
      }

      const revPayload = buildDailyRevenuePayload(
        filteredCharges,
        bookings || [],
        startD,
        endD,
        "all",
      );

      const { data: expenseEntries } = await admin
        .from("expense_entries")
        .select("category_id, amount")
        .eq("organization_id", orgId)
        .gte("expense_date", start)
        .lte("expense_date", end);

      const { data: expenseCats } = await admin
        .from("expense_categories")
        .select("id, name")
        .eq("organization_id", orgId)
        .eq("is_active", true);

      const year = parseISO(start).getFullYear();
      const month = parseISO(start).getMonth() + 1;
      const { data: budgets } = await admin
        .from("expense_budgets")
        .select("category_id, amount_limit")
        .eq("organization_id", orgId)
        .eq("budget_year", year)
        .eq("budget_month", month);

      const spentByCat: Record<string, number> = {};
      for (const e of expenseEntries || []) {
        const cid = (e as any).category_id;
        spentByCat[cid] = (spentByCat[cid] || 0) + (Number((e as any).amount) || 0);
      }

      const budgetMap = new Map(
        (budgets || []).map((b: any) => [b.category_id, Number(b.amount_limit) || 0]),
      );

      const categoryBreakdown = (expenseCats || []).map((c: any) => ({
        id: c.id,
        name: c.name,
        amount: spentByCat[c.id] || 0,
        budget: budgetMap.get(c.id) ?? null,
      })).filter((x) => x.amount > 0 || (x.budget != null && x.budget > 0));

      categoryBreakdown.sort((a, b) => b.amount - a.amount);

      const expenseGrandTotal = Object.values(spentByCat).reduce((s, v) => s + v, 0);

      const budgetAlerts: {
        category_id: string
        name: string
        spent: number
        budget: number
        percent: number
      }[] = [];

      for (const c of expenseCats || []) {
        const spent = spentByCat[(c as any).id] || 0;
        const budget = budgetMap.get((c as any).id);
        if (budget == null || budget <= 0) continue;
        const percent = Number(((spent / budget) * 100).toFixed(1));
        if (percent >= 90) {
          budgetAlerts.push({
            category_id: (c as any).id,
            name: (c as any).name,
            spent,
            budget,
            percent,
          });
        }
      }
      budgetAlerts.sort((a, b) => b.percent - a.percent);

      const { data: payments } = await admin
        .from("payments")
        .select("amount")
        .eq("organization_id", orgId)
        .gte("payment_date", startD.toISOString())
        .lte("payment_date", endD.toISOString());

      const { data: txrows } = await admin
        .from("transactions")
        .select("amount, status")
        .eq("organization_id", orgId)
        .gte("created_at", startD.toISOString())
        .lte("created_at", endD.toISOString());

      let refunds: any[] = [];
      const { data: rf } = await admin
        .from("refunds")
        .select("amount")
        .eq("organization_id", orgId)
        .gte("refund_date", start)
        .lte("refund_date", end);
      refunds = rf || [];

      let paySum = 0;
      for (const p of payments || []) {
        const amt = Number((p as any).amount) || 0;
        if (amt > 0) paySum += amt;
      }
      let txSum = 0;
      for (const t of txrows || []) {
        const st = String((t as any).status || "").toLowerCase();
        if (st === "void" || st === "cancelled") continue;
        const amt = Number((t as any).amount) || 0;
        if (amt > 0) txSum += amt;
      }
      const refundTotal = (refunds || []).reduce(
        (s, r) => s + Number((r as any).amount || 0),
        0,
      );
      const salesCollectionNet = paySum + txSum - refundTotal;

      return NextResponse.json(
        buildProfitAndLossPayload(
          revPayload.periodTotals.subtotal,
          revPayload.periodTotals.vat,
          revPayload.periodTotals.withVat,
          salesCollectionNet,
          expenseGrandTotal,
          categoryBreakdown,
          budgetAlerts,
        ),
      );
    }

    return NextResponse.json({ error: "Unknown report" }, { status: 400 });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

function buildDailyRevenuePayload(
  charges: any[],
  bookings: any[],
  startD: Date,
  endD: Date,
  department: string,
) {
  const dep = department === "all" ? "all" : department;
  const days = eachDayOfInterval({ start: startD, end: endD });
  const byDay = days.map((day) => {
    const d = ymd(day);
    let accommodation = 0;
    for (const b of bookings) {
      const cin = String(b.check_in || "").slice(0, 10);
      const cout = String(b.check_out || "").slice(0, 10);
      if (!dayInStay(cin, cout, d)) continue;
      accommodation += Number(b.rate_per_night) || 0;
    }
    if (dep !== "all" && dep !== "accommodation") {
      accommodation = 0;
    }

    let chargesDay = 0;
    const catParts: Record<string, number> = {};
    for (const c of charges) {
      const ct = String(c.charge_type || "").toLowerCase();
      if (ct === "payment" || ct === "folio_note") continue;
      const amt = Number(c.amount) || 0;
      if (amt <= 0) continue;
      const created = c.created_at;
      if (!created) continue;
      const cd = format(parseISO(String(created)), "yyyy-MM-dd");
      if (cd !== d) continue;
      const cat = resolveRevenueCategory(
        c.revenue_category,
        c.charge_type,
        c.description,
      );
      const isRoomLine =
        ["room_charge", "extended_stay", "reservation"].includes(ct) ||
        cat === "accommodation";
      if (dep === "accommodation" && !isRoomLine) continue;
      if (dep !== "all" && dep !== "accommodation" && cat !== dep) continue;
      chargesDay += amt;
      catParts[cat] = (catParts[cat] || 0) + amt;
    }

    const subtotal = accommodation + chargesDay;
    const vat = subtotal * VAT_RATE;
    const totalWithVat = subtotal + vat;

    return {
      date: d,
      accommodationAccrual: accommodation,
      folioChargesRecognized: chargesDay,
      subtotal,
      vatRatePercent: VAT_RATE * 100,
      vatAmount: vat,
      totalWithVat,
      chargeCategories: catParts,
    };
  });

  const totals = byDay.reduce(
    (acc, row) => {
      acc.subtotal += row.subtotal;
      acc.vat += row.vatAmount;
      acc.withVat += row.totalWithVat;
      acc.accommodation += row.accommodationAccrual;
      acc.charges += row.folioChargesRecognized;
      return acc;
    },
    { subtotal: 0, vat: 0, withVat: 0, accommodation: 0, charges: 0 },
  );

  return {
    report: "daily_revenue",
    department: dep,
    vatNote:
      "VAT 7.5% is applied on top of the daily subtotal (room-rate accrual for in-house nights plus folio charges posted that day).",
    byDay,
    periodTotals: totals,
  };
}
