import assert from "node:assert/strict";
import test from "node:test";

import { resolveKitchenBatchLinkIds } from "../lib/supply-chain/kitchen-batch-link-ids";

test("preserves existing recipe and kitchen stock links when saving by name", () => {
  const result = resolveKitchenBatchLinkIds({
    batchName: "Chicken Stock",
    recipes: [{ id: "rcp-original-chicken-stock", name: "Chicken Stock" }],
    kitchenStock: [
      {
        id: "ks-original-chicken-stock",
        linkedRecipeId: "rcp-original-chicken-stock",
      },
    ],
  });

  assert.deepEqual(result, {
    recipeId: "rcp-original-chicken-stock",
    kitchenStockId: "ks-original-chicken-stock",
  });
});

test("uses slugged ids for a new batch standard", () => {
  const result = resolveKitchenBatchLinkIds({
    batchName: "Pepper Soup",
    recipes: [],
    kitchenStock: [],
  });

  assert.deepEqual(result, {
    recipeId: "rcp-pepper-soup",
    kitchenStockId: "ks-pepper-soup",
  });
});

test("keeps an explicit kitchen stock id while preserving an existing recipe id", () => {
  const result = resolveKitchenBatchLinkIds({
    batchName: "Chicken Stock",
    inputKitchenStockId: "ks-explicit-stock",
    recipes: [{ id: "rcp-original-chicken-stock", name: "Chicken Stock" }],
    kitchenStock: [
      {
        id: "ks-original-chicken-stock",
        linkedRecipeId: "rcp-original-chicken-stock",
      },
    ],
  });

  assert.deepEqual(result, {
    recipeId: "rcp-original-chicken-stock",
    kitchenStockId: "ks-explicit-stock",
  });
});
