import assert from "node:assert/strict";
import test from "node:test";
import {
  createRetirementLinesFromPo,
  validateRetirementLines,
} from "../lib/supply-chain/retirement-validation";
import type { PurchaseOrder } from "../lib/supply-chain/types";

function errorMessage(result: ReturnType<typeof validateRetirementLines>): string {
  return "error" in result ? result.error : "";
}

function purchaseOrder(): PurchaseOrder {
  return {
    id: "po-1",
    poNumber: "PO-W2026-27",
    weekLabel: "Week of 29 Jun 2026",
    status: "disbursed",
    createdBy: "staff-1",
    createdByName: "Purchasing",
    createdAt: "2026-07-01T10:00:00.000Z",
    cashDisbursed: 10_000,
    totalAmount: 10_000,
    lines: [
      {
        id: "line-rice",
        stockItemId: "rice",
        name: "Rice",
        dept: "kitchen",
        unit: "bag",
        quantityOrdered: 2,
        unitPrice: 5_000,
        storeUnit: "kg",
        stockQuantityOrdered: 100,
        stockUnitPrice: 100,
        lineTotal: 10_000,
      },
    ],
  };
}

test("initializes retirement lines from every PO line", () => {
  const po = purchaseOrder();

  const lines = createRetirementLinesFromPo(po);

  assert.equal(lines.length, 1);
  assert.equal(lines[0].lineId, "line-rice");
  assert.equal(lines[0].quantityBought, 2);
  assert.equal(lines[0].stockQuantityBought, 100);
  assert.equal(lines[0].totalPaid, 10_000);
});

test("rejects an empty retirement submission", () => {
  const result = validateRetirementLines(purchaseOrder(), []);

  assert.deepEqual(result, {
    error: "Add retirement details for every purchase-order line before submitting.",
  });
});

test("rejects missing and invalid bought lines", () => {
  const po = purchaseOrder();
  const lines = createRetirementLinesFromPo(po);

  assert.match(
    errorMessage(validateRetirementLines(po, [{ ...lines[0], lineId: "unknown" }])),
    /every purchase-order line/,
  );
  assert.match(
    errorMessage(validateRetirementLines(po, [{ ...lines[0], quantityBought: 0 }])),
    /greater than zero/,
  );
  assert.match(
    errorMessage(validateRetirementLines(po, [{ ...lines[0], actualPrice: -1 }])),
    /non-negative actual price/,
  );
});

test("accepts a valid initialized retirement and computes stock pricing", () => {
  const po = purchaseOrder();
  const lines = createRetirementLinesFromPo(po);

  const result = validateRetirementLines(po, [
    { ...lines[0], quantityBought: 1, actualPrice: 6_000, stockQuantityBought: 50 },
  ]);

  assert.ok("ok" in result);
  assert.equal(result.actualSpent, 6_000);
  assert.equal(result.refundToCashier, 4_000);
  assert.equal(result.priceChanges, 1);
  assert.equal(result.lines[0].totalPaid, 6_000);
  assert.equal(result.lines[0].actualStockUnitPrice, 120);
});
