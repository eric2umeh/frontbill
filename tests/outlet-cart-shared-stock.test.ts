import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { OutletMenuItemRow } from "../lib/outlets/types";
import type { BarStockItem, KitchenStockItem } from "../lib/supply-chain/types";
import {
  remainingSellableQtyAfterCart,
  resolveOutletItemStock,
  validateOutletCartStock,
} from "../lib/outlets/outlet-supply-stock";

function menuItem(
  partial: Pick<OutletMenuItemRow, "id" | "name" | "department"> &
    Partial<OutletMenuItemRow>,
): OutletMenuItemRow {
  return {
    organization_id: "org",
    category_id: null,
    description: "",
    unit_price: 2500,
    sku: null,
    tags: [],
    is_active: true,
    sort_order: 0,
    service_code: null,
    created_at: "2026-09-19T00:00:00.000Z",
    updated_at: "2026-09-19T00:00:00.000Z",
    ...partial,
  };
}

const kitchenFriedRice: KitchenStockItem = {
  id: "ks-fried-rice",
  name: "Fried Rice",
  source: "produced",
  availablePortions: 10,
  reorderLevel: 0,
  unit: "portion",
};

const barStout: BarStockItem = {
  id: "bar-stout",
  storeItemId: "stout",
  name: "Stout",
  quantityOnHand: 6,
  reorderLevel: 0,
  unitsPerSale: 1,
  unit: "bottle",
};

describe("resolveOutletItemStock name sharing", () => {
  it("links Special Fried Rice to the Fried Rice kitchen row", () => {
    const special = menuItem({
      id: "mi-special",
      name: "Special Fried Rice",
      department: "restaurant",
    });
    const link = resolveOutletItemStock(
      special,
      "restaurant",
      [kitchenFriedRice],
      [],
    );
    assert.equal(link.tracked, true);
    assert.equal(link.stockId, "ks-fried-rice");
    assert.equal(link.available, 10);
  });
});

describe("validateOutletCartStock", () => {
  it("allows selling the full on-hand of one kitchen item", () => {
    const fried = menuItem({
      id: "mi-fried",
      name: "Fried Rice",
      department: "restaurant",
    });
    const result = validateOutletCartStock(
      "restaurant",
      [{ item: fried, qty: 10 }],
      [kitchenFriedRice],
      [],
    );
    assert.equal(result.ok, true);
  });

  it("rejects a single line that exceeds on-hand", () => {
    const fried = menuItem({
      id: "mi-fried",
      name: "Fried Rice",
      department: "restaurant",
    });
    const result = validateOutletCartStock(
      "restaurant",
      [{ item: fried, qty: 11 }],
      [kitchenFriedRice],
      [],
    );
    assert.equal("error" in result, true);
    if (!("error" in result)) return;
    assert.match(result.error, /Fried Rice/);
    assert.equal(result.shortages[0].onHand, 10);
    assert.equal(result.shortages[0].need, 11);
  });

  it("rejects Fried Rice + Special Fried Rice that together exceed kitchen portions", () => {
    const fried = menuItem({
      id: "mi-fried",
      name: "Fried Rice",
      department: "restaurant",
    });
    const special = menuItem({
      id: "mi-special",
      name: "Special Fried Rice",
      department: "restaurant",
    });
    const result = validateOutletCartStock(
      "restaurant",
      [
        { item: fried, qty: 10 },
        { item: special, qty: 1 },
      ],
      [kitchenFriedRice],
      [],
    );
    assert.equal("error" in result, true);
    if (!("error" in result)) return;
    assert.match(result.error, /Special Fried Rice/);
    assert.equal(result.shortages[0].need, 11);
    assert.equal(result.shortages[0].onHand, 10);
  });

  it("allows two kitchen dishes that share stock when the combined qty fits", () => {
    const fried = menuItem({
      id: "mi-fried",
      name: "Fried Rice",
      department: "restaurant",
    });
    const special = menuItem({
      id: "mi-special",
      name: "Special Fried Rice",
      department: "restaurant",
    });
    const result = validateOutletCartStock(
      "restaurant",
      [
        { item: fried, qty: 6 },
        { item: special, qty: 4 },
      ],
      [kitchenFriedRice],
      [],
    );
    assert.equal(result.ok, true);
  });

  it("rejects a stout single + bucket that together exceed bar on-hand", () => {
    const single = menuItem({
      id: "mi-stout",
      name: "Stout",
      department: "main_bar",
      service_code: "bar:bar-stout:1",
    });
    const bucket = menuItem({
      id: "mi-stout-bucket",
      name: "Stout bucket",
      department: "main_bar",
      service_code: "bar:bar-stout:6",
    });
    const result = validateOutletCartStock(
      "main_bar",
      [
        { item: single, qty: 6 },
        { item: bucket, qty: 1 },
      ],
      [],
      [barStout],
    );
    assert.equal("error" in result, true);
    if (!("error" in result)) return;
    assert.match(result.error, /Stout bucket/);
    assert.equal(result.shortages[0].need, 12);
    assert.equal(result.shortages[0].onHand, 6);
  });

  it("allows a stout bucket when on-hand is exactly 6", () => {
    const bucket = menuItem({
      id: "mi-stout-bucket",
      name: "Stout bucket",
      department: "main_bar",
      service_code: "bar:bar-stout:6",
    });
    const result = validateOutletCartStock(
      "main_bar",
      [{ item: bucket, qty: 1 }],
      [],
      [barStout],
    );
    assert.equal(result.ok, true);
  });

  it("does not mix unrelated kitchen stock rows", () => {
    const fried = menuItem({
      id: "mi-fried",
      name: "Fried Rice",
      department: "restaurant",
    });
    const jollof = menuItem({
      id: "mi-jollof",
      name: "Jollof",
      department: "restaurant",
    });
    const result = validateOutletCartStock(
      "restaurant",
      [
        { item: fried, qty: 10 },
        { item: jollof, qty: 8 },
      ],
      [
        kitchenFriedRice,
        {
          id: "ks-jollof",
          name: "Jollof",
          source: "produced",
          availablePortions: 8,
          reorderLevel: 0,
        },
      ],
      [],
    );
    assert.equal(result.ok, true);
  });
});

describe("remainingSellableQtyAfterCart", () => {
  it("returns 0 for Special Fried Rice after the cart already took all Fried Rice portions", () => {
    const fried = menuItem({
      id: "mi-fried",
      name: "Fried Rice",
      department: "restaurant",
    });
    const special = menuItem({
      id: "mi-special",
      name: "Special Fried Rice",
      department: "restaurant",
    });
    const remaining = remainingSellableQtyAfterCart(
      "restaurant",
      special,
      [{ item: fried, qty: 10 }],
      [kitchenFriedRice],
      [],
    );
    assert.equal(remaining, 0);
  });

  it("returns leftover portions after a partial shared-stock cart", () => {
    const fried = menuItem({
      id: "mi-fried",
      name: "Fried Rice",
      department: "restaurant",
    });
    const special = menuItem({
      id: "mi-special",
      name: "Special Fried Rice",
      department: "restaurant",
    });
    const remaining = remainingSellableQtyAfterCart(
      "restaurant",
      special,
      [{ item: fried, qty: 4 }],
      [kitchenFriedRice],
      [],
    );
    assert.equal(remaining, 6);
  });

  it("counts a stout bucket as 6 bottles already reserved", () => {
    const single = menuItem({
      id: "mi-stout",
      name: "Stout",
      department: "main_bar",
      service_code: "bar:bar-stout:1",
    });
    const bucket = menuItem({
      id: "mi-stout-bucket",
      name: "Stout bucket",
      department: "main_bar",
      service_code: "bar:bar-stout:6",
    });
    const remaining = remainingSellableQtyAfterCart(
      "main_bar",
      single,
      [{ item: bucket, qty: 1 }],
      [],
      [barStout],
    );
    assert.equal(remaining, 0);
  });
});
