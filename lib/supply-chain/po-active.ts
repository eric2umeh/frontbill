import type {
  BasketLine,
  PoLine,
  PoOrigin,
  PoStatus,
  PurchaseOrder,
  StoreItem,
} from "./types";
import { storeItemDepartments } from "./types";
import { canonicalRoleKey } from "@/lib/permissions";

/** PO still in the store / accounting pipeline (only one store draft at a time; kitchen may coexist). */
export function isActiveStorePurchaseOrderStatus(status: PoStatus): boolean {
  return status !== "retired";
}

export function poOriginOf(po: PurchaseOrder | undefined | null): PoOrigin {
  return po?.origin === "kitchen" ? "kitchen" : "store";
}

/** Roles that may mutate PO / retirement lines without bouncing the workflow. */
export function canPrivilegeMutateSupplyPo(
  userRole: string | null | undefined,
): boolean {
  const key = canonicalRoleKey(userRole);
  return (
    key === "purchaser" ||
    key === "store" ||
    key === "auditor" ||
    key === "admin" ||
    key === "superadmin" ||
    key === "accountant" ||
    key === "manager"
  );
}

/**
 * Who may add/edit/delete lines on this PO (or create a new draft).
 * Privileged roles may edit while awaiting accountant / store review.
 * Chef may only edit kitchen draft / accountant_rejected.
 */
export function canMutatePurchaseOrder(
  po: PurchaseOrder | undefined,
  userRole: string | null | undefined,
): boolean {
  const key = canonicalRoleKey(userRole);
  if (!po) {
    return (
      canPrivilegeMutateSupplyPo(userRole) ||
      key === "chef" ||
      hasStoreRaiseRole(userRole)
    );
  }

  const origin = poOriginOf(po);

  if (key === "chef") {
    return (
      origin === "kitchen" &&
      (po.status === "draft" ||
        po.status === "accountant_rejected" ||
        po.status === "manager_rejected")
    );
  }

  if (canPrivilegeMutateSupplyPo(userRole)) {
    return [
      "draft",
      "pending_store",
      "pending_accountant",
      "accountant_rejected",
      "manager_rejected",
      "pending_manager",
      "retirement_pending_accountant",
      "retirement_rejected",
    ].includes(po.status);
  }

  // Store / purchaser: edit only while drafting, at store review, or after rejection.
  if (key === "store" || key === "purchaser") {
    return (
      po.status === "draft" ||
      po.status === "accountant_rejected" ||
      po.status === "manager_rejected" ||
      po.status === "pending_store" ||
      po.status === "retirement_rejected"
    );
  }

  return false;
}

function hasStoreRaiseRole(userRole: string | null | undefined): boolean {
  const key = canonicalRoleKey(userRole);
  return key === "store" || key === "purchaser" || key === "admin" || key === "superadmin";
}

/**
 * Store / kitchen cart may edit lines in these statuses.
 * Not while awaiting accountant — that queue is locked until accept/reject.
 */
export function canEditStorePurchaseOrder(
  po: PurchaseOrder | undefined,
): boolean {
  if (!po) return true;
  return (
    po.status === "draft" ||
    po.status === "accountant_rejected" ||
    po.status === "manager_rejected" ||
    po.status === "pending_store" ||
    po.status === "retirement_rejected"
  );
}

/** Delete only while drafting or after a rejection returns the list for editing. */
export function canDeleteStorePurchaseOrder(
  po: PurchaseOrder | undefined,
  userRole?: string | null,
): boolean {
  if (!po) return false;
  const deletable = [
    "draft",
    "accountant_rejected",
    "manager_rejected",
    "retirement_rejected",
  ].includes(po.status);
  if (!deletable) return false;
  if (userRole != null) return canMutatePurchaseOrder(po, userRole);
  return true;
}

export function isPurchaseOrderAwaitingAccountant(
  po: PurchaseOrder | undefined,
): boolean {
  return po?.status === "pending_accountant";
}

export function isPurchaseOrderAwaitingStore(
  po: PurchaseOrder | undefined,
): boolean {
  return po?.status === "pending_store";
}

/** Store draft list visible on Purchase orders tab (until accountant accepts). */
export function showsStoreDraftPurchaseList(
  po: PurchaseOrder | undefined,
): boolean {
  if (!po) return true;
  return (
    po.status === "draft" ||
    po.status === "pending_store" ||
    po.status === "pending_accountant" ||
    po.status === "accountant_rejected" ||
    po.status === "manager_rejected"
  );
}

export function poLinesToBasketLines(lines: PoLine[]): BasketLine[] {
  return lines.map((l) => ({
    stockItemId: l.stockItemId,
    name: l.name,
    dept: l.dept,
    unit: l.unit,
    qtyToBuy: l.quantityOrdered,
    unitPrice: l.unitPrice,
    storeUnit: l.storeUnit ?? l.unit,
    storeQtyToBuy: l.stockQuantityOrdered ?? l.quantityOrdered,
    storeUnitPrice: l.stockUnitPrice ?? l.unitPrice,
  }));
}

export function basketLineToPoLine(line: BasketLine, lineId?: string): PoLine {
  return {
    id: lineId ?? `pol-${line.stockItemId}`,
    stockItemId: line.stockItemId,
    name: line.name,
    dept: line.dept,
    unit: line.unit,
    quantityOrdered: line.qtyToBuy,
    unitPrice: line.unitPrice,
    storeUnit: line.storeUnit ?? line.unit,
    stockQuantityOrdered: line.storeQtyToBuy ?? line.qtyToBuy,
    stockUnitPrice: line.storeUnitPrice ?? line.unitPrice,
    lineTotal: line.qtyToBuy * line.unitPrice,
  };
}

function positivePrice(...candidates: Array<number | undefined>): number {
  for (const n of candidates) {
    if (typeof n === "number" && Number.isFinite(n) && n > 0) return n;
  }
  return 0;
}

export function storeItemToPoLine(
  item: StoreItem,
  qty: number,
  unitPrice: number,
  lineId?: string,
  meta?: {
    purchaseUnit?: string;
    purchaseQty?: number;
    purchaseUnitPrice?: number;
    storeQty?: number;
    storeUnitPrice?: number;
  },
): PoLine {
  const purchaseUnitPrice = positivePrice(
    meta?.purchaseUnitPrice,
    unitPrice,
    item.lastPrice,
  );
  const storeUnitPrice = positivePrice(
    meta?.storeUnitPrice,
    item.lastPrice,
    purchaseUnitPrice,
  );
  return basketLineToPoLine(
    {
      stockItemId: item.id,
      name: item.name,
      dept: storeItemDepartments(item)[0],
      unit: meta?.purchaseUnit ?? item.unit,
      qtyToBuy: meta?.purchaseQty ?? qty,
      unitPrice: purchaseUnitPrice,
      storeUnit: item.unit,
      storeQtyToBuy: meta?.storeQty ?? qty,
      storeUnitPrice,
    },
    lineId,
  );
}

export function recalcPoTotals(lines: PoLine[]): {
  total: number;
  lines: PoLine[];
} {
  const next = lines.map((l) => ({
    ...l,
    lineTotal: l.quantityOrdered * l.unitPrice,
  }));
  const total = next.reduce((s, l) => s + l.lineTotal, 0);
  return { total, lines: next };
}

/**
 * Working PO for a workspace.
 * - kitchen: chef draft / rejected kitchen list
 * - store: store draft/rejected, else kitchen pending_store, else pending_accountant
 */
export function getActivePurchaseOrder(
  orders: PurchaseOrder[],
  origin: PoOrigin = "store",
  workingPoId?: string | null,
): PurchaseOrder | undefined {
  if (workingPoId) {
    const focused = orders.find((p) => p.id === workingPoId);
    if (focused && focused.status !== "retired") return focused;
  }

  const candidates = orders.filter((p) => p.status !== "retired");
  if (!candidates.length) return undefined;

  if (origin === "kitchen") {
    const kitchen = candidates.filter(
      (p) =>
        poOriginOf(p) === "kitchen" &&
        (p.status === "draft" ||
          p.status === "accountant_rejected" ||
          p.status === "manager_rejected"),
    );
    return [...kitchen].sort((a, b) =>
      (b.workflowUpdatedAt || b.createdAt).localeCompare(
        a.workflowUpdatedAt || a.createdAt,
      ),
    )[0];
  }

  const storeDraft = candidates.filter(
    (p) =>
      poOriginOf(p) === "store" &&
      (p.status === "draft" ||
        p.status === "accountant_rejected" ||
        p.status === "manager_rejected"),
  );
  if (storeDraft.length) {
    return [...storeDraft].sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
  }

  const kitchenAtStore = candidates.filter(
    (p) =>
      poOriginOf(p) === "kitchen" &&
      (p.status === "pending_store" ||
        p.status === "accountant_rejected" ||
        p.status === "manager_rejected"),
  );
  if (kitchenAtStore.length) {
    return [...kitchenAtStore].sort((a, b) =>
      (b.workflowUpdatedAt || b.sentToStoreAt || b.createdAt).localeCompare(
        a.workflowUpdatedAt || a.sentToStoreAt || a.createdAt,
      ),
    )[0];
  }

  const atAccountant = candidates.filter((p) => p.status === "pending_accountant");
  if (atAccountant.length) {
    return [...atAccountant].sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
  }

  return [...candidates].sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
}

export function listKitchenOrdersAtStore(orders: PurchaseOrder[]): PurchaseOrder[] {
  return orders
    .filter(
      (p) =>
        poOriginOf(p) === "kitchen" &&
        (p.status === "pending_store" ||
          p.status === "accountant_rejected" ||
          p.status === "manager_rejected"),
    )
    .sort((a, b) =>
      (b.workflowUpdatedAt || b.sentToStoreAt || b.createdAt).localeCompare(
        a.workflowUpdatedAt || a.sentToStoreAt || a.createdAt,
      ),
    );
}

export function listOrdersAwaitingAccountant(orders: PurchaseOrder[]): PurchaseOrder[] {
  const pending = orders
    .filter((p) => p.status === "pending_accountant")
    .sort((a, b) =>
      (a.sentToAccountantAt || a.createdAt).localeCompare(
        b.sentToAccountantAt || b.createdAt,
      ),
    );
  // One PO in the accountant queue at a time; collapse duplicate ids / numbers.
  const seenIds = new Set<string>();
  const seenNumbers = new Set<string>();
  const unique: PurchaseOrder[] = [];
  for (const po of pending) {
    if (seenIds.has(po.id) || seenNumbers.has(po.poNumber)) continue;
    seenIds.add(po.id);
    seenNumbers.add(po.poNumber);
    unique.push(po);
  }
  return unique.slice(0, 1);
}

export function listOrdersAwaitingManager(orders: PurchaseOrder[]): PurchaseOrder[] {
  return orders
    .filter((p) => p.status === "pending_manager")
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export function activePoDisplayLines(
  po: PurchaseOrder | undefined,
  basket: BasketLine[],
): BasketLine[] {
  if (po?.lines.length) return poLinesToBasketLines(po.lines);
  return basket;
}

function formatStampWhen(iso: string | undefined): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function roleLabel(role: string | undefined): string {
  if (!role) return "";
  const key = canonicalRoleKey(role);
  if (!key) return role;
  const map: Record<string, string> = {
    accountant: "Accountant",
    manager: "Manager",
    admin: "Administrator",
    superadmin: "Superadmin",
    store: "Store",
    purchaser: "Purchaser",
  };
  return map[key] || role;
}

export function formatPoActorStamp(po: PurchaseOrder): string {
  const when = po.sentToAccountantAt || po.sentToStoreAt || po.createdAt;
  const who =
    po.sentToAccountantBy || po.sentToStoreBy || po.createdByName || po.createdBy;
  const originLabel = poOriginOf(po) === "kitchen" ? "Kitchen order" : "Store order";
  return `${originLabel} · ${who} · ${formatStampWhen(when)}`;
}

/** Latest approve/reject actor for headers (accountant, manager, admin test). */
export function formatPoDecisionStamp(po: PurchaseOrder): string | null {
  const managerDecisionStatuses = [
    "disbursed",
    "approved",
    "manager_rejected",
    "retirement_pending",
    "retirement_pending_accountant",
    "retirement_rejected",
    "retired",
  ];
  if (po.managerDecidedBy && managerDecisionStatuses.includes(po.status)) {
    const verb = po.status === "manager_rejected" ? "Rejected" : "Approved";
    const role = roleLabel(po.managerDecidedRole);
    return `${verb} by ${po.managerDecidedBy}${role ? ` (${role})` : ""} · ${formatStampWhen(po.managerDecidedAt)}`;
  }
  if (
    po.accountantDecidedBy &&
    [
      "pending_manager",
      "accountant_rejected",
      "manager_rejected",
      "disbursed",
      "approved",
      "retirement_pending",
      "retirement_pending_accountant",
      "retirement_rejected",
      "retired",
    ].includes(po.status)
  ) {
    const verb =
      po.status === "accountant_rejected" ||
      (po.status === "manager_rejected" && !po.managerDecidedBy)
        ? "Rejected"
        : "Accepted";
    const role = roleLabel(po.accountantDecidedRole);
    return `${verb} by ${po.accountantDecidedBy}${role ? ` (${role})` : ""} · ${formatStampWhen(po.accountantDecidedAt)}`;
  }
  return null;
}
