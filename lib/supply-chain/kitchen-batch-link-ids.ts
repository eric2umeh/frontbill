import { outletStockSlug } from "../outlets/outlet-stock-slug";
import type { KitchenStockItem, Recipe } from "./types";

export function resolveKitchenBatchLinkIds({
  batchName,
  inputKitchenStockId,
  recipes,
  kitchenStock,
}: {
  batchName: string;
  inputKitchenStockId?: string;
  recipes: Pick<Recipe, "id" | "name">[];
  kitchenStock: Pick<KitchenStockItem, "id" | "linkedRecipeId">[];
}): { recipeId: string; kitchenStockId: string } {
  const slug = outletStockSlug(batchName);
  const fallbackRecipeId = `rcp-${slug}`;
  const existingRecipe = recipes.find((r) => r.id === fallbackRecipeId || r.name === batchName);
  const recipeId = existingRecipe?.id ?? fallbackRecipeId;
  const existingStock = kitchenStock.find((k) => k.linkedRecipeId === recipeId);
  const kitchenStockId = inputKitchenStockId?.trim() || existingStock?.id || `ks-${slug}`;

  return { recipeId, kitchenStockId };
}
