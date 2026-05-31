import type { Recipe } from './types'

export function recipeTotalCost(recipe: Recipe): number {
  const ingredients = recipe.ingredients.reduce((s, i) => s + i.cost, 0)
  return ingredients + recipe.overheadCost
}

export function recipeCostPerPortion(recipe: Recipe): number {
  if (recipe.yieldPortions <= 0) return 0
  return Math.round(recipeTotalCost(recipe) / recipe.yieldPortions)
}

export function recipeRevenueTotal(recipe: Recipe): number {
  return recipe.sellingPricePerPortion * recipe.yieldPortions
}

export function recipeProfit(recipe: Recipe): number {
  return recipeRevenueTotal(recipe) - recipeTotalCost(recipe)
}

export function recipeGrossMarginPct(recipe: Recipe): number {
  const rev = recipeRevenueTotal(recipe)
  if (rev <= 0) return 0
  return Math.round((recipeProfit(recipe) / rev) * 1000) / 10
}

export function priceVariancePct(last: number, benchmark: number): number {
  if (benchmark <= 0) return 0
  return Math.round(((last - benchmark) / benchmark) * 1000) / 10
}

export function calcVat(subtotal: number, rate = 0.075): number {
  return Math.round(subtotal * rate)
}
