import type {
  BasketLine,
  PoLine,
  PoLineEditEvent,
  PoOrigin,
  PoStatus,
  PurchaseOrder,
  StoreItem,
} from "./types";
import { storeItemDepartments } from "./types";
import { canonicalRoleKey } from "@/lib/permissions";
import { isPurchaseOrderHistoryStatus, resolvePoDisplayStatus } from "./po-format";

type LineActor = { name: string; role: string };

const LINE_EDIT_CAP = 40;

/** PO still in the store / accounting pipeline (only one store draft at a time; kitchen may coexist). */
export function isActiveStorePurchaseOrderStatus(status: PoStatus): boolean {
  return status !== "retired";
}

export function poOriginOf(po: PurchaseOrder | undefined | null): PoOrigin {
  return po?.origin === "kitchen" ? "kitchen" : "store";
}

/** Soft-deleted POs stay in snapshots as tombstones so sync cannot resurrect them. */
export function isPurchaseOrderDeleted(
  po: PurchaseOrder | undefined | null,
): boolean {
  return Boolean(po?.deletedAt);
}

export function visiblePurchaseOrders(orders: PurchaseOrder[]): PurchaseOrder[] {
  return orders.filter((p) => !isPurchaseOrderDeleted(p));
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
  if (isPurchaseOrderDeleted(po)) return false;
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
  if (!po || isPurchaseOrderDeleted(po)) return false;
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

/** Store draft list visible on Purchase orders tab (until sent to accountant). */
export function showsStoreDraftPurchaseList(
  po: PurchaseOrder | undefined,
): boolean {
  if (!po) return true;
  // Use healed display status so a PO that was already sent/approved is not
  // stuck in the "Awaiting store (kitchen)" draft editor after sync lag.
  const status = resolvePoDisplayStatus(po);
  return (
    status === "draft" ||
    status === "pending_store" ||
    status === "accountant_rejected" ||
    status === "manager_rejected"
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
    addedBy: l.addedBy,
    addedAt: l.addedAt,
    lastEditedBy: l.lastEditedBy,
    lastEditedAt: l.lastEditedAt,
    lastEditedRole: l.lastEditedRole,
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
    addedBy: line.addedBy,
    addedAt: line.addedAt,
    lastEditedBy: line.lastEditedBy,
    lastEditedAt: line.lastEditedAt,
    lastEditedRole: line.lastEditedRole,
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
 * - store: prefer the store's own draft (so chef send cannot steal the cart on refresh);
 *   fall back to kitchen pending_store when store has no in-progress lines; kitchen lists
 *   also stay in `listKitchenOrdersAtStore` for explicit selection.
 */
export function getActivePurchaseOrder(
  orders: PurchaseOrder[],
  origin: PoOrigin = "store",
  workingPoId?: string | null,
): PurchaseOrder | undefined {
  if (workingPoId) {
    const focused = orders.find((p) => p.id === workingPoId);
    if (
      focused &&
      !isPurchaseOrderDeleted(focused) &&
      !isPurchaseOrderHistoryStatus(focused.status)
    ) {
      return focused;
    }
  }

  const candidates = orders.filter(
    (p) =>
      !isPurchaseOrderHistoryStatus(p.status) && !isPurchaseOrderDeleted(p),
  );
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
  // Concurrent kitchen + store: keep the store cart when it already has lines.
  const storeWithLines = storeDraft.filter((p) => p.lines.length > 0);
  if (storeWithLines.length) {
    return [...storeWithLines].sort((a, b) =>
      (b.workflowUpdatedAt || b.createdAt).localeCompare(
        a.workflowUpdatedAt || a.createdAt,
      ),
    )[0];
  }

  // No store lines yet — open kitchen inbox so store can review Send-to-store lists.
  const kitchenAtStore = candidates.filter(
    (p) =>
      poOriginOf(p) === "kitchen" &&
      p.lines.length > 0 &&
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

  if (storeDraft.length) {
    return [...storeDraft].sort((a, b) =>
      (b.workflowUpdatedAt || b.createdAt).localeCompare(
        a.workflowUpdatedAt || a.createdAt,
      ),
    )[0];
  }

  const atAccountant = candidates.filter((p) => p.status === "pending_accountant");
  if (atAccountant.length) {
    return [...atAccountant].sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
  }

  return [...candidates].sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
}

/** Store-origin draft/rejected list (newest first). Used so Raise PO never hijacks kitchen inbox. */
export function listStoreDraftPurchaseOrders(
  orders: PurchaseOrder[],
): PurchaseOrder[] {
  return orders
    .filter(
      (p) =>
        !isPurchaseOrderDeleted(p) &&
        poOriginOf(p) === "store" &&
        (p.status === "draft" ||
          p.status === "accountant_rejected" ||
          p.status === "manager_rejected"),
    )
    .sort((a, b) =>
      (b.workflowUpdatedAt || b.createdAt).localeCompare(
        a.workflowUpdatedAt || a.createdAt,
      ),
    );
}

/**
 * PO that store Raise / cart mutations should edit.
 * Explicit `workingPoId` (e.g. Open kitchen list) wins; otherwise stay on the store draft
 * even when a kitchen pending_store PO is the display fallback.
 */
export function getStoreCartMutationTarget(
  orders: PurchaseOrder[],
  workingPoId?: string | null,
): PurchaseOrder | undefined {
  if (workingPoId) {
    const focused = orders.find((p) => p.id === workingPoId);
    if (
      focused &&
      focused.status !== "retired" &&
      !isPurchaseOrderDeleted(focused) &&
      canEditStorePurchaseOrder(focused)
    ) {
      return focused;
    }
  }
  return listStoreDraftPurchaseOrders(orders)[0];
}

export function listKitchenOrdersAtStore(orders: PurchaseOrder[]): PurchaseOrder[] {
  return orders
    .filter(
      (p) =>
        !isPurchaseOrderDeleted(p) &&
        poOriginOf(p) === "kitchen" &&
        p.lines.length > 0 &&
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

/**
 * Merge two PO line lists by stock item. Quantities add; prefer a positive unit price.
 * Used when store sends kitchen + store drafts to accountant as one list.
 */
export function mergePoLineLists(base: PoLine[], extra: PoLine[]): PoLine[] {
  const byStock = new Map<string, PoLine>();
  for (const line of [...base, ...extra]) {
    if (!line?.stockItemId) continue;
    const existing = byStock.get(line.stockItemId);
    if (!existing) {
      byStock.set(line.stockItemId, { ...line });
      continue;
    }
    const quantityOrdered =
      (Number(existing.quantityOrdered) || 0) + (Number(line.quantityOrdered) || 0);
    const stockQuantityOrdered =
      (Number(existing.stockQuantityOrdered ?? existing.quantityOrdered) || 0) +
      (Number(line.stockQuantityOrdered ?? line.quantityOrdered) || 0);
    const unitPrice =
      existing.unitPrice > 0
        ? existing.unitPrice
        : line.unitPrice > 0
          ? line.unitPrice
          : 0;
    const stockUnitPrice =
      (existing.stockUnitPrice ?? 0) > 0
        ? (existing.stockUnitPrice as number)
        : (line.stockUnitPrice ?? 0) > 0
          ? (line.stockUnitPrice as number)
          : unitPrice;
    byStock.set(line.stockItemId, {
      ...existing,
      ...line,
      id: existing.id,
      quantityOrdered,
      stockQuantityOrdered,
      unitPrice,
      stockUnitPrice,
      unit: existing.unit || line.unit,
      storeUnit: existing.storeUnit || line.storeUnit,
      addedBy: existing.addedBy ?? line.addedBy,
      addedAt: existing.addedAt ?? line.addedAt,
      lastEditedBy: line.lastEditedBy ?? existing.lastEditedBy,
      lastEditedAt: line.lastEditedAt ?? existing.lastEditedAt,
      lastEditedRole: line.lastEditedRole ?? existing.lastEditedRole,
      lineTotal: quantityOrdered * unitPrice,
    });
  }
  return recalcPoTotals([...byStock.values()]).lines;
}

/**
 * When store sends to accountant, also pull in the sibling list so chef + store
 * lines go as one PO (Open & edit alone must not leave the other draft behind).
 */
export function companionPurchaseOrdersForStoreSend(
  orders: PurchaseOrder[],
  active: PurchaseOrder | undefined,
): PurchaseOrder[] {
  if (!active || isPurchaseOrderDeleted(active)) return [];
  if (poOriginOf(active) === "kitchen") {
    return listStoreDraftPurchaseOrders(orders).filter(
      (p) => p.id !== active.id && p.lines.length > 0,
    );
  }
  return listKitchenOrdersAtStore(orders).filter(
    (p) => p.id !== active.id && p.lines.length > 0,
  );
}

export function listOrdersAwaitingAccountant(orders: PurchaseOrder[]): PurchaseOrder[] {
  const pending = orders
    .filter((p) => !isPurchaseOrderDeleted(p) && p.status === "pending_accountant")
    .sort((a, b) =>
      (a.sentToAccountantAt || a.createdAt).localeCompare(
        b.sentToAccountantAt || b.createdAt,
      ),
    );
  // One PO in the accountant queue at a time; collapse duplicate ids only
  // (legacy week-only poNumbers are not unique across store vs kitchen).
  const seenIds = new Set<string>();
  const unique: PurchaseOrder[] = [];
  for (const po of pending) {
    if (seenIds.has(po.id)) continue;
    seenIds.add(po.id);
    unique.push(po);
  }
  return unique.slice(0, 1);
}

export function listOrdersAwaitingManager(orders: PurchaseOrder[]): PurchaseOrder[] {
  return orders
    .filter((p) => !isPurchaseOrderDeleted(p) && p.status === "pending_manager")
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
    chef: "Chef",
    auditor: "Auditor",
  };
  return map[key] || role;
}

function lineChangeDetail(prev: PoLine | undefined, next: PoLine): string {
  if (!prev) {
    return `qty ${next.quantityOrdered} · ₦${next.unitPrice.toLocaleString()}/${next.unit}`;
  }
  const parts: string[] = [];
  if (prev.quantityOrdered !== next.quantityOrdered) {
    parts.push(`qty ${prev.quantityOrdered}→${next.quantityOrdered}`);
  }
  if (prev.unitPrice !== next.unitPrice) {
    parts.push(
      `price ₦${prev.unitPrice.toLocaleString()}→₦${next.unitPrice.toLocaleString()}`,
    );
  }
  if (prev.unit !== next.unit) {
    parts.push(`unit ${prev.unit}→${next.unit}`);
  }
  return parts.join(" · ") || "updated";
}

/** Stamp added/last-edited fields on a line when qty/price/unit change. */
export function stampPoLineEdit(
  line: PoLine,
  actor: LineActor,
  prev?: PoLine,
): { line: PoLine; changed: boolean; event: PoLineEditEvent | null } {
  const now = new Date().toISOString();
  if (!prev) {
    const stamped: PoLine = {
      ...line,
      addedBy: actor.name,
      addedAt: now,
      lastEditedBy: actor.name,
      lastEditedAt: now,
      lastEditedRole: actor.role,
    };
    return {
      line: stamped,
      changed: true,
      event: {
        at: now,
        by: actor.name,
        role: actor.role,
        action: "added",
        stockItemId: line.stockItemId,
        name: line.name,
        detail: lineChangeDetail(undefined, stamped),
      },
    };
  }

  const changed =
    prev.quantityOrdered !== line.quantityOrdered ||
    prev.unitPrice !== line.unitPrice ||
    prev.unit !== line.unit ||
    (prev.stockQuantityOrdered ?? prev.quantityOrdered) !==
      (line.stockQuantityOrdered ?? line.quantityOrdered);

  if (!changed) {
    return {
      line: {
        ...line,
        addedBy: prev.addedBy,
        addedAt: prev.addedAt,
        lastEditedBy: prev.lastEditedBy,
        lastEditedAt: prev.lastEditedAt,
        lastEditedRole: prev.lastEditedRole,
      },
      changed: false,
      event: null,
    };
  }

  const stamped: PoLine = {
    ...line,
    addedBy: prev.addedBy ?? actor.name,
    addedAt: prev.addedAt ?? now,
    lastEditedBy: actor.name,
    lastEditedAt: now,
    lastEditedRole: actor.role,
  };
  return {
    line: stamped,
    changed: true,
    event: {
      at: now,
      by: actor.name,
      role: actor.role,
      action: "updated",
      stockItemId: line.stockItemId,
      name: line.name,
      detail: lineChangeDetail(prev, stamped),
    },
  };
}

export function appendPoLineEdits(
  po: PurchaseOrder,
  events: PoLineEditEvent[],
  actor?: LineActor,
): Pick<
  PurchaseOrder,
  "lineEdits" | "linesLastEditedBy" | "linesLastEditedAt" | "linesLastEditedRole" | "workflowUpdatedAt"
> {
  if (!events.length) {
    return {
      lineEdits: po.lineEdits,
      linesLastEditedBy: po.linesLastEditedBy,
      linesLastEditedAt: po.linesLastEditedAt,
      linesLastEditedRole: po.linesLastEditedRole,
      workflowUpdatedAt: po.workflowUpdatedAt,
    };
  }
  const latest = events[0];
  const who = actor ?? { name: latest.by, role: latest.role ?? "" };
  return {
    lineEdits: [...events, ...(po.lineEdits ?? [])].slice(0, LINE_EDIT_CAP),
    linesLastEditedBy: who.name,
    linesLastEditedAt: latest.at,
    linesLastEditedRole: who.role,
    workflowUpdatedAt: latest.at,
  };
}

export function formatPoLinesEditStamp(po: PurchaseOrder): string | null {
  if (!po.linesLastEditedBy || !po.linesLastEditedAt) return null;
  const role = roleLabel(po.linesLastEditedRole);
  return `Lines last edited by ${po.linesLastEditedBy}${role ? ` (${role})` : ""} · ${formatStampWhen(po.linesLastEditedAt)}`;
}

export function formatPoLineEditorStamp(
  line: Pick<
    PoLine,
    | "lastEditedBy"
    | "lastEditedAt"
    | "lastEditedRole"
    | "addedBy"
    | "addedAt"
  >,
): string | null {
  if (line.lastEditedBy && line.lastEditedAt) {
    const role = roleLabel(line.lastEditedRole);
    return `Edited by ${line.lastEditedBy}${role ? ` (${role})` : ""} · ${formatStampWhen(line.lastEditedAt)}`;
  }
  if (line.addedBy && line.addedAt) {
    return `Added by ${line.addedBy} · ${formatStampWhen(line.addedAt)}`;
  }
  return null;
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
