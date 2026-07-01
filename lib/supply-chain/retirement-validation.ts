import type { PurchaseOrder, RetirementLine } from "./types";

type RetirementValidationResult =
  | {
      ok: true;
      lines: RetirementLine[];
      actualSpent: number;
      refundToCashier: number;
      priceChanges: number;
    }
  | { error: string };

function isFiniteNonNegative(value: number): boolean {
  return Number.isFinite(value) && value >= 0;
}

function lineNotBought(line: RetirementLine): boolean {
  return line.notBought === true || line.removed === true;
}

export function createRetirementLinesFromPo(po: PurchaseOrder): RetirementLine[] {
  return po.lines.map((line) => ({
    lineId: line.id,
    name: line.name,
    unit: line.unit,
    storeUnit: line.storeUnit,
    quantityOrdered: line.quantityOrdered,
    stockQuantityOrdered: line.stockQuantityOrdered,
    quantityBought: line.quantityOrdered,
    stockQuantityBought: line.stockQuantityOrdered,
    poPrice: line.unitPrice,
    actualPrice: line.unitPrice,
    actualStockUnitPrice: line.stockUnitPrice,
    totalPaid: line.quantityOrdered * line.unitPrice,
    notBought: false,
  }));
}

export function validateRetirementLines(
  po: PurchaseOrder,
  lines: RetirementLine[],
): RetirementValidationResult {
  if (!po.lines.length) {
    return { error: "Cannot retire a purchase order with no line items." };
  }
  if (!lines.length) {
    return { error: "Add retirement details for every purchase-order line before submitting." };
  }

  const submittedByLineId = new Map<string, RetirementLine>();
  for (const line of lines) {
    if (submittedByLineId.has(line.lineId)) {
      return { error: "Retirement contains duplicate line items. Refresh and try again." };
    }
    submittedByLineId.set(line.lineId, line);
  }

  const normalized: RetirementLine[] = [];
  for (const poLine of po.lines) {
    const line = submittedByLineId.get(poLine.id);
    if (!line) {
      return { error: "Retirement must include every purchase-order line." };
    }

    const notBought = lineNotBought(line);
    if (notBought) {
      normalized.push({
        ...line,
        name: line.name || poLine.name,
        unit: line.unit ?? poLine.unit,
        storeUnit: line.storeUnit ?? poLine.storeUnit,
        quantityOrdered: poLine.quantityOrdered,
        stockQuantityOrdered: poLine.stockQuantityOrdered,
        poPrice: poLine.unitPrice,
        quantityBought: 0,
        stockQuantityBought: 0,
        actualPrice: isFiniteNonNegative(line.actualPrice) ? line.actualPrice : poLine.unitPrice,
        actualStockUnitPrice: 0,
        totalPaid: 0,
        notBought: true,
        removed: line.removed,
      });
      continue;
    }

    if (!isFiniteNonNegative(line.quantityBought) || line.quantityBought <= 0) {
      return { error: `${poLine.name} must have a bought quantity greater than zero, or be marked not bought.` };
    }
    if (!isFiniteNonNegative(line.actualPrice)) {
      return { error: `${poLine.name} must have a valid non-negative actual price.` };
    }

    const stockQuantityBought =
      line.stockQuantityBought ??
      (poLine.stockQuantityOrdered && poLine.quantityOrdered > 0
        ? (line.quantityBought / poLine.quantityOrdered) * poLine.stockQuantityOrdered
        : line.quantityBought);
    if (!isFiniteNonNegative(stockQuantityBought) || stockQuantityBought <= 0) {
      return { error: `${poLine.name} must resolve to a stock quantity greater than zero.` };
    }

    const totalPaid = line.quantityBought * line.actualPrice;
    const actualStockUnitPrice =
      stockQuantityBought > 0 ? totalPaid / stockQuantityBought : line.actualPrice;
    normalized.push({
      ...line,
      name: line.name || poLine.name,
      unit: line.unit ?? poLine.unit,
      storeUnit: line.storeUnit ?? poLine.storeUnit,
      quantityOrdered: poLine.quantityOrdered,
      stockQuantityOrdered: poLine.stockQuantityOrdered,
      quantityBought: line.quantityBought,
      stockQuantityBought,
      poPrice: poLine.unitPrice,
      actualPrice: line.actualPrice,
      actualStockUnitPrice,
      totalPaid,
      notBought: false,
    });
  }

  const actualSpent = normalized
    .filter((line) => !line.notBought)
    .reduce((sum, line) => sum + line.totalPaid, 0);

  return {
    ok: true,
    lines: normalized,
    actualSpent,
    refundToCashier: po.cashDisbursed - actualSpent,
    priceChanges: normalized.filter((line) => !line.notBought && line.poPrice !== line.actualPrice).length,
  };
}
