import { endOfWeek, format, startOfWeek } from "date-fns";

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
  return ["disbursed", "retirement_pending", "retired"].includes(status);
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
