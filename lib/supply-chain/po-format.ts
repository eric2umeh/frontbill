import { endOfWeek, format, startOfWeek } from "date-fns";
import type { PurchaseOrder, RetirementLine } from "./types";

/** ISO week number (1–53) for purchase order numbering. */
export function isoWeekNumber(date = new Date()): number {
  const d = new Date(
    Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()),
  );
  const day = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
}

export function formatPurchaseOrderNumber(date = new Date()): string {
  const year = date.getFullYear();
  const week = String(isoWeekNumber(date)).padStart(2, "0");
  return `PO-W${year}-${week}`;
}

/**
 * Procurement week label (Mon–Sun in hotel local time), aligned with PO-W{year}-{week}.
 * This is not the send date — use `formatPoRaisedAt` for when the PO was submitted.
 */
export function formatPurchaseWeekLabel(date = new Date()): string {
  const monday = startOfWeek(date, { weekStartsOn: 1 });
  const sunday = endOfWeek(date, { weekStartsOn: 1 });
  return `Week of ${format(monday, "d MMM yyyy")} – ${format(sunday, "d MMM yyyy")}`;
}

/** When the store sent / raised the PO (local date & time). */
export function formatPoRaisedAt(iso: string): string {
  try {
    return format(new Date(iso), "d MMM yyyy, h:mm a");
  } catch {
    return iso.slice(0, 10);
  }
}

/** POs that finished approval and left the store draft queue. */
export function isPurchaseOrderHistoryStatus(status: string): boolean {
  return [
    "disbursed",
    "retirement_pending",
    "retirement_pending_accountant",
    "retired",
  ].includes(status);
}

/** Lines to show in PO history — retirement snapshot when available. */
export function getPoHistoryLines(po: PurchaseOrder): {
  mode: "order" | "retirement";
  lines: Array<{
    id: string;
    name: string;
    quantity: number;
    unit: string;
    unitPrice: number;
    lineTotal: number;
    notBought?: boolean;
  }>;
} {
  const retirement = po.retirement?.lines;
  const useRetirement =
    retirement?.length &&
    [
      "retirement_pending_accountant",
      "retirement_rejected",
      "retired",
      "retirement_pending",
    ].includes(po.status);

  if (useRetirement && retirement) {
    return {
      mode: "retirement",
      lines: retirement.map((rl: RetirementLine) => {
        const notBought = rl.notBought === true || rl.removed === true;
        const poLine = po.lines.find((l) => l.id === rl.lineId);
        return {
          id: rl.lineId,
          name: rl.name,
          quantity: notBought ? rl.quantityOrdered : rl.quantityBought,
          unit: poLine?.unit ?? "",
          unitPrice: notBought ? rl.poPrice : rl.actualPrice,
          lineTotal: notBought ? 0 : rl.totalPaid,
          notBought,
        };
      }),
    };
  }

  return {
    mode: "order",
    lines: po.lines.map((line) => ({
      id: line.id,
      name: line.name,
      quantity: line.quantityOrdered,
      unit: line.unit,
      unitPrice: line.unitPrice,
      lineTotal: line.lineTotal,
    })),
  };
}

/** POs the purchaser can retire at market (cash already disbursed). */
export function isPurchasingRetireCandidate(status: string): boolean {
  return ["disbursed", "approved", "retirement_pending", "retirement_rejected"].includes(
    status,
  );
}

/** Retirement submitted — awaiting accountant sign-off. */
export function isPurchasingRetirementInReview(status: string): boolean {
  return status === "retirement_pending_accountant";
}

/** Fully retired POs for purchaser history. */
export function isPurchasingRetiredHistory(status: string): boolean {
  return status === "retired";
}

/** POs still in the approval workflow (not draft, not yet at market). */
export function isPurchaseOrderInFlightStatus(status: string): boolean {
  return [
    "pending_accountant",
    "pending_manager",
    "accountant_rejected",
    "manager_rejected",
    "approved",
  ].includes(status);
}
