import type {
  BasketLine,
  PoLine,
  PoStatus,
  PurchaseOrder,
  StoreItem,
} from "./types";

/** PO still in the store / accounting pipeline (only one allowed at a time). */
export function isActiveStorePurchaseOrderStatus(status: PoStatus): boolean {
  return status !== "retired";
}

export function canEditStorePurchaseOrder(
  po: PurchaseOrder | undefined,
): boolean {
  if (!po) return true;
  return po.status === "draft" || po.status === "accountant_rejected";
}

export function canDeleteStorePurchaseOrder(
  po: PurchaseOrder | undefined,
): boolean {
  if (!po) return false;
  return ["draft", "accountant_rejected", "retirement_rejected"].includes(po.status);
}

export function isPurchaseOrderAwaitingAccountant(
  po: PurchaseOrder | undefined,
): boolean {
  return po?.status === "pending_accountant";
}

/** Store draft list visible on Purchase orders tab (until accountant accepts). */
export function showsStoreDraftPurchaseList(
  po: PurchaseOrder | undefined,
): boolean {
  if (!po) return true;
  return (
    po.status === "draft" ||
    po.status === "pending_accountant" ||
    po.status === "accountant_rejected"
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
    lineTotal: line.qtyToBuy * line.unitPrice,
  };
}

export function storeItemToPoLine(
  item: StoreItem,
  qty: number,
  unitPrice: number,
  lineId?: string,
): PoLine {
  return basketLineToPoLine(
    {
      stockItemId: item.id,
      name: item.name,
      dept: item.dept,
      unit: item.unit,
      qtyToBuy: qty,
      unitPrice,
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

/** The single non-retired PO (newest if legacy data has more than one). */
export function getActivePurchaseOrder(
  orders: PurchaseOrder[],
): PurchaseOrder | undefined {
  const active = orders.filter((p) =>
    isActiveStorePurchaseOrderStatus(p.status),
  );
  if (!active.length) return undefined;
  return [...active].sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
}

export function activePoDisplayLines(
  po: PurchaseOrder | undefined,
  basket: BasketLine[],
): BasketLine[] {
  if (po?.lines.length) return poLinesToBasketLines(po.lines);
  return basket;
}
